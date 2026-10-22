import neo4j, { type Driver } from 'neo4j-driver';
import { Text2CypherError, reportShape, type ChatMessage, type SchemaNames, type Text2Cypher } from '../text2cypher.js';
import { contextSchema, type BuildContext, type Catalogue, type ReportSpec, type ReportTypeDef } from './catalogue.js';
import { formatCypher } from './format.js';
import {
  checkColumns,
  checkReportRows,
  checkSettings,
  checkSpec,
  closest,
  describeKind,
  describeProblems,
  findType,
  type Problem,
  type ProbeResult,
  type ValueKind,
} from './validate.js';

// Build with AI: builds a report (type, title, query, fields, settings) from a description, or
// suggests reports for a dashboard. The model's answers are checked step by step - their shape
// against the report types the dashboard has, the query with EXPLAIN (read-only, known labels,
// relationship types and properties) and a short read-only run (rows, and the right kind of value in
// each field) - and every problem goes back to the model, with the allowed values, until the report
// is right or the attempts run out. Nothing unchecked reaches the browser.

export interface BuilderOptions {
  /** Answers the model may give per step (the first plus corrections). */
  maxAttempts: number;
  /** How long the query's trial run may take. */
  probeTimeoutSeconds: number;
}

/** What the builder needs from the database; tests replace it. */
export interface CypherChecks {
  explain(
    database: string,
    query: string,
    parameters: Record<string, unknown>
  ): Promise<{ error?: string; queryType?: string; unknown: { kind: string; name: string }[] }>;
  probe(
    database: string,
    query: string,
    parameters: Record<string, unknown>,
    timeoutSeconds: number
  ): Promise<ProbeResult | { error: string }>;
}

export class BuildError extends Error {
  constructor(
    message: string,
    public readonly problems: Problem[],
    public readonly lastAnswer?: string
  ) {
    super(message);
  }
}

const PROBE_ROWS = 25;

/** Ends the work when its caller has stopped it. */
function stopped(stop?: AbortSignal) {
  if (stop?.aborted) throw new Text2CypherError('Stopped', 'stopped');
}

/** The kind of a value returned by Neo4j. */
export function kindOf(value: unknown): ValueKind | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' || neo4j.isInt(value)) return 'number';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (neo4j.isNode(value as any)) return 'node';
  if (neo4j.isRelationship(value as any)) return 'relationship';
  if (neo4j.isPath(value as any)) return 'path';
  if (
    neo4j.isDate(value as any) ||
    neo4j.isDateTime(value as any) ||
    neo4j.isLocalDateTime(value as any) ||
    neo4j.isTime(value as any) ||
    neo4j.isLocalTime(value as any) ||
    neo4j.isDuration(value as any)
  )
    return 'datetime';
  if (neo4j.isPoint(value as any)) return 'point';
  if (Array.isArray(value)) return 'list';
  return 'map';
}

const MISSING = /the missing (label name|relationship type|property name) is: ([^)]+)\)/i;

const toNumber = (v: any) => (neo4j.isInt(v) ? v.toNumber() : v);

/** Coordinates of a node, from latitude/longitude properties or a point property. */
const coordinatesOf = (properties: Record<string, any>) => {
  const lat = properties.latitude ?? properties.lat;
  const lon = properties.longitude ?? properties.long ?? properties.lon ?? properties.lng;
  if (lat !== undefined && lon !== undefined) return { lat: Number(toNumber(lat)), lon: Number(toNumber(lon)) };
  for (const value of Object.values(properties)) {
    if (neo4j.isPoint(value as any)) return { lat: Number((value as any).y), lon: Number((value as any).x) };
  }
  return {};
};

/**
 * A value from Neo4j as plain JSON for a preview: numbers, text, dates as text, nodes and
 * relationships as just enough to draw them.
 */
export function plainValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (neo4j.isInt(value)) return (value as any).toNumber();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (neo4j.isNode(value as any)) {
    const node = value as any;
    return { node: node.labels?.[0] ?? '', id: node.elementId, ...coordinatesOf(node.properties ?? {}) };
  }
  if (neo4j.isRelationship(value as any)) {
    const rel = value as any;
    // Its numeric properties too: a Sankey's flows are sized by one of them.
    const numbers = Object.entries(rel.properties ?? {})
      .filter(([, v]) => typeof v === 'number' || neo4j.isInt(v))
      .slice(0, 10)
      .map(([k, v]) => [k, toNumber(v)]);
    return {
      rel: rel.type,
      start: rel.startNodeElementId,
      end: rel.endNodeElementId,
      numbers: Object.fromEntries(numbers),
    };
  }
  if (neo4j.isPath(value as any)) {
    const path = value as any;
    return {
      path: path.segments.flatMap((s: any) => [plainValue(s.start), plainValue(s.relationship), plainValue(s.end)]),
    };
  }
  if (Array.isArray(value)) return depth > 2 ? [] : value.slice(0, 20).map((v) => plainValue(v, depth + 1));
  if (kindOf(value) === 'datetime' || kindOf(value) === 'point') return String(value);
  if (typeof value === 'object' && depth <= 2) {
    return Object.fromEntries(
      Object.entries(value as object)
        .slice(0, 20)
        .map(([k, v]) => [k, plainValue(v, depth + 1)])
    );
  }
  return null;
}

/** The database checks, through the driver: EXPLAIN and a short trial run, both read-only. */
export class DriverChecks implements CypherChecks {
  constructor(private readonly driver: Driver) {}

  async explain(database: string, query: string, parameters: Record<string, unknown>) {
    const session = this.driver.session({ database, defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.executeRead((tx) => tx.run(`EXPLAIN ${query}`, parameters), { timeout: 15_000 });
      const unknown: { kind: string; name: string }[] = [];
      for (const n of result.summary.notifications ?? []) {
        const match = MISSING.exec(`${n.description ?? ''}`);
        if (match) unknown.push({ kind: match[1]!.toLowerCase(), name: match[2]!.trim() });
      }
      return { queryType: result.summary.queryType, unknown };
    } catch (e) {
      return { error: (e as Error).message, unknown: [] };
    } finally {
      await session.close();
    }
  }

  async probe(database: string, query: string, parameters: Record<string, unknown>, timeoutSeconds: number) {
    const session = this.driver.session({ database, defaultAccessMode: neo4j.session.READ });
    const tx = session.beginTransaction({ timeout: timeoutSeconds * 1000 });
    try {
      const result = tx.run(query, parameters);
      const columns = (await result.keys()) as string[];
      const kinds: Record<string, Set<ValueKind>> = Object.fromEntries(columns.map((c) => [c, new Set<ValueKind>()]));
      let rows = 0;
      const sample: unknown[][] = [];
      for await (const record of result) {
        rows++;
        for (const column of columns) {
          const kind = kindOf(record.get(column));
          if (kind) kinds[column]!.add(kind);
        }
        sample.push(columns.map((column) => plainValue(record.get(column))));
        if (rows >= PROBE_ROWS) break;
      }
      return {
        columns,
        rows,
        sample,
        kinds: Object.fromEntries(Object.entries(kinds).map(([c, k]) => [c, [...k]])),
      };
    } catch (e) {
      return { error: (e as Error).message };
    } finally {
      await tx.rollback().catch(() => {});
      await session.close();
    }
  }
}

/** The first JSON object in a model's answer (models sometimes add prose or code fences). */
export function parseJson(answer: string): unknown {
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(answer);
  const text = (fenced ? fenced[1]! : answer).trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

const describeField = (f: ReportTypeDef['fields'][number]) =>
  `${f.key} (${f.label}: ${describeKind(f.kind)}${f.multiple ? ', one or more columns' : ''}${f.optional ? ', optional' : ''})`;

/** The report types, as the model is told about them. */
function describeTypes(catalogue: Catalogue): string {
  return catalogue.types
    .map((t) => {
      if (t.input === 'markdown') return `- ${t.key}: ${t.label}. The "query" is Markdown text; no selection.`;
      const shape = reportShape(t.key);
      const fields = t.fields.filter((f) => f.kind !== 'node_properties');
      const selection = fields.length ? `selection fields: ${fields.map(describeField).join('; ')}` : 'no selection';
      return `- ${t.key}: ${t.label}; ${selection}.${shape ? ` ${shape.description} Example: ${shape.example}` : ''}`;
    })
    .join('\n');
}

function describeContext(context: BuildContext): string {
  const lines: string[] = [];
  const d = context.dashboard;
  lines.push(
    `Dashboard: ${JSON.stringify(d.title ?? '(untitled)')}; pages: ${d.pages.map((p) => JSON.stringify(p)).join(', ') || '(one)'}; this page: ${JSON.stringify(d.page ?? '')}.`
  );
  const params = Object.keys(context.parameters);
  lines.push(
    params.length
      ? `Dashboard parameters, usable in queries as $name (current values): ${params.map((p) => `$${p} = ${JSON.stringify(context.parameters[p])}`).join(', ')}.`
      : 'The dashboard has no parameters.'
  );
  if (context.others.length) {
    lines.push('Reports already on the dashboard (do not repeat them):');
    for (const o of context.others.slice(0, 30)) {
      lines.push(
        `- ${JSON.stringify(o.title ?? '')} (${o.type ?? '?'}): ${(o.query ?? '').replace(/\s+/g, ' ').slice(0, 300)}`
      );
    }
  }
  const r = context.report;
  lines.push(
    `The report being built: title ${JSON.stringify(r.title ?? '')}${r.width && r.height ? `, ${r.width} x ${r.height} grid cells (the page is 24 cells wide, a cell about 100px tall; fit the report to that size, e.g. a single value for a small card)` : ''}.`
  );
  if (r.query && r.query.trim()) {
    lines.push(
      `It is now a ${r.type ?? 'table'} report with this query (change only what the request asks for):\n${r.query}`
    );
  }
  return lines.join('\n');
}

const CORE_RULES = `Rules for queries:
- Cypher for Neo4j 5, read-only: no CREATE, MERGE, SET, DELETE, REMOVE, LOAD CSV, or procedures that write.
- Use only the labels, relationship types and properties in the schema, in the directions shown.
- Alias every returned column (RETURN x AS name); "selection" maps the report's fields to these names.
- Return what the report type needs, and keep chart results small (top N, LIMIT).
- Do not use the EXISTS or SIZE keywords; compare text case-insensitively (toLower(x) CONTAINS 'y').`;

const REPORT_JSON =
  '{"type": "<report type key>", "title": "<short title>", "query": "<Cypher, or Markdown for text reports>", "selection": {"<field>": "<column>"}, "why": "<one short sentence>"}';

const OPTION_JSON =
  '{"type": "<report type key>", "title": "<short title>", "query": "<Cypher, or Markdown for text reports>", "selection": {"<field>": "<column>"}, "settings": {"<setting>": <value>}, "description": "<plain language: what it creates>", "settingsNote": "<plain language: what the settings change, or empty>"}';

/** Problems with settings (or the plain-language texts): corrected if possible, else left out. */
const isSettingProblem = (p: Problem) => !p.blocking && (p.path.startsWith('settings') || p.path === 'description');

/** Each report type's settings and their allowed values, briefly, for the model. */
function describeSettingsByType(catalogue: Catalogue): string {
  return catalogue.types
    .filter((t) => t.settings.length)
    .map(
      (t) =>
        `- ${t.key}: ${t.settings
          .slice(0, 60)
          .map((s) =>
            s.kind === 'choice'
              ? `${s.key} (${(s.values ?? [])
                  .slice(0, 12)
                  .map((v) => JSON.stringify(v))
                  .join('|')})`
              : `${s.key} (${s.kind === 'color' ? 'CSS colour' : s.kind})`
          )
          .join(', ')}`
    )
    .join('\n');
}

/** A plain description from a report's type and fields, when the model gave none. */
function fallbackDescription(spec: ReportSpec, type: ReportTypeDef): string {
  const fields = Object.entries(spec.selection).map(([key, value]) => {
    const label = type.fields.find((f) => f.key === key)?.label ?? key;
    return `${label.toLowerCase()}: ${[value].flat().join(', ')}`;
  });
  return `${type.label}${fields.length ? ` (${fields.join('; ')})` : ''}.`;
}

/** A JSON schema for one report's core, so constrained decoding only produces known report types. */
const coreJsonSchema = (catalogue: Catalogue) => ({
  type: 'object',
  properties: {
    type: { type: 'string', enum: catalogue.types.map((t) => t.key) },
    title: { type: 'string' },
    query: { type: 'string' },
    selection: {
      type: 'object',
      additionalProperties: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    },
    why: { type: 'string' },
  },
  required: ['type', 'title', 'query', 'selection'],
});

/** A JSON schema for a report type's settings: only its setting names, with their allowed values. */
const settingsJsonSchema = (type: ReportTypeDef) => ({
  type: 'object',
  properties: {
    settings: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        type.settings.map((s) => [
          s.key,
          s.kind === 'choice'
            ? { enum: s.values ?? [] }
            : s.kind === 'number'
              ? { type: 'number' }
              : s.kind === 'dictionary'
                ? { type: 'object' }
                : { type: 'string' },
        ])
      ),
    },
  },
  required: ['settings'],
});

const describeSetting = (s: ReportTypeDef['settings'][number]) =>
  `- ${s.key}: ${s.label} - ${
    s.kind === 'choice'
      ? `one of ${(s.values ?? []).map((v) => JSON.stringify(v)).join(', ')}`
      : s.kind === 'number'
        ? 'a number'
        : s.kind === 'color'
          ? 'a CSS colour, e.g. "#2a78d6"'
          : s.kind === 'dictionary'
            ? 'a JSON object'
            : 'text'
  }`;

export class ReportBuilder {
  /** How the endpoint takes structured output: a JSON schema, any JSON object, or neither. */
  private jsonMode: 'schema' | 'object' | 'none' = 'schema';

  constructor(
    private readonly llm: Text2Cypher,
    private readonly checks: CypherChecks,
    private readonly options: BuilderOptions
  ) {}

  get model() {
    return this.llm.model;
  }

  /** One answer as JSON, using the strongest structured output the endpoint accepts. */
  private async chatJson(messages: ChatMessage[], schema: object, stop?: AbortSignal): Promise<string> {
    for (;;) {
      const extra =
        this.jsonMode === 'schema'
          ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } } }
          : this.jsonMode === 'object'
            ? { response_format: { type: 'json_object' } }
            : {};
      try {
        return await this.llm.chat(messages, extra, stop);
      } catch (e) {
        // Endpoints that don't know response_format (or this form of it) say so; ask without it.
        const unsupported =
          e instanceof Text2CypherError &&
          e.code === 'model_unavailable' &&
          /response_format|json_schema|json_object|guided|structured/i.test(e.message);
        if (!unsupported || this.jsonMode === 'none') throw e;
        this.jsonMode = this.jsonMode === 'schema' ? 'object' : 'none';
      }
    }
  }

  /** Problems with a report's query: it must plan, only read, and use names the database has. */
  private async checkQuery(
    database: string,
    spec: ReportSpec,
    type: ReportTypeDef,
    names: SchemaNames,
    parameters: Record<string, unknown>,
    probe: boolean
  ): Promise<Problem[]> {
    if (type.input !== 'cypher') return [];
    const explained = await this.checks.explain(database, spec.query, parameters);
    if (explained.error) {
      const missing = /Expected parameter\(s\): (.+)/i.exec(explained.error);
      return [
        {
          path: 'query',
          message: missing
            ? `uses parameters the dashboard doesn't have (${missing[1]}). Available: ${
                Object.keys(parameters)
                  .map((p) => `$${p}`)
                  .join(', ') || 'none'
              }.`
            : `Neo4j rejects it: ${explained.error}`,
        },
      ];
    }
    const problems: Problem[] = [];
    if (explained.queryType && explained.queryType !== 'r') {
      problems.push({
        path: 'query',
        message:
          'it would change the database. Only read queries are allowed: no CREATE, MERGE, SET, DELETE or REMOVE.',
      });
    }
    for (const { kind, name } of explained.unknown) {
      const [candidates, what] =
        kind === 'label name'
          ? [names.labels, 'label']
          : kind === 'relationship type'
            ? [names.relationshipTypes, 'relationship type']
            : [names.properties, 'property'];
      const match = closest(name, candidates);
      problems.push({
        path: 'query',
        message:
          `the ${what} "${name}" does not exist in the database.${match ? ` Did you mean "${match}"?` : ''} ${what === 'property' ? '' : `Existing: ${candidates.slice(0, 40).join(', ')}.`}`.trim(),
      });
    }
    if (problems.length || !probe) return problems;
    const result = await this.checks.probe(database, spec.query, parameters, this.options.probeTimeoutSeconds);
    if ('error' in result) {
      return [
        {
          path: 'query',
          message: /timeout|terminated/i.test(result.error)
            ? `it takes too long (over ${this.options.probeTimeoutSeconds}s). Make it cheaper: fewer variable-length paths, filter early, LIMIT.`
            : `running it fails: ${result.error}`,
        },
      ];
    }
    // The trial run's first rows go to the browser for a preview (never to the model).
    spec.preview = { columns: result.columns, rows: result.sample ?? [] };
    return [...checkColumns(spec, type, result), ...checkReportRows(spec, type, result)];
  }

  /** Checks one answer for a report's core; returns the spec and what is still wrong with it. */
  private async checkCore(
    answer: unknown,
    catalogue: Catalogue,
    database: string,
    names: SchemaNames,
    parameters: Record<string, unknown>,
    probe: boolean
  ) {
    if (answer === undefined) {
      return {
        problems: [{ path: '', message: `That is not valid JSON. Answer with JSON only, shaped like ${REPORT_JSON}.` }],
      };
    }
    const { spec, problems } = checkSpec(answer, catalogue);
    // Wrong settings don't stop the query being checked (they are corrected, or left out at the end).
    if (!spec || problems.some((p) => !isSettingProblem(p))) return { spec, problems };
    const type = findType(catalogue, spec.type)!;
    // Laid out one clause per line; the laid-out query is the one checked and used.
    if (type.input === 'cypher') spec.query = formatCypher(spec.query);
    return {
      spec,
      problems: [...problems, ...(await this.checkQuery(database, spec, type, names, parameters, probe))],
    };
  }

  private async systemPrompt(
    database: string,
    catalogue: Catalogue,
    context: BuildContext,
    task: string,
    withSettings = false
  ) {
    const schema = await this.llm.schema(database);
    return [
      task,
      CORE_RULES,
      `Report types:\n${describeTypes(catalogue)}`,
      ...(withSettings
        ? [`Settings of each report type (name (allowed values)):\n${describeSettingsByType(catalogue)}`]
        : []),
      `Schema:\n${schema}`,
      describeContext(context),
    ].join('\n\n');
  }

  /**
   * Builds one report from a description (or from a suggestion the user picked), checked and corrected
   * until it is right; then the settings the description asks for.
   */
  async build(request: {
    database: string;
    prompt: string;
    catalogue: Catalogue;
    context: BuildContext;
    start?: unknown;
    /** Stops the work (between steps, and the model call in progress). */
    stop?: AbortSignal;
  }): Promise<{ report: ReportSpec; attempts: number; warnings: string[] }> {
    const { database, catalogue, stop } = request;
    const context = contextSchema.parse(request.context ?? {});
    const names = await this.llm.schemaNames(database);
    const system = await this.systemPrompt(
      database,
      catalogue,
      context,
      `You build one report for NeoDash, a dashboard for Neo4j, from the user's request. Answer with one JSON object only:\n${REPORT_JSON}`
    );
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: request.prompt.trim() || 'Build the most useful report for this dashboard.' },
    ];

    let attempts = 0;
    let answer = '';
    let spec: ReportSpec | undefined;
    let problems: Problem[] = [];
    let previous = '';
    const warnings: string[] = [];
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      stopped(stop);
      attempts = attempt;
      answer =
        attempt === 1 && request.start !== undefined
          ? JSON.stringify(request.start)
          : await this.chatJson(messages, coreJsonSchema(catalogue), stop);
      ({ spec, problems } = await this.checkCore(
        parseJson(answer),
        catalogue,
        database,
        names,
        context.parameters,
        true
      ));
      const hard = problems.filter((p) => !p.soft);
      const feedback = describeProblems(problems);
      // Accept a report whose only problem is soft (e.g. no rows today) once it has been pointed out.
      if (
        spec &&
        (problems.length === 0 || (hard.length === 0 && (attempt > 1 || attempt === this.options.maxAttempts)))
      ) {
        warnings.push(...problems.map((p) => p.message));
        break;
      }
      // The same problems again: the model is stuck; stop rather than spend more attempts.
      if (feedback === previous) break;
      previous = feedback;
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: feedback });
    }
    if (!spec || problems.some((p) => !p.soft)) {
      throw new BuildError(
        'The model could not build a working report. Try naming the labels, relationships and properties to use.',
        problems,
        answer
      );
    }

    // Settings: only those the request asks for, from this report type's own settings.
    const type = findType(catalogue, spec.type)!;
    if (request.prompt.trim() && type.settings.length) {
      const settings = await this.chooseSettings(request.prompt, spec, type, warnings, stop);
      spec.settings = { ...spec.settings, ...settings };
    }
    return { report: spec, attempts, warnings };
  }

  private async chooseSettings(
    prompt: string,
    spec: ReportSpec,
    type: ReportTypeDef,
    warnings: string[],
    stop?: AbortSignal
  ) {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          `Choose settings for a ${type.label} report titled ${JSON.stringify(spec.title)}.`,
          'Answer with JSON only: {"settings": {"<setting>": <value>}}. Include only settings the request asks for or clearly implies (colours, legend, labels, layout, ...); answer {"settings": {}} if there are none.',
          `Settings of ${type.label} reports (name: label - allowed values):`,
          type.settings.map(describeSetting).join('\n'),
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ];
    let valid: Record<string, unknown> = {};
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      const answer = await this.chatJson(messages, settingsJsonSchema(type), stop);
      const parsed = parseJson(answer) as { settings?: unknown } | undefined;
      const { settings, problems } = checkSettings(parsed?.settings ?? parsed ?? {}, type);
      valid = { ...valid, ...settings };
      if (!problems.length) return valid;
      if (attempt === this.options.maxAttempts) {
        // Keep the settings that are right; leave out the rest.
        warnings.push(...problems.map((p) => `Left out ${p.path}: ${p.message}`));
        return valid;
      }
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: describeProblems(problems) });
    }
    return valid;
  }

  /**
   * Up to three options for a report, each complete (type, query, fields, the settings the request asks
   * for) and checked, with a plain-language description; the recommended one first. With a request
   * they follow it (changing the report when it already has a query); without one they suggest reports
   * the dashboard doesn't have yet. Options are corrected as a whole list until all are right, the same
   * problems repeat or the attempts run out; then wrong settings are left out, and options that are
   * still wrong are dropped.
   */
  async suggest(request: {
    database: string;
    prompt: string;
    catalogue: Catalogue;
    context: BuildContext;
    /** Stops the work (between steps, and the model call in progress). */
    stop?: AbortSignal;
  }): Promise<ReportSpec[]> {
    const { database, catalogue, stop } = request;
    const context = contextSchema.parse(request.context ?? {});
    const names = await this.llm.schemaNames(database);
    const prompt = request.prompt.trim();
    const changing = Boolean(context.report.query?.trim());
    const task = [
      'You suggest reports for NeoDash, a dashboard for Neo4j. Give up to three options; put the one you recommend first.',
      prompt
        ? changing
          ? 'Each option changes the report described below as the request asks; the options differ in how they do it.'
          : 'Every option must do what the request asks; the options differ in how they show it (the kind of chart, grouping, layout).'
        : 'Suggest different, useful reports that are not already on the dashboard.',
      `Answer with JSON only: {"options": [${OPTION_JSON}, ...]}`,
      '"description": what the option creates, in plain language for someone who does not know Cypher: the kind of chart, what is on each axis (or what the slices, rows or nodes are), and how it is coloured or grouped. One or two sentences.',
      `"settings": only settings the request asks for or clearly implies, from the chosen report type's settings (listed below); {} if none. "settingsNote": if there are settings, say briefly in plain words what they change; otherwise "".`,
    ].join('\n');
    const system = await this.systemPrompt(database, catalogue, context, task, Boolean(prompt));
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: prompt || 'Suggest reports for this dashboard.' },
    ];
    const option = {
      ...coreJsonSchema(catalogue),
      properties: {
        ...coreJsonSchema(catalogue).properties,
        settings: { type: 'object' },
        description: { type: 'string' },
        settingsNote: { type: 'string' },
      },
      required: ['type', 'title', 'query', 'selection', 'description'],
    };
    const schema = {
      type: 'object',
      properties: { options: { type: 'array', maxItems: 3, items: option } },
      required: ['options'],
    };

    type Checked = { spec?: ReportSpec; problems: Problem[] }[];
    // Options worth keeping from a round: right, or wrong only in settings or the description.
    const usable = (round: Checked) =>
      round.filter(({ spec, problems }) => spec && !problems.some((p) => !p.soft && !isSettingProblem(p))).length;
    let best: Checked = [];
    let previous = '';
    const attempts = Math.min(3, this.options.maxAttempts);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      stopped(stop);
      const answer = await this.chatJson(messages, schema, stop);
      const parsed = parseJson(answer) as { options?: unknown[]; suggestions?: unknown[] } | undefined;
      const items = (
        Array.isArray(parsed?.options) ? parsed!.options : Array.isArray(parsed?.suggestions) ? parsed!.suggestions : []
      ).slice(0, 3);
      const checked: Checked = [];
      for (const item of items) {
        const result = await this.checkCore(item, catalogue, database, names, context.parameters, true);
        if (result.spec && !result.spec.description) {
          result.problems.push({
            path: 'description',
            message: 'Describe in plain language what this option creates (kind of chart, axes, colouring).',
          });
        }
        checked.push(result);
      }
      // A later round that went worse (e.g. an empty answer) doesn't replace a better one.
      if (usable(checked) >= usable(best)) best = checked;
      const failures = checked
        .map(({ problems }, index) => ({ index, problems: problems.filter((p) => !p.soft) }))
        .filter(({ problems }) => problems.length);
      if (items.length && !failures.length) break;
      const feedback = failures.length
        ? failures
            .map(
              ({ index, problems }) =>
                `Option ${index + 1}:\n${problems.map((p) => `- ${p.path ? `${p.path}: ` : ''}${p.message}`).join('\n')}`
            )
            .join('\n')
        : 'There were no usable options.';
      if (feedback === previous) break;
      previous = feedback;
      messages.push(
        { role: 'assistant', content: answer },
        {
          role: 'user',
          content: `${feedback}\nAnswer again with all the options (the ones that were right too), corrected, as JSON in the same shape.`,
        }
      );
    }

    // Keep options whose only remaining problems are with settings (left out) or the description
    // (written from the report's fields); drop the rest.
    const options: ReportSpec[] = [];
    for (const { spec, problems } of best) {
      if (!spec || problems.some((p) => !p.soft && !isSettingProblem(p))) continue;
      const type = findType(catalogue, spec.type)!;
      if (!spec.description) spec.description = fallbackDescription(spec, type);
      if (!Object.keys(spec.settings).length) spec.settingsNote = undefined;
      const duplicate = options.some(
        (o) =>
          o.type === spec.type && o.query === spec.query && JSON.stringify(o.settings) === JSON.stringify(spec.settings)
      );
      if (!duplicate) options.push(spec);
    }
    return options.slice(0, 3);
  }
}

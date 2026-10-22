import neo4j, { type Driver } from 'neo4j-driver';
import { Text2CypherError, reportShape, type ChatMessage, type SchemaNames, type Text2Cypher } from '../text2cypher.js';
import { contextSchema, type BuildContext, type Catalogue, type ReportSpec, type ReportTypeDef } from './catalogue.js';
import {
  checkColumns,
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
      for await (const record of result) {
        rows++;
        for (const column of columns) {
          const kind = kindOf(record.get(column));
          if (kind) kinds[column]!.add(kind);
        }
        if (rows >= PROBE_ROWS) break;
      }
      return { columns, rows, kinds: Object.fromEntries(Object.entries(kinds).map(([c, k]) => [c, [...k]])) };
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
  private async chatJson(messages: ChatMessage[], schema: object): Promise<string> {
    for (;;) {
      const extra =
        this.jsonMode === 'schema'
          ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } } }
          : this.jsonMode === 'object'
            ? { response_format: { type: 'json_object' } }
            : {};
      try {
        return await this.llm.chat(messages, extra);
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
    return checkColumns(spec, type, result);
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
    if (!spec || problems.length) return { spec, problems };
    const type = findType(catalogue, spec.type)!;
    return { spec, problems: await this.checkQuery(database, spec, type, names, parameters, probe) };
  }

  private async systemPrompt(database: string, catalogue: Catalogue, context: BuildContext, task: string) {
    const schema = await this.llm.schema(database);
    return [
      task,
      CORE_RULES,
      `Report types:\n${describeTypes(catalogue)}`,
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
  }): Promise<{ report: ReportSpec; attempts: number; warnings: string[] }> {
    const { database, catalogue } = request;
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
      attempts = attempt;
      answer =
        attempt === 1 && request.start !== undefined
          ? JSON.stringify(request.start)
          : await this.chatJson(messages, coreJsonSchema(catalogue));
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
      const settings = await this.chooseSettings(request.prompt, spec, type, warnings);
      spec.settings = { ...spec.settings, ...settings };
    }
    return { report: spec, attempts, warnings };
  }

  private async chooseSettings(prompt: string, spec: ReportSpec, type: ReportTypeDef, warnings: string[]) {
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
      const answer = await this.chatJson(messages, settingsJsonSchema(type));
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

  /** Up to three checked report suggestions for the dashboard (following the request, if any). */
  async suggest(request: {
    database: string;
    prompt: string;
    catalogue: Catalogue;
    context: BuildContext;
  }): Promise<ReportSpec[]> {
    const { database, catalogue } = request;
    const context = contextSchema.parse(request.context ?? {});
    const names = await this.llm.schemaNames(database);
    const system = await this.systemPrompt(
      database,
      catalogue,
      context,
      `You suggest reports for NeoDash, a dashboard for Neo4j: up to three different, useful reports that are not already on the dashboard. If the user wrote a request, every suggestion must follow it. Answer with JSON only: {"suggestions": [${REPORT_JSON}, ...]}`
    );
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: request.prompt.trim() || 'Suggest reports for this dashboard.' },
    ];
    const schema = {
      type: 'object',
      properties: { suggestions: { type: 'array', maxItems: 3, items: coreJsonSchema(catalogue) } },
      required: ['suggestions'],
    };

    const good: ReportSpec[] = [];
    for (let attempt = 1; attempt <= Math.min(2, this.options.maxAttempts); attempt++) {
      const answer = await this.chatJson(messages, schema);
      const parsed = parseJson(answer) as { suggestions?: unknown[] } | undefined;
      const items = Array.isArray(parsed?.suggestions) ? parsed!.suggestions.slice(0, 3) : [];
      const failed: string[] = [];
      for (const [index, item] of items.entries()) {
        const { spec, problems } = await this.checkCore(item, catalogue, database, names, context.parameters, true);
        if (spec && !problems.some((p) => !p.soft)) {
          if (!good.some((g) => g.query === spec.query)) good.push(spec);
        } else {
          failed.push(
            `Suggestion ${index + 1}:\n${problems.map((p) => `- ${p.path ? `${p.path}: ` : ''}${p.message}`).join('\n')}`
          );
        }
      }
      if (good.length >= 3 || (!failed.length && items.length)) break;
      // One round of corrections for the ones that failed.
      messages.push(
        { role: 'assistant', content: answer },
        {
          role: 'user',
          content: `${failed.join('\n') || 'There were no usable suggestions.'}\nAnswer again with corrected suggestions only (JSON, same shape), leaving out the ones that were right.`,
        }
      );
    }
    return good.slice(0, 3);
  }
}

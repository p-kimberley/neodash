import type { Catalogue, FieldKind, ReportSpec, ReportTypeDef, SettingDef } from './catalogue.js';

// Checks what the model wrote against what is allowed, and says what is wrong in a way the model can
// act on: each problem names the allowed values, or the closest one ("did you mean ...?").

export interface Problem {
  /** Where: "type", "query", "selection.value", "settings.colors", ... */
  path: string;
  message: string;
  /**
   * Worth another try, but acceptable if it persists (e.g. a query that returns no rows today may
   * still be the right query).
   */
  soft?: boolean;
  /** A settings problem that can't be fixed by leaving the setting out (the report wouldn't work). */
  blocking?: boolean;
}

/** Edit distance between two strings (case-insensitive). */
export function distance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const row = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (s[i - 1] === t[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[t.length]!;
}

/** The candidate closest to a name, if it is close enough to be a likely misspelling. */
export function closest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  const lower = name.toLowerCase();
  for (const candidate of candidates) {
    const other = candidate.toLowerCase();
    // One name inside the other (orders / orders_count) is as good as a near miss.
    const contained = Math.min(lower.length, other.length) >= 3 && (lower.includes(other) || other.includes(lower));
    const d = contained ? 1 : distance(name, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best !== undefined && bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : undefined;
}

const didYouMean = (name: string, candidates: string[]) => {
  const match = closest(name, candidates);
  return match ? ` Did you mean "${match}"?` : '';
};

const listOf = (values: unknown[], max = 40) =>
  values.length > max
    ? `${values
        .slice(0, max)
        .map((v) => JSON.stringify(v))
        .join(', ')}, ... (${values.length - max} more)`
    : values.map((v) => JSON.stringify(v)).join(', ');

/** Removes the code fences and "cypher" tags models put around queries. */
export function cleanQuery(text: string): string {
  let query = text.trim();
  const fenced = /```(?:[a-zA-Z]*)\s*\n?([\s\S]*?)```/.exec(query);
  if (fenced) query = fenced[1]!.trim();
  return query
    .replace(/^cypher\s*\n/i, '')
    .replace(/;\s*$/, '')
    .trim();
}

/** The report type a model meant: by key, or by label ("Bar Chart"), ignoring case. */
export function findType(catalogue: Catalogue, name: unknown): ReportTypeDef | undefined {
  if (typeof name !== 'string') return undefined;
  const wanted = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return catalogue.types.find(
    (t) => t.key.toLowerCase() === wanted || t.label.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted
  );
}

const CSS_COLOR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)|[a-z]{3,30})$/i;

/** Checks settings against a report type's settings; returns the usable ones (values normalised). */
export function checkSettings(
  raw: unknown,
  type: ReportTypeDef
): { settings: Record<string, unknown>; problems: Problem[] } {
  const settings: Record<string, unknown> = {};
  const problems: Problem[] = [];
  if (raw === undefined || raw === null) return { settings, problems };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { settings, problems: [{ path: 'settings', message: 'must be an object of setting names and values.' }] };
  }
  const byKey = new Map(type.settings.map((s) => [s.key, s]));
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const def = byKey.get(key);
    if (!def) {
      problems.push({
        path: `settings.${key}`,
        message: `"${key}" is not a setting of ${type.label} reports.${didYouMean(key, [...byKey.keys()])} Settings: ${listOf([...byKey.keys()], 60)}.`,
      });
      continue;
    }
    const checked = checkSetting(def, value);
    if ('problem' in checked) problems.push({ path: `settings.${key}`, message: checked.problem });
    else settings[key] = checked.value;
  }
  return { settings, problems };
}

function checkSetting(def: SettingDef, value: unknown): { value: unknown } | { problem: string } {
  switch (def.kind) {
    case 'choice': {
      const values = def.values ?? [];
      const match = values.find((v) => v === value || String(v).toLowerCase() === String(value).toLowerCase());
      return match !== undefined
        ? { value: match }
        : { problem: `${JSON.stringify(value)} is not allowed for "${def.label}". Use one of: ${listOf(values)}.` };
    }
    case 'number': {
      const n =
        typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      return Number.isFinite(n) ? { value: n } : { problem: `"${def.label}" must be a number.` };
    }
    case 'color':
      return typeof value === 'string' && CSS_COLOR.test(value.trim())
        ? { value: value.trim() }
        : { problem: `"${def.label}" must be a CSS colour such as "#2a78d6" or "rgb(42, 120, 214)".` };
    case 'dictionary':
      return value && typeof value === 'object' && !Array.isArray(value)
        ? { value }
        : { problem: `"${def.label}" must be a JSON object.` };
    default:
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? { value: String(value) }
        : { problem: `"${def.label}" must be text.` };
  }
}

/**
 * Checks the core of a report (type, title, query, field selection) and turns it into a spec. Settings
 * are checked too, when given.
 */
export function checkSpec(raw: unknown, catalogue: Catalogue): { spec?: ReportSpec; problems: Problem[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { problems: [{ path: '', message: 'Answer with one JSON object describing the report.' }] };
  }
  const r = raw as Record<string, unknown>;
  const problems: Problem[] = [];
  const type = findType(catalogue, r.type);
  if (!type) {
    const keys = catalogue.types.map((t) => t.key);
    problems.push({
      path: 'type',
      message: `${JSON.stringify(r.type)} is not a report type.${typeof r.type === 'string' ? didYouMean(r.type, keys) : ''} Use one of: ${catalogue.types.map((t) => `${t.key} (${t.label})`).join(', ')}.`,
    });
  }
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) problems.push({ path: 'title', message: 'Give the report a short title.' });
  const query = typeof r.query === 'string' ? (type?.input === 'markdown' ? r.query.trim() : cleanQuery(r.query)) : '';
  if (!query) {
    problems.push({
      path: 'query',
      message: type?.input === 'markdown' ? 'Write the Markdown text of the report.' : 'Write the Cypher query.',
    });
  }

  const selection: Record<string, string | string[]> = {};
  if (type && type.input === 'cypher') {
    const raw = r.selection && typeof r.selection === 'object' && !Array.isArray(r.selection) ? r.selection : {};
    // Graphs, maps and sankeys choose node properties themselves.
    const fields = type.fields.filter((f) => f.kind !== 'node_properties');
    const fieldKeys = fields.map((f) => f.key);
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const field = fields.find((f) => f.key === key);
      if (!field) {
        if (type.fields.some((f) => f.key === key)) continue;
        problems.push({
          path: `selection.${key}`,
          message: `"${key}" is not a field of ${type.label} reports.${didYouMean(key, fieldKeys)} Fields: ${fieldKeys.join(', ') || '(none)'}.`,
        });
        continue;
      }
      const columns = (Array.isArray(value) ? value : [value]).filter(
        (c): c is string => typeof c === 'string' && c !== ''
      );
      if (columns.length === 0) {
        problems.push({ path: `selection.${key}`, message: 'must name a column the query returns.' });
      } else if (field.multiple) {
        selection[key] = columns;
      } else if (columns.length > 1) {
        problems.push({ path: `selection.${key}`, message: `takes one column, not ${columns.length}.` });
      } else {
        selection[key] = columns[0]!;
      }
    }
    for (const field of fields) {
      if (!field.optional && !(field.key in selection) && !problems.some((p) => p.path === `selection.${field.key}`)) {
        problems.push({
          path: `selection.${field.key}`,
          message: `${type.label} reports need a column for "${field.label}" (${describeKind(field.kind)}); name it in selection.${field.key}.`,
        });
      }
    }
  }

  const { settings, problems: settingProblems } = type
    ? checkSettings(r.settings, type)
    : { settings: {}, problems: [] };
  problems.push(...settingProblems);
  if (!type) return { problems };
  return {
    spec: {
      type: type.key,
      title,
      query,
      selection,
      settings,
      why: typeof r.why === 'string' ? r.why.slice(0, 500) : undefined,
      description:
        typeof r.description === 'string' && r.description.trim() ? r.description.trim().slice(0, 600) : undefined,
      settingsNote:
        typeof r.settingsNote === 'string' && r.settingsNote.trim() ? r.settingsNote.trim().slice(0, 400) : undefined,
    },
    problems,
  };
}

/** The kinds of value a query can return, as the probe sees them. */
export type ValueKind =
  'number' | 'text' | 'boolean' | 'datetime' | 'node' | 'relationship' | 'path' | 'list' | 'map' | 'point';

const ACCEPTS: Record<FieldKind, ValueKind[]> = {
  number: ['number'],
  number_or_datetime: ['number', 'datetime'],
  text: ['text', 'number', 'boolean', 'datetime'],
  list: ['list'],
  node_properties: [],
};

export function describeKind(kind: FieldKind): string {
  return {
    number: 'numbers',
    number_or_datetime: 'numbers or dates',
    text: 'text',
    list: 'lists (e.g. a path of names)',
    node_properties: 'nodes',
  }[kind];
}

export interface ProbeResult {
  columns: string[];
  /** The kinds of value seen in each column (nulls left out). */
  kinds: Record<string, ValueKind[]>;
  rows: number;
  /** The rows seen, as plain values (for previews; never sent to the model). */
  sample?: unknown[][];
}

/** Checks a report's field selection against what its query actually returned. */
export function checkColumns(spec: ReportSpec, type: ReportTypeDef, probe: ProbeResult): Problem[] {
  const problems: Problem[] = [];
  if (probe.rows === 0) {
    problems.push({
      path: 'query',
      message:
        'The query returns no rows. Check the labels, relationship directions, property names and filter values (text comparisons are case-sensitive; prefer toLower(...) CONTAINS ...).',
      soft: true,
    });
  }
  for (const [key, value] of Object.entries(spec.selection)) {
    const field = type.fields.find((f) => f.key === key);
    if (!field) continue;
    for (const column of Array.isArray(value) ? value : [value]) {
      if (!probe.columns.includes(column)) {
        problems.push({
          path: `selection.${key}`,
          message: `the query returns no column "${column}".${didYouMean(column, probe.columns)} It returns: ${probe.columns.join(', ') || '(nothing)'}. Use those names, or alias the columns in RETURN (... AS name).`,
        });
        continue;
      }
      const seen = probe.kinds[column] ?? [];
      const accepted = ACCEPTS[field.kind];
      const wrong = seen.filter((k) => !accepted.includes(k));
      if (accepted.length && wrong.length) {
        problems.push({
          path: `selection.${key}`,
          message: `"${field.label}" needs ${describeKind(field.kind)}, but column "${column}" holds ${wrong.join(' and ')} values. Return ${describeKind(field.kind)} in that column${field.kind === 'number' ? ' (e.g. count(...), sum(...), toFloat(...))' : ''}.`,
        });
      }
    }
  }
  return problems;
}

/** A Sankey with every flow the same width (its "Relationship value Property" setting). */
export const UNWEIGHTED_SANKEY = 'SANKEY_UNWEIGHTED';

/** The nodes and relationships among a trial run's rows (in columns, lists and paths). */
function graphEntities(rows: unknown[][]) {
  const nodes: { node: string; lat?: number; lon?: number }[] = [];
  const rels: { rel: string; numbers?: Record<string, number> }[] = [];
  const visit = (v: any) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v.node === 'string') nodes.push(v);
    else if (typeof v.rel === 'string') rels.push(v);
    else if (Array.isArray(v.path)) v.path.forEach(visit);
  };
  rows.forEach((row) => row.forEach(visit));
  return { nodes, rels };
}

/**
 * Checks that report types without fields to map got what they draw: graphs need nodes or
 * relationships, maps nodes with coordinates, and Sankeys relationships whose flow-width property is a
 * number (naming the numeric properties they do have).
 */
export function checkReportRows(spec: ReportSpec, type: ReportTypeDef, probe: ProbeResult): Problem[] {
  if (!probe.rows || !probe.sample) return [];
  const { nodes, rels } = graphEntities(probe.sample);
  if (type.key === 'graph' || type.key === 'graph3d') {
    return nodes.length || rels.length
      ? []
      : [
          {
            path: 'query',
            message:
              'A graph draws nodes and relationships, but the query returns only values. Return the nodes and relationships themselves (e.g. RETURN a, r, b), not their properties.',
          },
        ];
  }
  if (type.key === 'map') {
    return nodes.some((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
      ? []
      : [
          {
            path: 'query',
            message:
              'A map places nodes by their latitude/longitude (or point) properties, but the query returns no such nodes. Return nodes that have coordinates (and relationships between them for lines).',
          },
        ];
  }
  if (type.key === 'sankey') {
    if (!rels.length) {
      return [
        {
          path: 'query',
          message:
            'A Sankey diagram draws relationships as flows, but the query returns none. Return each relationship with its two nodes (e.g. RETURN a, r, b).',
        },
      ];
    }
    const weight = typeof spec.settings.labelProperty === 'string' ? spec.settings.labelProperty : 'value';
    if (weight === UNWEIGHTED_SANKEY || rels.some((r) => typeof r.numbers?.[weight] === 'number')) return [];
    const types = [...new Set(rels.map((r) => r.rel))];
    const numeric = [...new Set(rels.flatMap((r) => Object.keys(r.numbers ?? {})))];
    return [
      {
        path: 'settings.labelProperty',
        message: `A Sankey's flows are sized by a numeric property of its relationships, named in settings.labelProperty (now ${JSON.stringify(weight)}), but the relationships returned (${types.join(', ')}) don't have it. ${
          numeric.length
            ? `Set settings.labelProperty to one of their numeric properties: ${numeric.join(', ')}.`
            : `They have no numeric properties: return relationships that do, or set settings.labelProperty to ${JSON.stringify(UNWEIGHTED_SANKEY)} for flows of equal width.`
        }`,
        // Not a setting that can simply be left out: without it the diagram draws nothing.
        blocking: true,
      },
    ];
  }
  return [];
}

/** Problems as a message the model can act on. */
export function describeProblems(problems: Problem[]): string {
  return [
    'Your answer has these problems:',
    ...problems.map((p) => `- ${p.path ? `${p.path}: ` : ''}${p.message}`),
    'Fix all of them and answer with the complete corrected JSON only.',
  ].join('\n');
}

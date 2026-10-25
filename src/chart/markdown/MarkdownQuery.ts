// A Markdown ("text") report keeps its Markdown in the report's query, as it always has. It can also
// have a Cypher query, kept in this setting: the query's first row fills {{column}} placeholders in the
// Markdown. (The backend reads the same setting when a viewer runs the report: server/src/dashboards.ts.)
export const MARKDOWN_QUERY_SETTING = 'cypherQuery';

/** The Cypher a saved report runs: its query, or for a Markdown report its Cypher query setting. */
export const savedCypherOf = (report: any): string | undefined =>
  report?.type === 'text' ? report?.settings?.[MARKDOWN_QUERY_SETTING] : report?.query;

/** A value as text in the Markdown: lists comma-separated, nodes and maps as their properties. */
export const valueText = (value: any): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(valueText).join(', ');
  }
  if (typeof value === 'object') {
    // Nodes and relationships: their properties.
    if (value.properties && (value.labels || value.type)) {
      return valueText(value.properties);
    }
    // Neo4j integers, dates, times, durations and points.
    if (value.toString !== Object.prototype.toString) {
      return value.toString();
    }
    return Object.entries(value)
      .map(([key, v]) => `${key}: ${valueText(v)}`)
      .join(', ');
  }
  return String(value);
};

/** The value at `path` in a row: a column ("name"), or a property of a node or map in it ("n.name"). */
const lookup = (row: any, path: string): { found: boolean; value?: any } => {
  const keys: string[] = row?.keys ?? [];
  if (keys.includes(path)) {
    return { found: true, value: row.get(path) };
  }
  const [column, ...properties] = path.split('.');
  if (properties.length === 0 || !keys.includes(column)) {
    return { found: false };
  }
  let value = row.get(column);
  for (const property of properties) {
    const holder = value?.properties && (value.labels || value.type) ? value.properties : value;
    value = holder && typeof holder === 'object' ? holder[property] : undefined;
  }
  return { found: true, value };
};

/**
 * Replaces {{column}} (or {{column.property}}) placeholders with the first row's values, as they are
 * (so a value can itself be Markdown). Placeholders that name no column are left as typed, so a typo
 * shows; when the query returned no rows they are all left empty.
 */
export const fillQueryPlaceholders = (markdown: string, rows: any[]): string => {
  const [row] = rows;
  return markdown.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (placeholder, path) => {
    if (!row) {
      return '';
    }
    const { found, value } = lookup(row, path);
    return found ? valueText(value) : placeholder;
  });
};

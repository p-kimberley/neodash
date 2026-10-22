// Lays out a Cypher query a model wrote on one line: one clause per line (MATCH, WHERE, WITH, RETURN,
// ORDER BY, ...), and long WHERE conditions split before AND / OR, indented. Only the top level is
// changed: strings, comments and anything inside brackets (pattern comprehensions, subqueries, maps)
// stay as they are. Queries already spread over several lines are left alone.

const CLAUSES = ['OPTIONAL MATCH', 'MATCH', 'WHERE', 'WITH', 'RETURN', 'ORDER BY', 'SKIP', 'LIMIT', 'UNWIND', 'CALL', 'UNION ALL', 'UNION'];

/** Words that make a following clause keyword part of an expression (STARTS WITH, ENDS WITH, ...). */
const NOT_A_CLAUSE_AFTER = new Set(['STARTS', 'ENDS', 'OPTIONAL']);

const LONG_LINE = 80;

interface Piece {
  /** Index in the query where a top-level word starts. */
  index: number;
  word: string;
}

/** The top-level words of a query (outside strings, comments and brackets), with their positions. */
function topLevelWords(query: string): Piece[] {
  const words: Piece[] = [];
  let depth = 0;
  let i = 0;
  while (i < query.length) {
    const c = query[i]!;
    if (c === "'" || c === '"' || c === '`') {
      // Skip the quoted text (with backslash escapes).
      i++;
      while (i < query.length && query[i] !== c) i += query[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '/' && query[i + 1] === '/') {
      while (i < query.length && query[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && query[i + 1] === '*') {
      const end = query.indexOf('*/', i + 2);
      i = end < 0 ? query.length : end + 2;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[A-Za-z_]/.test(c) && (i === 0 || !/[\w$.]/.test(query[i - 1]!))) {
      let end = i;
      while (end < query.length && /\w/.test(query[end]!)) end++;
      words.push({ index: i, word: query.slice(i, end) });
      i = end;
      continue;
    }
    i++;
  }
  return words;
}

/** Splits a long WHERE line before its top-level AND / OR. */
function splitConditions(line: string): string {
  if (line.length <= LONG_LINE || !/^WHERE\b/i.test(line)) return line;
  const cuts = topLevelWords(line)
    .filter((w) => /^(AND|OR|XOR)$/i.test(w.word))
    .map((w) => w.index);
  if (!cuts.length) return line;
  const parts: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    parts.push(line.slice(start, cut).trimEnd());
    start = cut;
  }
  parts.push(line.slice(start));
  return parts.map((p, i) => (i === 0 ? p : `  ${p.trim()}`)).join('\n');
}

export function formatCypher(query: string): string {
  const text = query.trim();
  if (!text || text.includes('\n')) return text;
  const words = topLevelWords(text);
  const breaks: number[] = [];
  for (let w = 0; w < words.length; w++) {
    const { index, word } = words[w]!;
    const upper = word.toUpperCase();
    const next = words[w + 1]?.word.toUpperCase();
    const isClause = CLAUSES.some((clause) => {
      const [first, second] = clause.split(' ');
      return upper === first && (!second || next === second);
    });
    const previous = words[w - 1]?.word.toUpperCase();
    if (isClause && index > 0 && !(previous && NOT_A_CLAUSE_AFTER.has(previous) && upper !== 'OPTIONAL')) {
      breaks.push(index);
    }
  }
  if (!breaks.length) return text;
  const lines: string[] = [];
  let start = 0;
  for (const at of breaks) {
    lines.push(text.slice(start, at).trim());
    start = at;
  }
  lines.push(text.slice(start).trim());
  return lines.filter(Boolean).map(splitConditions).join('\n');
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Driver } from 'neo4j-driver';
import { Text2Cypher } from '../src/text2cypher.js';
import { BuildError, ReportBuilder, parseJson, type CypherChecks } from '../src/ai/builder.js';
import type { Catalogue } from '../src/ai/catalogue.js';
import { checkColumns, checkSettings, checkSpec, closest } from '../src/ai/validate.js';
import { makeApp, testConfig } from './helpers.js';

// Build with AI's report builder, with a scripted model and stubbed database checks.

const CATALOGUE: Catalogue = {
  types: [
    {
      key: 'bar',
      label: 'Bar Chart',
      input: 'cypher',
      fields: [
        { key: 'index', label: 'Category', kind: 'text', optional: false, multiple: false },
        { key: 'value', label: 'Value', kind: 'number', optional: false, multiple: false },
        { key: 'key', label: 'Group', kind: 'text', optional: true, multiple: false },
      ],
      settings: [
        { key: 'legend', label: 'Show Legend', kind: 'choice', values: [true, false] },
        { key: 'colors', label: 'Color Scheme', kind: 'choice', values: ['default', 'nivo', 'set1'] },
        { key: 'layout', label: 'Layout', kind: 'choice', values: ['vertical', 'horizontal'] },
        { key: 'marginLeft', label: 'Margin Left', kind: 'number' },
        { key: 'backgroundColor', label: 'Background Color', kind: 'color' },
      ],
    },
    { key: 'table', label: 'Table', input: 'cypher', fields: [], settings: [] },
    { key: 'text', label: 'Markdown', input: 'markdown', fields: [], settings: [] },
    {
      key: 'graph',
      label: 'Graph',
      input: 'cypher',
      fields: [
        { key: 'properties', label: 'Node Properties', kind: 'node_properties', optional: false, multiple: false },
      ],
      settings: [],
    },
  ],
};

const SCHEMA_NAMES = {
  labels: ['Customer', 'Order', 'Product'],
  relationshipTypes: ['PLACED', 'CONTAINS'],
  properties: ['name', 'total', 'segment'],
};

/** A chat endpoint answering in turn; each answer may be a JSON value (sent as text) or an HTTP error. */
function fakeModel(answers: unknown[]) {
  const requests: any[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const next = answers.shift();
    if (next && typeof next === 'object' && 'httpStatus' in (next as any)) {
      const { httpStatus, message } = next as any;
      return new Response(JSON.stringify({ error: { message } }), { status: httpStatus });
    }
    const content = typeof next === 'string' ? next : JSON.stringify(next ?? {});
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

/** Database checks: queries are judged by simple rules on their text. */
const fakeChecks = (overrides: Partial<CypherChecks> = {}): CypherChecks => ({
  explain: async (_db, query) => {
    if (/SELECT/.test(query)) return { error: "Invalid input 'SELECT'", unknown: [] };
    if (/CREATE|MERGE|SET /.test(query)) return { queryType: 'rw', unknown: [] };
    const unknown = [...query.matchAll(/:(Custmer|Ordr)\b/g)].map((m) => ({ kind: 'label name', name: m[1]! }));
    return { queryType: 'r', unknown };
  },
  probe: async (_db, query) => {
    const columns = [...query.matchAll(/AS (\w+)/g)].map((m) => m[1]!);
    const kinds = Object.fromEntries(columns.map((c) => [c, [/count|total|value/.test(c) ? 'number' : 'text']])) as any;
    return { columns, kinds, rows: /nothing/.test(query) ? 0 : 5 };
  },
  ...overrides,
});

function makeBuilder(answers: unknown[], checks = fakeChecks(), maxAttempts = 4) {
  const model = fakeModel(answers);
  const llm = new Text2Cypher(
    {
      baseUrl: 'http://llm.test/v1',
      model: 'test-model',
      timeoutSeconds: 5,
      maxAttempts: 2,
      temperature: 0,
      schemaTtlSeconds: 300,
    },
    {} as Driver,
    model.fetchImpl
  );
  llm.schema = async () => ':Customer {name: String}\n(:Customer)-[:PLACED]->(:Order)';
  llm.schemaNames = async () => SCHEMA_NAMES;
  const builder = new ReportBuilder(llm, checks, { maxAttempts, probeTimeoutSeconds: 5 });
  return { builder, requests: model.requests };
}

const GOOD_BAR = {
  type: 'bar',
  title: 'Orders per segment',
  query: 'MATCH (c:Customer)-[:PLACED]->(o:Order) RETURN c.segment AS segment, count(o) AS orders_count',
  selection: { index: 'segment', value: 'orders_count' },
};

const lastFeedback = (requests: any[]) => {
  const messages = requests[requests.length - 1].messages;
  return messages[messages.length - 1].content as string;
};

describe('checking what the model wrote', () => {
  it('names the allowed report types, and suggests the closest one', () => {
    const { problems } = checkSpec({ ...GOOD_BAR, type: 'bars' }, CATALOGUE);
    expect(problems[0]!.message).toMatch(/"bars" is not a report type\. Did you mean "bar"\?/);
    expect(problems[0]!.message).toMatch(/bar \(Bar Chart\), table \(Table\)/);
    // Labels as shown in the app work too.
    expect(checkSpec({ ...GOOD_BAR, type: 'Bar Chart' }, CATALOGUE).spec?.type).toBe('bar');
  });

  it('asks for every required field, and rejects unknown ones', () => {
    const { problems } = checkSpec({ ...GOOD_BAR, selection: { index: 'segment', valeu: 'orders_count' } }, CATALOGUE);
    const messages = problems.map((p) => `${p.path}: ${p.message}`);
    expect(messages).toContainEqual(expect.stringMatching(/selection\.valeu: .*Did you mean "value"\?/));
    expect(messages).toContainEqual(expect.stringMatching(/selection\.value: .*need a column for "Value" \(numbers\)/));
  });

  it("leaves graphs' node properties to the app, and markdown without fields", () => {
    expect(checkSpec({ type: 'graph', title: 'G', query: 'MATCH (n) RETURN n' }, CATALOGUE).problems).toEqual([]);
    expect(checkSpec({ type: 'text', title: 'Notes', query: '# Hello' }, CATALOGUE).spec?.query).toBe('# Hello');
  });

  it('checks settings and their values, naming the allowed ones', () => {
    const type = CATALOGUE.types[0]!;
    const { settings, problems } = checkSettings(
      { legend: 'true', colors: 'rainbow', marginLeft: '40', backgroundColor: 'not a colour!', legnd: true },
      type
    );
    expect(settings).toEqual({ legend: true, marginLeft: 40 });
    const text = problems.map((p) => `${p.path}: ${p.message}`).join('\n');
    expect(text).toMatch(/settings\.colors: "rainbow" is not allowed .* Use one of: "default", "nivo", "set1"/);
    expect(text).toMatch(/settings\.backgroundColor: .*CSS colour/);
    expect(text).toMatch(/settings\.legnd: .*Did you mean "legend"\?/);
  });

  it('checks fields against the columns a query returned', () => {
    const type = CATALOGUE.types[0]!;
    const spec = checkSpec(GOOD_BAR, CATALOGUE).spec!;
    const missing = checkColumns(spec, type, {
      columns: ['segment', 'orders'],
      kinds: { segment: ['text'], orders: ['number'] },
      rows: 3,
    });
    expect(missing[0]!.message).toMatch(
      /no column "orders_count"\. Did you mean "orders"\? It returns: segment, orders/
    );
    const wrongKind = checkColumns(spec, type, {
      columns: ['segment', 'orders_count'],
      kinds: { segment: ['text'], orders_count: ['text'] },
      rows: 3,
    });
    expect(wrongKind[0]!.message).toMatch(/"Value" needs numbers, but column "orders_count" holds text/);
    const empty = checkColumns(spec, type, { columns: ['segment', 'orders_count'], kinds: {}, rows: 0 });
    expect(empty[0]).toMatchObject({ path: 'query', soft: true });
  });

  it('finds likely misspellings only', () => {
    expect(closest('Custmer', SCHEMA_NAMES.labels)).toBe('Customer');
    expect(closest('Zebra', SCHEMA_NAMES.labels)).toBeUndefined();
  });

  it('reads JSON out of prose and code fences', () => {
    expect(parseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Here it is: {"a": 1} hope that helps')).toEqual({ a: 1 });
    expect(parseJson('no json')).toBeUndefined();
  });
});

describe('building a report', () => {
  it('returns a checked report, asking for JSON with the allowed report types', async () => {
    const { builder, requests } = makeBuilder([GOOD_BAR, { settings: {} }]);
    const result = await builder.build({
      database: 'neo4j',
      prompt: 'Orders per segment',
      catalogue: CATALOGUE,
      context: { dashboard: { pages: [] }, parameters: {}, report: {}, others: [] },
    });
    expect(result.report).toMatchObject({ type: 'bar', selection: { index: 'segment', value: 'orders_count' } });
    expect(result.attempts).toBe(1);
    expect(requests[0].response_format.json_schema.schema.properties.type.enum).toEqual([
      'bar',
      'table',
      'text',
      'graph',
    ]);
    expect(requests[0].messages[0].content).toMatch(/index \(Category: text\); value \(Value: numbers\)/);
  });

  it('sends every problem back with the allowed values until the report is right', async () => {
    const { builder, requests } = makeBuilder([
      { type: 'histogram', title: 'Orders', query: 'MATCH (c:Custmer) RETURN c.segment AS segment', selection: {} },
      {
        ...GOOD_BAR,
        query: 'MATCH (c:Custmer)-[:PLACED]->(o:Order) RETURN c.segment AS segment, count(o) AS orders_count',
      },
      GOOD_BAR,
      { settings: {} },
    ]);
    const result = await builder.build({
      database: 'neo4j',
      prompt: 'Orders per segment',
      catalogue: CATALOGUE,
      context: {} as any,
    });
    expect(result.attempts).toBe(3);
    // First correction: the type, with the allowed ones.
    expect(requests[1].messages.at(-1).content).toMatch(
      /type: "histogram" is not a report type\. .*Use one of: bar \(Bar Chart\)/
    );
    // Second: the misspelt label, with a suggestion.
    expect(requests[2].messages.at(-1).content).toMatch(
      /the label "Custmer" does not exist in the database\. Did you mean "Customer"\?/
    );
  });

  it('refuses queries that would change the database', async () => {
    const { builder, requests } = makeBuilder([
      {
        ...GOOD_BAR,
        query: 'MATCH (c:Customer) SET c.seen = true RETURN c.segment AS segment, count(*) AS orders_count',
      },
      GOOD_BAR,
      { settings: {} },
    ]);
    await builder.build({ database: 'neo4j', prompt: 'x', catalogue: CATALOGUE, context: {} as any });
    expect(requests[1].messages.at(-1).content).toMatch(/would change the database\. Only read queries are allowed/);
  });

  it('points out columns that are missing or hold the wrong kind of value', async () => {
    const { builder, requests } = makeBuilder([
      {
        ...GOOD_BAR,
        query: 'MATCH (c:Customer) RETURN c.segment AS segment, c.name AS orders_name',
        selection: { index: 'segment', value: 'orders_name' },
      },
      GOOD_BAR,
      { settings: {} },
    ]);
    await builder.build({ database: 'neo4j', prompt: 'x', catalogue: CATALOGUE, context: {} as any });
    expect(requests[1].messages.at(-1).content).toMatch(/"Value" needs numbers, but column "orders_name" holds text/);
  });

  it('gives up with the problems when the model stays wrong', async () => {
    const bad = { type: 'bar', title: 'T', query: 'SELECT * FROM orders', selection: { index: 'a', value: 'b' } };
    const { builder } = makeBuilder([
      bad,
      { ...bad, query: 'SELECT 1' },
      { ...bad, query: 'SELECT 2' },
      { ...bad, query: 'SELECT 3' },
    ]);
    const error = await builder
      .build({ database: 'neo4j', prompt: 'x', catalogue: CATALOGUE, context: {} as any })
      .catch((e) => e);
    expect(error).toBeInstanceOf(BuildError);
    expect(error.problems[0].message).toMatch(/Neo4j rejects it/);
  });

  it('stops early when the same problems come back', async () => {
    const bad = { type: 'bar', title: 'T', query: 'SELECT * FROM orders', selection: { index: 'a', value: 'b' } };
    const { builder, requests } = makeBuilder([bad, bad, bad, bad]);
    await builder.build({ database: 'neo4j', prompt: 'x', catalogue: CATALOGUE, context: {} as any }).catch(() => {});
    expect(requests).toHaveLength(2);
  });

  it('accepts a report that returns no rows once that has been pointed out', async () => {
    const empty = { ...GOOD_BAR, query: GOOD_BAR.query.replace('MATCH', "MATCH (x {name: 'nothing'}) MATCH") };
    const { builder } = makeBuilder([empty, empty, { settings: {} }]);
    const result = await builder.build({ database: 'neo4j', prompt: 'x', catalogue: CATALOGUE, context: {} as any });
    expect(result.attempts).toBe(2);
    expect(result.warnings[0]).toMatch(/returns no rows/);
  });

  it('sets the settings asked for, from the report type only, correcting and then leaving out wrong ones', async () => {
    const { builder, requests } = makeBuilder([
      GOOD_BAR,
      { settings: { layout: 'sideways', legend: true } },
      { settings: { layout: 'horizontal', colors: 'rainbow' } },
      { settings: { colors: 'rainbow' } },
      { settings: { colors: 'rainbow' } },
    ]);
    const result = await builder.build({
      database: 'neo4j',
      prompt: 'horizontal bars with a legend',
      catalogue: CATALOGUE,
      context: {} as any,
    });
    expect(result.report.settings).toEqual({ legend: true, layout: 'horizontal' });
    expect(result.warnings.join('\n')).toMatch(/Left out settings\.colors/);
    // The settings step only offers this report type's settings, with their allowed values.
    expect(requests[1].messages[0].content).toMatch(/- layout: Layout - one of "vertical", "horizontal"/);
    expect(Object.keys(requests[1].response_format.json_schema.schema.properties.settings.properties)).toEqual([
      'legend',
      'colors',
      'layout',
      'marginLeft',
      'backgroundColor',
    ]);
  });

  it('checks a picked suggestion again before building it', async () => {
    const { builder, requests } = makeBuilder([{ settings: {} }]);
    const result = await builder.build({
      database: 'neo4j',
      prompt: '',
      catalogue: CATALOGUE,
      context: {} as any,
      start: GOOD_BAR,
    });
    expect(result.report.title).toBe('Orders per segment');
    // No model call for the report itself, and none for settings without a request.
    expect(requests).toHaveLength(0);
  });

  it('asks again without structured output when the endpoint does not support it', async () => {
    const { builder, requests } = makeBuilder([
      { httpStatus: 400, message: 'response_format json_schema is not supported' },
      { httpStatus: 400, message: 'response_format type json_object is not supported' },
      JSON.stringify(GOOD_BAR),
      '{"settings": {}}',
    ]);
    await builder.build({ database: 'neo4j', prompt: 'x', catalogue: CATALOGUE, context: {} as any });
    expect(requests[0].response_format.type).toBe('json_schema');
    expect(requests[1].response_format.type).toBe('json_object');
    expect(requests[2].response_format).toBeUndefined();
  });
});

describe('suggesting reports', () => {
  it('returns up to three checked suggestions, correcting the ones that fail', async () => {
    const other = {
      ...GOOD_BAR,
      title: 'Top products',
      query: 'MATCH (p:Product) RETURN p.name AS name, count(*) AS total',
      selection: { index: 'name', value: 'total' },
    };
    const { builder, requests } = makeBuilder([
      { suggestions: [GOOD_BAR, { ...other, query: 'MATCH (p:Ordr) RETURN p.name AS name, count(*) AS total' }] },
      { suggestions: [other] },
    ]);
    const suggestions = await builder.suggest({
      database: 'neo4j',
      prompt: '',
      catalogue: CATALOGUE,
      context: {} as any,
    });
    expect(suggestions.map((s) => s.title)).toEqual(['Orders per segment', 'Top products']);
    expect(requests[1].messages.at(-1).content).toMatch(/Suggestion 2:\n- query: the label "Ordr" does not exist/);
  });
});

describe('the API', () => {
  let app: FastifyInstance;
  let plain: FastifyInstance;
  let drivers: Driver[] = [];
  const editor = { authorization: 'Bearer editor-token', 'content-type': 'application/json' };
  const viewer = { authorization: 'Bearer viewer-token', 'content-type': 'application/json' };
  const model = fakeModel([]);

  beforeAll(async () => {
    const config = testConfig({ AI_BASE_URL: 'http://llm.test/v1', AI_MODEL: 'test-model' });
    const built = await makeApp({ config, llmFetch: model.fetchImpl, cypherChecks: fakeChecks() });
    app = built.app;
    const plainApp = await makeApp();
    plain = plainApp.app;
    drivers = [built.driver, plainApp.driver];
  });
  afterAll(async () => {
    await Promise.all([app.close(), plain.close()]);
    await Promise.all(drivers.map((d) => d.close()));
  });

  const payload = { prompt: 'Orders per segment with a legend', catalogue: CATALOGUE };

  it('is for editors only, and only when configured', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/ai/build', headers: viewer, payload })).statusCode).toBe(403);
    const off = await plain.inject({ method: 'POST', url: '/api/ai/suggest', headers: editor, payload });
    expect(off.statusCode).toBe(404);
  });

  it('rejects requests without a usable catalogue', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/ai/build',
      headers: editor,
      payload: { prompt: 'x', catalogue: { types: [] } },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toMatch(/catalogue\.types/);
  });
});

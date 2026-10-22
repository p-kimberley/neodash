import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Driver } from 'neo4j-driver';
import { Text2Cypher, Text2CypherError, cleanAnswer, reportShape, type ChatMessage } from '../src/text2cypher.js';
import { withoutApiKeys } from '../src/app.js';
import { makeApp, testConfig } from './helpers.js';

// The model is a fake fetch; the schema and EXPLAIN are stubbed, so no Neo4j or model is needed.

const CONFIG = {
  baseUrl: 'http://llm.test/v1/',
  model: 'test-model',
  timeoutSeconds: 5,
  maxAttempts: 2,
  temperature: 0,
  schemaTtlSeconds: 300,
};

/** A fake chat completions endpoint answering with `answers` in turn; records the requests. */
function fakeModel(answers: (string | { status: number; body: unknown })[]) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const next = answers.shift() ?? '';
    if (typeof next !== 'string') return new Response(JSON.stringify(next.body), { status: next.status });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: next } }] }), {
      status: 200,
    });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

/** A Text2Cypher whose schema is fixed and whose EXPLAIN accepts queries matching `valid`. */
function stubbed(fetchImpl: typeof fetch, valid: RegExp, config: Partial<typeof CONFIG> & { apiKey?: string } = {}) {
  const t = new Text2Cypher({ ...CONFIG, ...config }, {} as Driver, fetchImpl);
  t.schema = async () => ':Movie {title: String}\n(:Person)-[:ACTED_IN]->(:Movie)';
  t.explain = async (_db, query) => (valid.test(query) ? undefined : `Invalid input '${query}'`);
  return t;
}

describe('answers from the model', () => {
  it('strips code fences and a cypher tag', () => {
    expect(cleanAnswer('```cypher\nMATCH (n) RETURN n\n```')).toBe('MATCH (n) RETURN n');
    expect(cleanAnswer('Here you go:\n```\nMATCH (n) RETURN n\n```\nThanks')).toBe('MATCH (n) RETURN n');
    expect(cleanAnswer('cypher\nMATCH (n) RETURN n')).toBe('MATCH (n) RETURN n');
    expect(cleanAnswer('  MATCH (n) RETURN n  ')).toBe('MATCH (n) RETURN n');
  });

  it('describes report shapes by type id or by the labels older clients sent', () => {
    expect(reportShape('bar')?.description).toMatch(/category/);
    expect(reportShape('Bar Chart')).toBe(reportShape('bar'));
    expect(reportShape('circlePacking')).toBe(reportShape('circlepacking'));
    expect(reportShape('graph3d')).toBe(reportShape('graph'));
    expect(reportShape('unknown')).toBeUndefined();
  });
});

describe('translating a question', () => {
  it('sends the schema, examples, history and report shape, and returns the checked query', async () => {
    const { fetchImpl, requests } = fakeModel(['```cypher\nMATCH (m:Movie) RETURN m.title AS category, count(*) AS value\n```']);
    const t = stubbed(fetchImpl, /^MATCH/, { apiKey: 'sk-test' });
    const result = await t.translate({
      question: 'Movies per title',
      database: 'neo4j',
      reportType: 'bar',
      history: [{ question: 'All movies', query: 'MATCH (m:Movie) RETURN m' }],
      examples: [{ question: 'Count movies', answer: 'MATCH (m:Movie) RETURN count(m)' }],
    });
    // Laid out one clause per line.
    expect(result).toEqual({ query: 'MATCH (m:Movie)\nRETURN m.title AS category, count(*) AS value', attempts: 1 });

    const [request] = requests;
    expect(request!.url).toBe('http://llm.test/v1/chat/completions');
    expect(request!.headers.Authorization).toBe('Bearer sk-test');
    expect(request!.body).toMatchObject({ model: 'test-model', temperature: 0 });
    const messages: ChatMessage[] = request!.body.messages;
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('(:Person)-[:ACTED_IN]->(:Movie)');
    expect(messages[1]!.content).toContain('Count movies');
    expect(messages.slice(2, 4)).toEqual([
      { role: 'user', content: 'All movies' },
      { role: 'assistant', content: 'MATCH (m:Movie) RETURN m' },
    ]);
    expect(messages.at(-1)!.content).toMatch(/^Movies per title\nThe result must have this shape: .*category/);
  });

  it('sends no Authorization header without an API key', async () => {
    const { fetchImpl, requests } = fakeModel(['MATCH (n) RETURN n']);
    await stubbed(fetchImpl, /^MATCH/).translate({ question: 'q', database: 'neo4j' });
    expect(requests[0]!.headers.Authorization).toBeUndefined();
  });

  it('gives the model the error and another try when its query fails EXPLAIN', async () => {
    const { fetchImpl, requests } = fakeModel(['SELECT * FROM movies', 'MATCH (m:Movie) RETURN m']);
    const result = await stubbed(fetchImpl, /^MATCH/).translate({ question: 'All movies', database: 'neo4j' });
    expect(result).toEqual({ query: 'MATCH (m:Movie)\nRETURN m', attempts: 2 });
    const retry: ChatMessage[] = requests[1]!.body.messages;
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: 'SELECT * FROM movies' });
    expect(retry.at(-1)!.content).toContain("Invalid input 'SELECT * FROM movies'");
  });

  it('fails with the last answer when no attempt is valid', async () => {
    const { fetchImpl } = fakeModel(['nope', 'still nope']);
    const error = await stubbed(fetchImpl, /^MATCH/)
      .translate({ question: 'q', database: 'neo4j' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(Text2CypherError);
    expect(error).toMatchObject({ code: 'translation_failed', lastAnswer: 'still nope' });
  });

  it('reports a model error or an unreachable model as unavailable', async () => {
    const { fetchImpl } = fakeModel([{ status: 401, body: { error: { message: 'bad key' } } }]);
    await expect(stubbed(fetchImpl, /./).translate({ question: 'q', database: 'neo4j' })).rejects.toMatchObject({
      code: 'model_unavailable',
      message: expect.stringContaining('bad key'),
    });
    const down = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(stubbed(down, /./).translate({ question: 'q', database: 'neo4j' })).rejects.toMatchObject({
      code: 'model_unavailable',
    });
  });
});

describe('dashboards', () => {
  it('lose any API key, however deep', () => {
    const dashboard = {
      title: 't',
      extensions: { 'query-translator': { settings: { apiKey: 'sk-secret', modelType: 'gpt' } } },
      pages: [{ reports: [{ settings: { apiKey: 'x', keep: 1 } }] }],
    };
    const cleaned = withoutApiKeys(dashboard);
    expect(JSON.stringify(cleaned)).not.toContain('apiKey');
    expect(cleaned.extensions['query-translator'].settings).toEqual({ modelType: 'gpt' });
    expect(cleaned.pages[0]!.reports[0]!.settings).toEqual({ keep: 1 });
  });
});

describe('the API', () => {
  let app: FastifyInstance;
  let driver: Driver;
  let plain: FastifyInstance;
  let plainDriver: Driver;
  const editor = { authorization: 'Bearer editor-token', 'content-type': 'application/json' };
  const viewer = { authorization: 'Bearer viewer-token', 'content-type': 'application/json' };

  beforeAll(async () => {
    const config = testConfig({ AI_BASE_URL: 'http://llm.test/v1', AI_MODEL: 'test-model' });
    ({ app, driver } = await makeApp({ config, llmFetch: fakeModel([]).fetchImpl }));
    ({ app: plain, driver: plainDriver } = await makeApp());
  });
  afterAll(async () => {
    await Promise.all([app.close(), plain.close()]);
    await Promise.all([driver.close(), plainDriver.close()]);
  });

  it('says whether Build with AI is configured, and with which model', async () => {
    expect((await app.inject({ url: '/api/config' })).json().ai).toEqual({ enabled: true, model: 'test-model' });
    expect((await plain.inject({ url: '/api/config' })).json().ai).toEqual({ enabled: false });
  });

  it('is for editors only, and only when configured', async () => {
    const payload = { question: 'All movies' };
    expect((await app.inject({ method: 'POST', url: '/api/ai/query', headers: viewer, payload })).statusCode).toBe(403);
    const off = await plain.inject({ method: 'POST', url: '/api/ai/query', headers: editor, payload });
    expect(off.statusCode).toBe(404);
    expect(off.json().error.code).toBe('not_configured');
  });

  it('rejects empty questions and unknown databases', async () => {
    const empty = await app.inject({ method: 'POST', url: '/api/ai/query', headers: editor, payload: { question: ' ' } });
    expect(empty.statusCode).toBe(400);
    const db = await app.inject({
      method: 'POST',
      url: '/api/ai/query',
      headers: editor,
      payload: { question: 'q', database: 'secret' },
    });
    expect(db.statusCode).toBe(403);
  });

  it('needs AI_MODEL with a base URL', () => {
    expect(() => testConfig({ AI_BASE_URL: 'http://llm.test/v1' })).toThrow(/AI_MODEL/);
  });

  it('is off when AI_ENABLED is false, even with a model', () => {
    const config = testConfig({ AI_ENABLED: 'false', AI_BASE_URL: 'http://llm.test/v1', AI_MODEL: 'm' });
    expect(config.ai).toBeUndefined();
  });

  it('accepts the settings under the names of earlier versions; current names win', () => {
    const config = testConfig({
      TEXT2CYPHER_BASE_URL: 'http://old.test/v1',
      TEXT2CYPHER_MODEL: 'old-model',
      AI_MODEL: 'new-model',
    });
    expect(config.ai).toMatchObject({ baseUrl: 'http://old.test/v1', model: 'new-model' });
    expect(config.legacySettings).toEqual(['TEXT2CYPHER_BASE_URL', 'TEXT2CYPHER_MODEL']);
  });

  it('reads the API key from a file', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neodash-key-')), 'key');
    fs.writeFileSync(file, 'sk-from-file\n');
    const config = testConfig({
      AI_BASE_URL: 'http://llm.test/v1',
      AI_MODEL: 'm',
      AI_API_KEY_FILE: file,
    });
    expect(config.ai?.apiKey).toBe('sk-from-file');
    // As earlier versions named it.
    const legacy = testConfig({ AI_BASE_URL: 'http://llm.test/v1', AI_MODEL: 'm', TEXT2CYPHER_API_KEY_FILE: file });
    expect(legacy.ai?.apiKey).toBe('sk-from-file');
  });
});

describe('describing a query in plain English', () => {
  it('sends the query with the schema, and returns the description without quotes or fences', async () => {
    const { fetchImpl, requests } = fakeModel(['"The 10 newest movies, newest first."']);
    const text = await stubbed(fetchImpl, /^MATCH/).describe('neo4j', 'MATCH (m:Movie) RETURN m ORDER BY m.released DESC LIMIT 10');
    expect(text).toBe('The 10 newest movies, newest first.');
    const messages: ChatMessage[] = requests[0]!.body.messages;
    expect(messages[0]!.content).toMatch(/plain English/);
    expect(messages[0]!.content).toContain('(:Person)-[:ACTED_IN]->(:Movie)');
    expect(messages[1]).toEqual({ role: 'user', content: 'MATCH (m:Movie) RETURN m ORDER BY m.released DESC LIMIT 10' });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Driver } from 'neo4j-driver';
import { Text2Cypher } from '../../src/text2cypher.js';
import { makeApp, testConfig } from '../helpers.js';

// Text2Cypher against the dev stack's Neo4j (with the seeded data), with a fake language model.
//   npm run test:integration

const PROBE = 'integration-t2c-0000-4000-8000-000000000000';
const editor = { authorization: 'Bearer editor-token', 'content-type': 'application/json' };

/** A fake model that answers with `answers` in turn. */
const model = (answers: string[]) =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: answers.shift() ?? '' } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

describe.skipIf(!process.env.INTEGRATION)('Text2Cypher against Neo4j', () => {
  let driver: Driver;
  let app: FastifyInstance;
  const answers: string[] = [];

  beforeAll(async () => {
    const config = testConfig({ AI_BASE_URL: 'http://llm.test/v1', AI_MODEL: 'test-model' });
    ({ app, driver } = await makeApp({ config, llmFetch: model(answers) }));
  });
  afterAll(async () => {
    await driver.executeQuery('MATCH (n:_Neodash_Dashboard {uuid: $uuid}) DETACH DELETE n', { uuid: PROBE });
    await app.close();
    await driver.close();
  });

  const t2c = () =>
    new Text2Cypher(
      { baseUrl: 'http://llm.test/v1', model: 'm', timeoutSeconds: 5, maxAttempts: 2, temperature: 0, schemaTtlSeconds: 0 },
      driver,
      model([])
    );

  it('reads the schema with APOC, and without it from the built-in procedures', async () => {
    const t = t2c();
    const withApoc = await t.schema('neo4j');
    expect(withApoc).toContain(':Movie {');
    expect(withApoc).toMatch(/\(:Person\)-\[:ACTED_IN\]->\(:Movie\)/);

    const builtIn = await (t as any).readSchemaBuiltIn('neo4j');
    expect(builtIn).toContain(':Movie {');
    expect(builtIn).toMatch(/title: String/);
    expect(builtIn).toMatch(/\(:Person\)-\[:ACTED_IN\]->\(:Movie\)/);
  });

  it('checks queries with EXPLAIN without running them', async () => {
    const t = t2c();
    expect(await t.explain('neo4j', 'MATCH (m:Movie) RETURN m.title')).toBeUndefined();
    expect(await t.explain('neo4j', 'SELECT * FROM movies')).toMatch(/Invalid input/);
    // EXPLAIN never writes, even for a write query.
    expect(await t.explain('neo4j', 'CREATE (:IntegrationT2cProbe)')).toBeUndefined();
    const { records } = await driver.executeQuery('MATCH (n:IntegrationT2cProbe) RETURN count(n) AS n');
    expect(records[0]!.get('n').toNumber()).toBe(0);
  });

  it('answers a question with a checked query, retrying once with the error', async () => {
    answers.push('SELECT title FROM movie', '```cypher\nMATCH (m:Movie) RETURN m.title AS title LIMIT 5\n```');
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/query',
      headers: editor,
      payload: { question: 'Some movie titles', reportType: 'table' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      query: 'MATCH (m:Movie) RETURN m.title AS title LIMIT 5',
      attempts: 2,
      model: 'test-model',
    });
  });

  it('keeps API keys out of stored dashboards', async () => {
    const dashboard = {
      title: 'key probe',
      version: '2.4',
      pages: [{ title: 'p', reports: [] }],
      extensions: { 'query-translator': { active: true, settings: { apiKey: 'sk-leak', modelType: 'gpt-4' } } },
    };
    const put = await app.inject({ method: 'PUT', url: `/api/dashboards/${PROBE}`, headers: editor, payload: dashboard });
    expect(put.statusCode).toBe(200);
    const { records } = await driver.executeQuery('MATCH (n:_Neodash_Dashboard {uuid: $uuid}) RETURN n.content AS c', {
      uuid: PROBE,
    });
    expect(records[0]!.get('c')).not.toContain('sk-leak');

    // A key saved before this change is not sent out either.
    await driver.executeQuery('MATCH (n:_Neodash_Dashboard {uuid: $uuid}) SET n.content = $content', {
      uuid: PROBE,
      content: JSON.stringify(dashboard),
    });
    const got = await app.inject({ url: `/api/dashboards/${PROBE}`, headers: editor });
    expect(got.body).not.toContain('sk-leak');
    expect(got.json().content.extensions['query-translator'].settings).toEqual({ modelType: 'gpt-4' });
  });
});

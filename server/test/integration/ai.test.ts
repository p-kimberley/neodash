import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import neo4j, { type Driver } from 'neo4j-driver';
import { DriverChecks } from '../../src/ai/builder.js';
import { testConfig } from '../helpers.js';

// Build with AI's database checks against the dev stack's Neo4j (with the seeded retail data).
//   npm run test:integration

describe.skipIf(!process.env.INTEGRATION)('Build with AI checks against Neo4j', () => {
  let driver: Driver;
  let checks: DriverChecks;

  beforeAll(() => {
    const config = testConfig();
    driver = neo4j.driver(config.neo4j.uri, neo4j.auth.basic(config.neo4j.username, config.neo4j.password));
    checks = new DriverChecks(driver);
  });
  afterAll(async () => driver.close());

  it('plans read queries and names labels, relationship types and properties the database lacks', async () => {
    const ok = await checks.explain('neo4j', 'MATCH (c:Customer) RETURN c.name AS name', {});
    expect(ok).toMatchObject({ queryType: 'r', unknown: [] });
    const unknown = await checks.explain('neo4j', 'MATCH (c:Custmer)-[:PLACD]->(o:Order) RETURN c.nam AS name', {});
    expect(unknown.unknown).toEqual(
      expect.arrayContaining([
        { kind: 'label name', name: 'Custmer' },
        { kind: 'relationship type', name: 'PLACD' },
        { kind: 'property name', name: 'nam' },
      ])
    );
  });

  it('says when a query would write, without running it', async () => {
    const write = await checks.explain('neo4j', "CREATE (x:AiProbe {name: 'never'}) RETURN x", {});
    expect(write.error ?? write.queryType).not.toBe('r');
    const { records } = await driver.executeQuery('MATCH (x:AiProbe) RETURN count(x) AS n');
    expect(records[0]!.get('n').toNumber()).toBe(0);
  });

  it('reports syntax errors', async () => {
    expect((await checks.explain('neo4j', 'SELECT * FROM orders', {})).error).toMatch(/Invalid input/);
  });

  it('runs a query briefly and says what kind of value each column holds', async () => {
    const probe = await checks.probe(
      'neo4j',
      'MATCH (o:Order) RETURN o.id AS id, o.total AS total, o.date AS date, [o.id] AS ids, o AS order',
      {},
      5
    );
    expect(probe).toMatchObject({
      columns: ['id', 'total', 'date', 'ids', 'order'],
      kinds: { id: ['text'], total: ['number'], date: ['datetime'], ids: ['list'], order: ['node'] },
    });
    expect((probe as any).rows).toBe(25);
  });

  it('stops a query that takes too long', async () => {
    const slow = await checks.probe('neo4j', 'UNWIND range(1, 100000000) AS a WITH sum(a) AS s RETURN s', {}, 0.2);
    expect(slow).toHaveProperty('error');
  });
});

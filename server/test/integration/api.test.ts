import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import neo4j, { type Driver } from 'neo4j-driver';
import { decode } from '../../src/codec.js';
import { makeApp } from '../helpers.js';

// Runs the API against the dev stack's Neo4j (docker compose -f dev/compose.yaml up), with the
// seeded example dashboards. Authentication is faked with the bearer tokens from helpers.ts.
//   npm run test:integration

const SALES = '5a1e5000-0000-4000-8000-000000000000';
const MOVIES = '30f1e500-0000-4000-8000-000000000000';
const PROBE = 'integration-probe-0000-4000-8000-000000000000';

let app: FastifyInstance;
let driver: Driver;

const as = (role: 'viewer' | 'editor') => ({ authorization: `Bearer ${role}-token`, 'content-type': 'application/json' });
const query = (role: 'viewer' | 'editor', payload: object) => app.inject({ method: 'POST', url: '/api/query', headers: as(role), payload });
const value = (res: { json(): any }, row = 0, col = 0) => decode(res.json().records[row][col], neo4j);

async function reportId(uuid: string, title: string) {
  const res = await app.inject({ url: `/api/dashboards/${uuid}`, headers: as('viewer') });
  const reports = res.json().content.pages.flatMap((p: any) => p.reports);
  return reports.find((r: any) => r.title === title).id as string;
}

describe.skipIf(!process.env.INTEGRATION)('API against Neo4j', () => {
  beforeAll(async () => {
    ({ app, driver } = await makeApp());
  });
  afterAll(async () => {
    await driver.executeQuery('MATCH (n:_Neodash_Dashboard {uuid: $uuid}) DETACH DELETE n', { uuid: PROBE });
    await driver.executeQuery('MATCH (n:IntegrationProbe) DETACH DELETE n');
    await app.close();
    await driver.close();
  });

  it('lists the seeded dashboards', async () => {
    const res = await app.inject({ url: '/api/dashboards', headers: as('viewer') });
    const titles = res.json().dashboards.map((d: any) => d.title);
    expect(titles).toEqual(expect.arrayContaining(['Sales Overview', 'Supply Chain', 'Kitchen Sink — every report type']));
  });

  it('runs a saved report query for a viewer, with and without filters', async () => {
    const id = await reportId(SALES, 'Revenue');
    const all = await query('viewer', { dashboard: SALES, report: { id }, parameters: {} });
    expect(all.statusCode).toBe(200);
    const total = value(all);
    expect(neo4j.isInt(total)).toBe(true);

    const europe = await query('viewer', { dashboard: SALES, report: { id }, parameters: { neodash_region_name: 'Europe' } });
    expect(value(europe).toNumber()).toBeGreaterThan(0);
    expect(value(europe).toNumber()).toBeLessThan(total.toNumber());
  });

  it('accepts typed parameters such as dates from the date picker', async () => {
    const id = await reportId(SALES, 'Orders');
    const since = { $type: 'Date', _value: { year: 2026, month: 1, day: 1 } };
    const res = await query('viewer', { dashboard: SALES, report: { id }, parameters: { neodash_from_date: since } });
    const all = await query('viewer', { dashboard: SALES, report: { id }, parameters: {} });
    expect(value(res).toNumber()).toBeLessThan(value(all).toNumber());
  });

  it('serves parameter-select suggestions from the saved select report', async () => {
    const res = await app.inject({ url: `/api/dashboards/${SALES}`, headers: as('viewer') });
    const select = res.json().content.pages[0].reports.find((r: any) => r.type === 'select' && r.settings.entityType === 'Region');
    const suggestions = await query('viewer', { dashboard: SALES, report: { id: select.id }, parameters: { input: 'eur' } });
    expect(suggestions.json().records.map((r: any) => r[0])).toEqual(['Europe']);
  });

  it('returns graph values the browser can rebuild as driver objects', async () => {
    const res = await query('editor', { query: "MATCH p = (:Person {name: 'Tom Hanks'})-[:ACTED_IN]->(:Movie) RETURN p LIMIT 1" });
    const path = value(res);
    expect(neo4j.isPath(path)).toBe(true);
    expect(path.start.labels).toEqual(['Person']);
    expect(path.segments[0].relationship.type).toBe('ACTED_IN');
  });

  it('finds reports in old dashboards without report ids by position', async () => {
    const res = await query('viewer', { dashboard: MOVIES, report: { id: 'assigned-by-browser', page: 0, index: 2 }, parameters: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().records).toHaveLength(1);
  });

  it('refuses to run markdown/iframe "queries"', async () => {
    const id = await reportId(SALES, 'About');
    expect((await query('viewer', { dashboard: SALES, report: { id }, parameters: {} })).statusCode).toBe(400);
  });

  it('truncates at the row limit and reports it', async () => {
    const res = await query('editor', { query: 'UNWIND range(1, 50) AS i RETURN i', rowLimit: 10 });
    expect(res.json().records).toHaveLength(10);
    expect(res.json().truncated).toBe(true);
  });

  it('enforces the query timeout', async () => {
    const res = await query('editor', { query: 'CALL apoc.util.sleep(5000) RETURN 1', timeoutSeconds: 1 });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/terminated|timeout/i);
  });

  it('saves dashboards in the legacy format, and viewers cannot write even through a saved query', async () => {
    const dashboard = {
      title: 'Integration probe',
      version: '2.4',
      settings: { parameters: {} },
      pages: [{ title: 'P', reports: [{ id: 'write', type: 'table', title: 'Writes', query: 'CREATE (n:IntegrationProbe) RETURN n' }] }],
    };
    const saved = await app.inject({ method: 'PUT', url: `/api/dashboards/${PROBE}`, headers: as('editor'), payload: dashboard });
    expect(saved.statusCode).toBe(200);

    // Stored exactly like NeoDash 2.4 stores it.
    const { records } = await driver.executeQuery('MATCH (n:_Neodash_Dashboard {uuid: $uuid}) RETURN n', { uuid: PROBE });
    const node = records[0]!.get('n').properties;
    expect(node).toMatchObject({ title: 'Integration probe', version: '2.4', user: 'editor' });
    expect(JSON.parse(node.content)).toMatchObject({ ...dashboard, uuid: PROBE });
    expect(neo4j.isDateTime(node.date)).toBe(true);

    const attempt = await query('viewer', { dashboard: PROBE, report: { id: 'write' }, parameters: {} });
    expect(attempt.statusCode).toBe(422);
    const probes = await driver.executeQuery('MATCH (n:IntegrationProbe) RETURN count(n) AS c');
    expect(probes.records[0]!.get('c').toNumber()).toBe(0);

    // The same saved query does write for an editor.
    expect((await query('editor', { dashboard: PROBE, report: { id: 'write' }, parameters: {} })).statusCode).toBe(200);

    const deleted = await app.inject({ method: 'DELETE', url: `/api/dashboards/${PROBE}`, headers: as('editor') });
    expect(deleted.statusCode).toBe(200);
    expect((await app.inject({ url: `/api/dashboards/${PROBE}`, headers: as('viewer') })).statusCode).toBe(404);
  });
});

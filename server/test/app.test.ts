import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Driver } from 'neo4j-driver';
import { makeApp, sessionCookie, users } from './helpers.js';

// These tests never reach Neo4j: every request is rejected before a query would run.

let app: FastifyInstance;
let driver: Driver;

beforeAll(async () => {
  ({ app, driver } = await makeApp());
});
afterAll(async () => {
  await app.close();
  await driver.close();
});

const viewerCookie = () => sessionCookie(users.viewer);

describe('authentication', () => {
  it('requires a session or bearer token for the API', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.loginUrl).toBe('/auth/login');
  });

  it('rejects unknown bearer tokens and forged session cookies', async () => {
    expect((await app.inject({ url: '/api/me', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/me', headers: { cookie: 'neodash_session=forged' } })).statusCode).toBe(401);
  });

  it('identifies session and bearer users', async () => {
    const bySession = await app.inject({ url: '/api/me', headers: { cookie: viewerCookie() } });
    expect(bySession.json()).toMatchObject({ role: 'viewer', can: { edit: false } });
    const byBearer = await app.inject({ url: '/api/me', headers: { authorization: 'Bearer editor-token' } });
    expect(byBearer.json()).toMatchObject({ role: 'editor', can: { edit: true, runAdHocQueries: true } });
  });

  it('serves public config without authentication', async () => {
    const res = await app.inject({ url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().databases).toEqual(['neo4j']);
  });

  it('starts login with a sealed state cookie and only relative return paths', async () => {
    const res = await app.inject({ url: '/auth/login?returnTo=https://evil.example' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('http://idp.test/auth');
    expect(String(res.headers['set-cookie'])).toMatch(/neodash_login=.+HttpOnly/);
  });

  it('sends a callback without login state back to /auth/login', async () => {
    const res = await app.inject({ url: '/auth/callback?code=x&state=s' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});

describe('authorisation', () => {
  it('stops viewers from running ad-hoc Cypher', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/query',
      headers: { cookie: viewerCookie(), 'content-type': 'application/json', origin: 'http://neodash.test' },
      payload: { query: 'MATCH (n) DETACH DELETE n' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('stops viewers from saving or deleting dashboards', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/x',
      headers: { authorization: 'Bearer viewer-token', 'content-type': 'application/json' },
      payload: { title: 't', pages: [] },
    });
    expect(put.statusCode).toBe(403);
    const del = await app.inject({ method: 'DELETE', url: '/api/dashboards/x', headers: { authorization: 'Bearer viewer-token' } });
    expect(del.statusCode).toBe(403);
  });

  it('rejects editor queries against databases that are not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/query',
      headers: { authorization: 'Bearer editor-token', 'content-type': 'application/json' },
      payload: { query: 'RETURN 1', database: 'system' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('validates query requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/query',
      headers: { authorization: 'Bearer viewer-token', 'content-type': 'application/json' },
      payload: { parameters: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('cross-site request protection', () => {
  const editorCookie = () => sessionCookie(users.editor);

  it('rejects cookie-authenticated writes from another origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/query',
      headers: { cookie: editorCookie(), 'content-type': 'application/json', origin: 'https://evil.example' },
      payload: { query: 'RETURN 1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects cookie-authenticated writes that are not JSON (HTML form posts)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/query',
      headers: { cookie: editorCookie(), 'content-type': 'text/plain' },
      payload: '{"query":"RETURN 1"}',
    });
    expect(res.statusCode).toBe(415);
  });
});

describe('serving the UI', () => {
  it('serves the app shell for client-side routes but 404s missing files', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neodash-static-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>shell</title>');
    fs.writeFileSync(path.join(dir, 'bundle.js'), 'console.log(1)');
    const { makeApp: make, testConfig } = await import('./helpers.js');
    const { app: staticApp, driver: staticDriver } = await make({ config: testConfig({ STATIC_DIR: dir }) });
    try {
      expect((await staticApp.inject({ url: '/dashboards/abc?page=1' })).body).toContain('shell');
      expect((await staticApp.inject({ url: '/' })).body).toContain('shell');
      expect((await staticApp.inject({ url: '/bundle.js' })).statusCode).toBe(200);
      expect((await staticApp.inject({ url: '/maps/world_polymap.json' })).statusCode).toBe(404);
      expect((await staticApp.inject({ url: '/api/nope' })).statusCode).toBe(401);
    } finally {
      await staticApp.close();
      await staticDriver.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

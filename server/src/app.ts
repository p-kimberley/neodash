import path from 'node:path';
import fs from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import neo4j, { Neo4jError, type Driver } from 'neo4j-driver';
import { z } from 'zod';
import type { Config } from './config.js';
import { createAuditor } from './audit.js';
import { CookieSealer, safeReturnTo, type LoginState, type Session, type User } from './auth/session.js';
import type { OidcClient } from './auth/oidc.js';
import { decodeParameters, encode } from './codec.js';
import { DashboardStore, findReport } from './dashboards.js';
import { runQuery } from './neo4j.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    authMethod?: 'session' | 'bearer';
    session?: Session;
  }
}

const SESSION_COOKIE = 'neodash_session';
// Browsers reject cookies over 4096 bytes (name, value and attributes); leave room for the rest.
const MAX_SESSION_COOKIE_LENGTH = 3800;
const LOGIN_COOKIE = 'neodash_login';
// Report types whose "query" is not Cypher.
const NON_CYPHER_REPORTS = new Set(['text', 'iframe']);

export interface AppDeps {
  config: Config;
  driver: Driver;
  oidc: Pick<OidcClient, 'startLogin' | 'finishLogin' | 'verifyBearer' | 'logoutUrl'>;
}

const uuidParam = z.object({ uuid: z.string().min(1).max(200) });

const queryBody = z
  .object({
    // Saved query: the backend looks the Cypher up in the stored dashboard.
    dashboard: z.string().min(1).max(200).optional(),
    report: z
      .object({
        id: z.string().max(200).optional(),
        page: z.number().int().min(0).optional(),
        index: z.number().int().min(0).optional(),
      })
      .optional(),
    // Ad-hoc query: editors only.
    query: z.string().min(1).max(100_000).optional(),
    database: z.string().min(1).max(200).optional(),
    parameters: z.record(z.unknown()).default({}),
    rowLimit: z.number().int().positive().optional(),
    timeoutSeconds: z.number().positive().optional(),
    // Where an ad-hoc query came from, for the audit log only.
    context: z
      .object({ dashboard: z.string().max(200).optional(), page: z.number().int().optional(), report: z.string().max(200).optional() })
      .optional(),
  })
  .refine((b) => b.query !== undefined || (b.dashboard !== undefined && b.report !== undefined), {
    message: 'Provide either "query", or "dashboard" and "report"',
  });

export async function buildApp({ config, driver, oidc }: AppDeps) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 20 * 1024 * 1024,
  });
  const audit = createAuditor(app.log);
  const sessions = new CookieSealer(config.session.secret, 'session');
  const logins = new CookieSealer(config.session.secret, 'login');
  const store = new DashboardStore(driver, config.neo4j.dashboardDatabase);
  const publicUrl = config.publicUrl;
  const cookieBase = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: config.secureCookies };

  await app.register(cookie);
  // Clients often send Content-Type: application/json on body-less requests such as DELETE.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, body === '' ? undefined : JSON.parse(body as string));
    } catch (e) {
      (e as { statusCode?: number }).statusCode = 400;
      done(e as Error, undefined);
    }
  });

  const errorBody = (code: string, message: string, extra: Record<string, unknown> = {}) => ({ error: { code, message, ...extra } });
  const deny = (request: FastifyRequest, reply: FastifyReply, reason: string, details: Record<string, unknown> = {}) => {
    audit(request, 'access.denied', { reason, method: request.method, url: request.url, ...details });
    return reply.code(403).send(errorBody('forbidden', reason));
  };

  // --- Health ---------------------------------------------------------------------------------

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await driver.getServerInfo({ database: config.neo4j.defaultDatabase });
      return { ok: true };
    } catch (e) {
      return reply.code(503).send({ ok: false, error: (e as Error).message });
    }
  });

  // --- Authentication -------------------------------------------------------------------------

  app.get('/auth/login', async (request, reply) => {
    const { returnTo } = request.query as { returnTo?: string };
    const { url, state } = await oidc.startLogin(safeReturnTo(returnTo, config.allowedOrigins));
    reply.setCookie(LOGIN_COOKIE, logins.seal(state), { ...cookieBase, maxAge: 600 });
    return reply.redirect(url.href);
  });

  app.get('/auth/callback', async (request, reply) => {
    const login = logins.unseal<LoginState>(request.cookies[LOGIN_COOKIE]);
    reply.clearCookie(LOGIN_COOKIE, cookieBase);
    if (!login) return reply.redirect('/auth/login');

    const callbackUrl = new URL(request.url, publicUrl);
    let result;
    try {
      result = await oidc.finishLogin(callbackUrl, login);
    } catch (e) {
      audit(request, 'auth.login.failed', { error: (e as Error).message });
      return reply.code(401).type('text/html').send(page('Sign-in failed', 'Please <a href="/auth/login">try again</a>.'));
    }
    const { user, idToken } = result;
    if (!user.role) {
      audit(request, 'auth.login.denied', { subject: { sub: user.sub, username: user.username }, roles: user.roles });
      return reply
        .code(403)
        .type('text/html')
        .send(page('No access', `You are signed in as <b>${escapeHtml(user.username)}</b>, but you have not been given access to NeoDash.`, true));
    }
    // Keep the cookie small: only the NeoDash roles are needed after sign-in (all roles are in the
    // audit line below), and the ID token is only a logout hint, so it is dropped if the cookie would
    // pass the browsers' ~4 KB limit (they silently discard larger cookies, causing a sign-in loop).
    const { roleViewer, roleEditor } = config.oidc;
    const session: Session = {
      user: { ...(user as User), roles: user.roles.filter((r) => r === roleViewer || r === roleEditor) },
      idToken,
      expiresAt: Math.floor(Date.now() / 1000) + config.session.maxAgeSeconds,
    };
    let sealed = sessions.seal(session);
    if (sealed.length > MAX_SESSION_COOKIE_LENGTH) {
      delete session.idToken;
      sealed = sessions.seal(session);
    }
    reply.setCookie(SESSION_COOKIE, sealed, { ...cookieBase, maxAge: config.session.maxAgeSeconds });
    request.user = session.user;
    request.authMethod = 'session';
    audit(request, 'auth.login', { roles: user.roles });
    return reply.redirect(login.returnTo);
  });

  const logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = sessions.unseal<Session>(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    if (session) {
      request.user = session.user;
      request.authMethod = 'session';
      audit(request, 'auth.logout');
    }
    let logoutUrl: string | null = null;
    try {
      logoutUrl = await oidc.logoutUrl(publicUrl.href, session?.idToken);
    } catch (e) {
      request.log.warn({ err: e }, 'could not build identity provider logout URL');
    }
    return { logoutUrl: logoutUrl ?? '/' };
  };
  app.post('/auth/logout', logout);
  app.get('/auth/logout', async (request, reply) => reply.redirect((await logout(request, reply)).logoutUrl));

  // --- API authentication and CSRF protection --------------------------------------------------

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url.startsWith('/api/config')) return;

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = await oidc.verifyBearer(header.slice(7).trim());
      if (!user) return reply.code(401).send(errorBody('unauthenticated', 'Invalid or unauthorised bearer token'));
      request.user = user;
      request.authMethod = 'bearer';
      return;
    }

    const session = sessions.unseal<Session>(request.cookies[SESSION_COOKIE]);
    if (!session) {
      return reply.code(401).send(errorBody('unauthenticated', 'Not signed in', { loginUrl: '/auth/login' }));
    }
    request.session = session;
    request.user = session.user;
    request.authMethod = 'session';

    // Cookies are sent automatically, so state-changing requests must prove they come from our own
    // pages: JSON bodies can't be sent cross-site without a CORS preflight, and Origin must match.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin && !config.allowedOrigins.includes(origin)) return deny(request, reply, 'Cross-origin request rejected');
      const type = request.headers['content-type'] ?? '';
      if (request.method !== 'DELETE' && !type.startsWith('application/json')) {
        return reply.code(415).send(errorBody('unsupported_media_type', 'Requests must be application/json'));
      }
    }
  });

  const requireEditor = (request: FastifyRequest, reply: FastifyReply, action: string) => {
    if (request.user?.role === 'editor') return true;
    void deny(request, reply, `Editor role required to ${action}`);
    return false;
  };

  // --- API ------------------------------------------------------------------------------------

  app.get('/api/config', async () => ({
    loginUrl: '/auth/login',
    logoutUrl: '/auth/logout',
    databases: config.neo4j.databases,
    defaultDatabase: config.neo4j.defaultDatabase,
    dashboardDatabase: config.neo4j.dashboardDatabase,
    limits: {
      maxRowLimit: config.query.maxRowLimit,
      defaultTimeoutSeconds: config.query.defaultTimeoutSeconds,
      maxTimeoutSeconds: config.query.maxTimeoutSeconds,
    },
    maps: config.maps,
  }));

  app.get('/api/me', async (request) => {
    const user = request.user!;
    return {
      user: { sub: user.sub, username: user.username, name: user.name, email: user.email },
      role: user.role,
      can: { edit: user.role === 'editor', runAdHocQueries: user.role === 'editor' },
      sessionExpiresAt: request.session?.expiresAt ?? null,
    };
  });

  app.get('/api/dashboards', async (request) => {
    const dashboards = await store.list();
    audit(request, 'dashboard.list', { count: dashboards.length });
    return { dashboards };
  });

  app.get('/api/dashboards/:uuid', async (request, reply) => {
    const { uuid } = uuidParam.parse(request.params);
    const dashboard = await store.get(uuid);
    if (!dashboard) return reply.code(404).send(errorBody('not_found', 'Dashboard not found'));
    audit(request, 'dashboard.view', { dashboard: { uuid, title: dashboard.title } });
    return dashboard;
  });

  app.put('/api/dashboards/:uuid', async (request, reply) => {
    if (!requireEditor(request, reply, 'save dashboards')) return reply;
    const { uuid } = uuidParam.parse(request.params);
    const content = request.body as any;
    if (!content || typeof content !== 'object' || !Array.isArray(content.pages)) {
      return reply.code(400).send(errorBody('invalid_dashboard', 'Body must be a dashboard with a "pages" array'));
    }
    await store.save(uuid, content, request.user!.username);
    audit(request, 'dashboard.save', { dashboard: { uuid, title: content.title } });
    return { uuid };
  });

  app.delete('/api/dashboards/:uuid', async (request, reply) => {
    if (!requireEditor(request, reply, 'delete dashboards')) return reply;
    const { uuid } = uuidParam.parse(request.params);
    const deleted = await store.delete(uuid);
    if (!deleted) return reply.code(404).send(errorBody('not_found', 'Dashboard not found'));
    audit(request, 'dashboard.delete', { dashboard: { uuid } });
    return { uuid };
  });

  app.post('/api/query', async (request, reply) => {
    const parsed = queryBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid_request', parsed.error.issues.map((i) => i.message).join('; ')));
    const body = parsed.data;
    const user = request.user!;

    let query: string;
    let database: string;
    let source: Record<string, unknown>;
    if (body.query !== undefined) {
      if (user.role !== 'editor') {
        return deny(request, reply, 'Only editors can run ad-hoc queries', { query: body.query, context: body.context });
      }
      query = body.query;
      database = body.database ?? config.neo4j.defaultDatabase;
      source = { mode: 'adhoc', query, context: body.context };
    } else {
      const dashboard = await store.get(body.dashboard!);
      if (!dashboard) return reply.code(404).send(errorBody('not_found', 'Dashboard not found'));
      const report = findReport(dashboard.content, body.report!);
      if (!report) return reply.code(404).send(errorBody('not_found', 'Report not found in the saved dashboard'));
      if (NON_CYPHER_REPORTS.has(report.type)) {
        return reply.code(400).send(errorBody('invalid_request', `Reports of type "${report.type}" have no query`));
      }
      query = report.query;
      database = report.database ?? config.neo4j.defaultDatabase;
      source = {
        mode: 'saved',
        dashboard: { uuid: dashboard.uuid, title: dashboard.title },
        page: report.page,
        report: { id: report.id, index: report.index, title: report.title, type: report.type },
      };
    }
    if (!config.neo4j.databases.includes(database)) {
      return deny(request, reply, `Database "${database}" is not available`);
    }

    const accessMode = user.role === 'editor' ? 'WRITE' : 'READ';
    const rowLimit = Math.min(body.rowLimit ?? 1000, config.query.maxRowLimit);
    const timeoutSeconds = Math.min(body.timeoutSeconds ?? config.query.defaultTimeoutSeconds, config.query.maxTimeoutSeconds);
    let parameters: Record<string, unknown>;
    try {
      parameters = decodeParameters(body.parameters, neo4j);
    } catch (e) {
      return reply.code(400).send(errorBody('invalid_parameters', (e as Error).message));
    }
    // Unset dashboard parameters arrive as missing; Neo4j would reject the query, so they become null
    // (what NeoDash's "ignoreNonDefinedParams" does in the browser). Extra names are ignored by Neo4j.
    for (const [, name] of query.matchAll(/\$(\w+)/g)) {
      if (name && !(name in parameters)) parameters[name] = null;
    }
    const auditBase = {
      ...source,
      database,
      accessMode,
      ...(config.audit.logParameters ? { parameters: body.parameters } : {}),
    };

    try {
      const result = await runQuery(driver, query, parameters, { database, accessMode, rowLimit, timeoutSeconds });
      audit(request, 'query', { ...auditBase, outcome: 'ok', rows: result.records.length, truncated: result.truncated, durationMs: result.durationMs });
      return {
        keys: result.keys,
        records: result.records.map((r) => r.keys.map((k) => encode(r.get(k)))),
        truncated: result.truncated,
        durationMs: result.durationMs,
      };
    } catch (e) {
      const err = e as Neo4jError;
      const unavailable = err.code === 'ServiceUnavailable' || err.code === 'SessionExpired';
      audit(request, 'query', { ...auditBase, outcome: 'error', errorCode: err.code, error: err.message });
      return reply
        .code(unavailable ? 503 : 422)
        .send(errorBody(unavailable ? 'neo4j_unavailable' : 'query_failed', err.message, { neo4jCode: err.code }));
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send(errorBody('invalid_request', error.issues.map((i) => i.message).join('; ')));
    }
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'request failed');
    return reply.code(status).send(errorBody(status >= 500 ? 'internal_error' : 'bad_request', status >= 500 ? 'Internal server error' : error.message));
  });

  // --- Frontend -------------------------------------------------------------------------------

  if (config.staticDir) {
    const root = path.resolve(config.staticDir);
    await app.register(fastifyStatic, { root, wildcard: false, index: false });
    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split('?')[0] ?? '';
      // Missing files (anything with an extension, e.g. /maps/x.json) are a real 404, not the app.
      const isFile = /\.[a-z0-9]+$/i.test(pathname);
      if (request.method !== 'GET' || isFile || pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
        return reply.code(404).send(errorBody('not_found', 'Not found'));
      }
      // Client-side routes (e.g. /dashboards/<uuid>) all get the app shell.
      return reply.type('text/html').header('cache-control', 'no-cache').send(indexHtml);
    });
  }

  return app;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function page(title: string, body: string, withLogout = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · NeoDash</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5}</style></head>
<body><h1>${title}</h1><p>${body}</p>${withLogout ? '<p><a href="/auth/logout">Sign out</a></p>' : ''}</body></html>`;
}

import neo4j from 'neo4j-driver';
import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CookieSealer, type Session, type User } from '../src/auth/session.js';

export const SECRET = 'test-session-secret-0123456789-abcdef';

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    PUBLIC_URL: 'http://neodash.test',
    NEO4J_URI: process.env.NEO4J_URI ?? 'neo4j://localhost:7687',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? 'devpassword',
    OIDC_ISSUER_URL: 'http://idp.test/realms/neodash',
    OIDC_CLIENT_ID: 'neodash',
    OIDC_CLIENT_SECRET: 'secret',
    SESSION_SECRET: SECRET,
    LOG_LEVEL: 'fatal',
    ...overrides,
  });
}

export const users: Record<'viewer' | 'editor', User> = {
  viewer: { sub: 'v1', username: 'viewer', roles: ['neodash-viewer'], role: 'viewer' },
  editor: { sub: 'e1', username: 'editor', roles: ['neodash-editor'], role: 'editor' },
};

/** Bearer tokens "viewer-token" and "editor-token" authenticate as the matching user. */
export const fakeOidc: AppDeps['oidc'] = {
  startLogin: async (returnTo) => ({
    url: new URL('http://idp.test/auth?state=s'),
    state: { state: 's', nonce: 'n', codeVerifier: 'v', returnTo, expiresAt: Math.floor(Date.now() / 1000) + 600 },
  }),
  finishLogin: async () => ({ user: users.editor, idToken: 'id-token' }),
  verifyBearer: async (token) => (token === 'viewer-token' ? users.viewer : token === 'editor-token' ? users.editor : null),
  logoutUrl: async () => 'http://idp.test/logout',
};

export function sessionCookie(user: User) {
  const session: Session = { user, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  return `neodash_session=${new CookieSealer(SECRET, 'session').seal(session)}`;
}

export async function makeApp(overrides: Partial<AppDeps> = {}) {
  const config = overrides.config ?? testConfig();
  const driver = overrides.driver ?? neo4j.driver(config.neo4j.uri, neo4j.auth.basic(config.neo4j.username, config.neo4j.password));
  const app = await buildApp({
    config,
    driver,
    oidc: overrides.oidc ?? fakeOidc,
    llmFetch: overrides.llmFetch,
    cypherChecks: overrides.cypherChecks,
  });
  return { app, driver, config };
}

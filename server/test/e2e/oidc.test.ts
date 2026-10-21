import { describe, expect, it } from 'vitest';

// Signs in through the real Keycloak login page against the backend running in the dev stack:
//   docker compose -f dev/compose.yaml up -d --build
//   npm run test:e2e

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3000';
const KEYCLOAK = process.env.KEYCLOAK_URL ?? 'http://localhost:8080/realms/neodash';

class Browser {
  private jar = new Map<string, string>();

  async fetch(url: string, init: RequestInit = {}) {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers as Record<string, string>), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [name, ...value] = pair!.split('=');
      const v = value.join('=');
      if (v && !/max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.jar.set(name!.trim(), v);
      else this.jar.delete(name!.trim());
    }
    return res;
  }

  has(name: string) {
    return this.jar.has(name);
  }
}

/** Follows the full authorization-code flow and returns the browser plus the callback response. */
async function signIn(username: string) {
  const browser = new Browser();
  const start = await browser.fetch(`${BACKEND}/auth/login?returnTo=/dashboards/abc`);
  expect(start.status).toBe(302);
  const loginPage = await browser.fetch(start.headers.get('location')!);
  const html = await loginPage.text();
  const action = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  expect(action, 'Keycloak login form').toBeTruthy();
  const submitted = await browser.fetch(action!, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password: 'password', credentialId: '' }),
  });
  expect(submitted.status).toBe(302);
  const callback = await browser.fetch(submitted.headers.get('location')!);
  return { browser, callback };
}

async function token(username: string) {
  const res = await fetch(`${KEYCLOAK}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'neodash', client_secret: 'neodash-dev-secret', username, password: 'password', scope: 'openid' }),
  });
  return ((await res.json()) as any).access_token as string;
}

describe.skipIf(!process.env.E2E)('OIDC sign-in against Keycloak', () => {
  it('signs a viewer in and returns them to where they started', async () => {
    const { browser, callback } = await signIn('viewer');
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/dashboards/abc');
    expect(browser.has('neodash_session')).toBe(true);

    const me = (await (await browser.fetch(`${BACKEND}/api/me`)).json()) as any;
    expect(me).toMatchObject({ role: 'viewer', user: { username: 'viewer', email: 'viewer@example.com' }, can: { edit: false } });

    const dashboards = (await (await browser.fetch(`${BACKEND}/api/dashboards`)).json()) as any;
    expect(dashboards.dashboards.length).toBeGreaterThanOrEqual(4);
  });

  it('gives editors the editor role', async () => {
    const { browser } = await signIn('editor');
    expect(((await (await browser.fetch(`${BACKEND}/api/me`)).json()) as any).role).toBe('editor');
  });

  it('turns away users without a NeoDash role, without creating a session', async () => {
    const { browser, callback } = await signIn('nobody');
    expect(callback.status).toBe(403);
    expect(await callback.text()).toContain('not been given access');
    expect(browser.has('neodash_session')).toBe(false);
  });

  it('logs out locally and at Keycloak', async () => {
    const { browser } = await signIn('viewer');
    const res = await browser.fetch(`${BACKEND}/auth/logout`, { method: 'POST' });
    const { logoutUrl } = (await res.json()) as any;
    expect(logoutUrl).toContain(`${KEYCLOAK}/protocol/openid-connect/logout`);
    expect(logoutUrl).toContain('id_token_hint=');
    expect((await browser.fetch(`${BACKEND}/api/me`)).status).toBe(401);
  });

  it('accepts Keycloak access tokens as bearer tokens, with the same roles', async () => {
    const viewer = await fetch(`${BACKEND}/api/me`, { headers: { authorization: `Bearer ${await token('viewer')}` } });
    expect(((await viewer.json()) as any).role).toBe('viewer');
    const nobody = await fetch(`${BACKEND}/api/me`, { headers: { authorization: `Bearer ${await token('nobody')}` } });
    expect(nobody.status).toBe(401);
  });
});

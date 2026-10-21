import fs from 'node:fs';
import net from 'node:net';
import { chromium } from '@playwright/test';
import { BASE } from './playwright.config.mjs';

/**
 * Signs in once per role and saves the session for the tests. When run in Docker (run.sh sets
 * E2E_FORWARD_HOST), first forwards the dev stack's localhost ports to the host, so the browser
 * reaches the app and Keycloak on the same localhost URLs as the backend's OIDC configuration.
 */
export default async function globalSetup() {
  const servers = [];
  const host = process.env.E2E_FORWARD_HOST;
  if (host) {
    for (const port of [5173, 3000, 8080]) {
      const server = net.createServer((client) => {
        const upstream = net.connect(port, host);
        client.pipe(upstream).pipe(client);
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      });
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      servers.push(server);
    }
  }

  fs.mkdirSync('./.auth', { recursive: true });
  const browser = await chromium.launch();
  for (const role of ['editor', 'viewer']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/`);
    await page.waitForURL(/localhost:8080/, { timeout: 60_000 });
    await page.fill('#username', role);
    await page.fill('#password', 'password');
    await page.click('#kc-login');
    await page.waitForURL((u) => u.href.startsWith(BASE), { timeout: 30_000 });
    await context.storageState({ path: `./.auth/${role}.json` });
    await context.close();
  }
  await browser.close();

  return async () => servers.forEach((s) => s.close());
}

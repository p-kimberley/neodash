import fs from 'node:fs';
import net from 'node:net';
import { chromium } from '@playwright/test';
import { BASE } from './playwright.config.mjs';

/**
 * Connects to the host, retrying slow attempts. Docker Desktop now and then leaves a new connection
 * from a container to the host unanswered for 10-70s (or, with Node's default 250ms per-address
 * limit, fails it), which left reports loading until the tests timed out. IPv4 only: the host's
 * IPv6 address isn't served.
 */
const connectToHost = (port, host, attempts = 5) =>
  new Promise((resolve, reject) => {
    const attempt = (left) => {
      const socket = net.connect({ port, host, family: 4 });
      const retry = (error) => {
        clearTimeout(timer);
        socket.destroy();
        if (left > 1) {
          attempt(left - 1);
        } else {
          reject(error);
        }
      };
      const timer = setTimeout(() => retry(new Error(`no answer from ${host}:${port}`)), 1000);
      socket.once('error', retry);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.removeListener('error', retry);
        resolve(socket);
      });
    };
    attempt(attempts);
  });

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
        // Hold what the browser sends until the host connection is up.
        client.pause();
        client.on('error', () => client.destroy());
        connectToHost(port, host).then(
          (upstream) => {
            if (client.destroyed) {
              upstream.destroy();
              return;
            }
            upstream.on('error', () => client.destroy());
            client.on('close', () => upstream.destroy());
            client.pipe(upstream).pipe(client);
          },
          () => client.destroy()
        );
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

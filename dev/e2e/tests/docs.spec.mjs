// The documentation the app serves at /docs (scripts/build-docs.mjs).
import { test, expect } from '@playwright/test';
import { SALES, openPage } from './helpers.mjs';

test('help > documentation opens the docs in a new tab, in the app theme', async ({ page, context }, info) => {
  await openPage(page, SALES);
  await page.getByRole('button', { name: 'Help and documentation' }).click();
  const [docs] = await Promise.all([context.waitForEvent('page'), page.getByRole('menuitem', { name: 'Documentation' }).click()]);
  await docs.waitForLoadState();
  await expect(docs).toHaveURL(/\/docs\/index\.html$/);
  await expect(docs).toHaveTitle(/NeoDash documentation/);
  await expect(docs.locator('html')).toHaveAttribute('data-theme', info.project.name);
});

test('docs: navigation, search and no requests elsewhere', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const elsewhere = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) elsewhere.push(r.url());
  });
  // The backend redirects /docs/ to index.html; the dev server serves it directly.
  await page.goto('/docs/');
  await expect(page).toHaveURL(/\/docs\/(index\.html)?$/);
  await expect(page.locator('.doc h1')).toHaveText('Introduction');

  // The sidebar opens a page and expands its group; the current page is marked.
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.getByRole('link', { name: 'Sankey Chart' })).toBeHidden();
  await sidebar.getByRole('link', { name: 'User Guide' }).click();
  await sidebar.getByRole('link', { name: 'Reports', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Sankey Chart' }).click();
  await expect(page).toHaveURL(/user-guide\/reports\/sankey\.html$/);
  await expect(page.locator('.sidebar [aria-current="page"]')).toHaveText('Sankey Chart');
  await expect(page.locator('.crumbs')).toContainText('Reports');
  // Screenshots load from the bundled images.
  const image = page.locator('.doc img').first();
  await expect(image).toBeVisible();
  expect(await image.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  // Next/previous follow the navigation order.
  await page.locator('.pager .next').click();
  await expect(page).toHaveURL(/user-guide\/reports\/gantt\.html$/);
  await page.waitForLoadState('domcontentloaded');

  // Search: "/" focuses it, arrows and Enter pick a result.
  await page.keyboard.press('/');
  await page.keyboard.type('rule based styling');
  await expect(page.locator('#search-results [role="option"]').first()).toContainText('Rule-Based Styling');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/user-guide\/extensions\/rule-based-styling\.html/);
  await expect(page.locator('.doc h1')).toHaveText('Rule-Based Styling');

  expect(elsewhere).toEqual([]);
});

test('docs: every link between pages, to images and to anchors resolves', async ({ page, request }) => {
  await page.goto('/docs/index.html');
  const pages = await page.evaluate(() => window.ND_DOCS_INDEX.map((p) => p.u));
  expect(pages.length).toBeGreaterThan(40);
  const broken = [];
  const checked = new Map();
  for (const p of pages) {
    const url = new URL(`/docs/${p}`, page.url()).href;
    const html = await (await request.get(url)).text();
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !/^(https?:|mailto:)/.test(r));
    for (const ref of refs) {
      const target = new URL(ref, url);
      const file = target.href.split('#')[0];
      if (!checked.has(file)) checked.set(file, await request.get(file));
      const response = checked.get(file);
      if (!response.ok()) {
        broken.push(`${p} -> ${ref} (${response.status()})`);
      } else if (target.hash && file.endsWith('.html')) {
        const id = decodeURIComponent(target.hash.slice(1));
        if (!(await response.text()).includes(`id="${id}"`)) broken.push(`${p} -> ${ref} (no such anchor)`);
      }
    }
  }
  expect(broken).toEqual([]);
});

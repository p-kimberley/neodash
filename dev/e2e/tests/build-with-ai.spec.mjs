// Build with AI: a description in a report's settings becomes a query, written by the language model the
// server is configured with. In the dev stack that is the stand-in model (dev/fake-llm), which answers
// with fixed queries for the seeded data.
import { test, expect } from '@playwright/test';
import {
  SALES,
  card,
  deleteDashboard,
  expectNoErrors,
  getDashboard,
  openPage,
  putDashboard,
  reportMenu,
  trackErrors,
} from './helpers.mjs';

test('build with AI: a description becomes a checked query that runs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');

  const dash = await getDashboard(page, SALES);
  const report = { ...dash.pages[0].reports[0], title: 'Asked', type: 'table', query: 'RETURN 1 AS placeholder' };
  const uuid = `dddd0000-0000-4000-8000-0000000t2c${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, {
    ...dash,
    title: 'e2e build with ai',
    // Build with AI is part of the app: no extension needs turning on.
    pages: [{ title: 'Ask', reports: [{ ...report, x: 0, y: 0, width: 12, height: 5 }] }],
    extensions: {},
  });
  try {
    await openPage(page, uuid);
    const asked = card(page, 'Asked');
    await reportMenu(asked, 'Settings');

    // Describe the report, then build.
    await asked.getByRole('switch', { name: 'Build with AI' }).click();
    const english = asked.locator('.cm-content').first();
    await english.click();
    await page.keyboard.type('Which movies came out most recently?');
    await asked.getByRole('button', { name: 'Build', exact: true }).click();

    // The model's query (checked by the server) replaces the report's query, and the report runs it.
    await expect(asked.locator('.cm-content').first()).toContainText('MATCH (m:Movie)', { timeout: 30_000 });
    await asked.getByRole('button', { name: 'Run' }).first().click();
    await expect(asked.getByRole('columnheader', { name: /title/ })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('build with AI: the dashboard button shows the configured model', async ({ page }) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');
  const dash = await getDashboard(page, SALES);
  const uuid = `dddd0000-0000-4000-8000-0000000t2b${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, {
    ...dash,
    title: 'e2e build with ai settings',
    extensions: {},
  });
  try {
    await openPage(page, uuid);
    await page.getByRole('button', { name: 'Build with AI', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(config.ai.model);
    // No API keys or providers are asked for in the browser any more.
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
  } finally {
    await deleteDashboard(page, uuid);
  }
});

test('build with AI is part of the app, not an extension', async ({ page }) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');
  await openPage(page, SALES);
  await expect(page.getByRole('button', { name: 'Build with AI', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Advanced Visualizations', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Text2Cypher|Build with AI/)).toHaveCount(0);
});

test.describe('viewer', () => {
  test.use({ storageState: './.auth/viewer.json' });

  test('viewers get no Build with AI button', async ({ page }) => {
    await openPage(page, SALES);
    await expect(page.getByRole('button', { name: 'Build with AI', exact: true })).toHaveCount(0);
  });
});

// Build with AI: a description in a report's settings becomes a query, written by the language model the
// server is configured with. In the dev stack that is the stand-in model (dev/fake-llm), which answers
// with fixed queries for the seeded data.
import { test, expect } from '@playwright/test';
import {
  SALES,
  card,
  deleteDashboard,
  editReport,
  expectNoErrors,
  getDashboard,
  openPage,
  putDashboard,
  trackErrors,
} from './helpers.mjs';

test('build with AI: a question in English becomes a checked query that runs', async ({ page }) => {
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
    await editReport(asked);

    // Switching to English describes the current query in plain English.
    await asked.getByRole('switch', { name: 'Write the query in English' }).click();
    const english = asked.locator('.cm-content').first();
    await expect(english).toContainText('How many nodes have each label', { timeout: 30_000 });
    // Write a different question, then translate.
    await english.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Which movies came out most recently?');
    await asked.getByRole('button', { name: 'Translate' }).click();

    // The model's query (checked by the server, laid out one clause per line) replaces the report's
    // query, and the report runs it.
    await expect(asked.locator('.cm-content').first()).toContainText('MATCH (m:Movie)', { timeout: 30_000 });
    await expect(asked.locator('.cm-line')).toHaveCount(4); // MATCH, RETURN, ORDER BY, LIMIT
    // Back in English, the question that produced this query is kept (not described again).
    await asked.getByRole('switch', { name: 'Write the query in English' }).click();
    await expect(asked.locator('.cm-content').first()).toContainText('Which movies came out most recently?');
    await asked.getByRole('switch', { name: 'Write the query in English' }).click();
    await asked.getByRole('button', { name: 'Save' }).first().click();
    await expect(asked.getByRole('columnheader', { name: /title/ })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('build with AI: a question saved without Translate is translated when the report runs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');

  const dash = await getDashboard(page, SALES);
  const report = { ...dash.pages[0].reports[0], title: 'Unsent', type: 'table', query: 'RETURN 1 AS placeholder' };
  const uuid = `dddd0000-0000-4000-8000-0000000t2u${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, {
    ...dash,
    title: 'e2e build with ai unsent',
    pages: [{ title: 'Ask', reports: [{ ...report, x: 0, y: 0, width: 12, height: 5 }] }],
    extensions: {},
  });
  try {
    await openPage(page, uuid);
    const unsent = card(page, 'Unsent');
    await editReport(unsent);
    await unsent.getByRole('switch', { name: 'Write the query in English' }).click();
    const english = unsent.locator('.cm-content').first();
    await expect(english).toContainText('How many nodes have each label', { timeout: 30_000 });
    await english.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Which movies came out most recently?');
    await page.waitForTimeout(500);
    // Saved without pressing Translate: the question is translated as the report runs.
    await unsent.getByRole('button', { name: 'Save' }).first().click();
    await expect(unsent.getByRole('columnheader', { name: /title/ })).toBeVisible({ timeout: 30_000 });
    await editReport(unsent);
    await expect(unsent.locator('.cm-content').first()).toContainText('MATCH (m:Movie)');
    await unsent.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('build with AI is part of the app, not an extension', async ({ page }) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');
  await openPage(page, SALES);
  // No dashboard-level button: Build with AI is reached from reports (empty ones, and Change with AI).
  await expect(page.getByRole('button', { name: 'Build with AI', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Advanced Visualizations', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Text2Cypher|Build with AI/)).toHaveCount(0);
});

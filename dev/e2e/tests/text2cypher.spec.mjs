// Text2Cypher: a question in a report's settings becomes a query, written by the language model the
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
  trackErrors,
} from './helpers.mjs';

const QUERY_TRANSLATOR_REDUCER = 'DASHBOARD/EXTENSIONS/QUERY_TRANSLATOR/';

test('text2cypher: a question becomes a checked query that runs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.text2cypher?.enabled, 'the backend has no language model configured');

  const dash = await getDashboard(page, SALES);
  const report = { ...dash.pages[0].reports[0], title: 'Asked', type: 'table', query: 'RETURN 1 AS placeholder' };
  const uuid = `dddd0000-0000-4000-8000-0000000t2c${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, {
    ...dash,
    title: 'e2e text2cypher',
    pages: [{ title: 'Ask', reports: [{ ...report, x: 0, y: 0, width: 12, height: 5 }] }],
    extensions: {
      ...(dash.extensions || {}),
      'query-translator': { active: true, lastMessages: {}, examples: [] },
      activeReducers: [...((dash.extensions || {}).activeReducers || []), QUERY_TRANSLATOR_REDUCER],
    },
  });
  try {
    await openPage(page, uuid);
    const asked = card(page, 'Asked');
    await asked.getByRole('button', { name: 'Settings' }).click();

    // Write the query in English, then translate.
    await asked.getByRole('switch', { name: 'Write the query in English' }).click();
    const english = asked.locator('.cm-content').first();
    await english.click();
    await page.keyboard.type('Which movies came out most recently?');
    await asked.getByRole('button', { name: 'Translate' }).click();

    // The model's query (checked by the server) replaces the report's query, and the report runs it.
    await expect(asked.locator('.cm-content').first()).toContainText('MATCH (m:Movie)', { timeout: 30_000 });
    await asked.getByRole('button', { name: 'Run' }).first().click();
    await expect(asked.getByRole('columnheader', { name: /title/ })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('text2cypher: the dashboard button shows the configured model', async ({ page }) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.text2cypher?.enabled, 'the backend has no language model configured');
  const dash = await getDashboard(page, SALES);
  const uuid = `dddd0000-0000-4000-8000-0000000t2b${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, {
    ...dash,
    title: 'e2e text2cypher settings',
    extensions: { ...(dash.extensions || {}), 'query-translator': { active: true, lastMessages: {}, examples: [] } },
  });
  try {
    await openPage(page, uuid);
    await page.getByRole('button', { name: 'Text2Cypher', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(config.text2cypher.model);
    // No API keys or providers are asked for in the browser any more.
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
  } finally {
    await deleteDashboard(page, uuid);
  }
});

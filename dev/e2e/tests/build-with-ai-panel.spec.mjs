// Build with AI inside an empty report: suggestions, building from a description, Undo. The dev
// stack's stand-in model answers with reports for the seed data (dev/fake-llm).
import { test, expect } from '@playwright/test';
import { SALES, deleteDashboard, expectNoErrors, getDashboard, openPage, putDashboard, trackErrors } from './helpers.mjs';

const setUp = async (page, suffix) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');
  const dash = await getDashboard(page, SALES);
  const empty = {
    ...dash.pages[0].reports[0],
    id: 'a1000000-0000-4000-8000-000000000001',
    title: '',
    type: 'table',
    query: '',
    settings: {},
    selection: {},
    fields: [],
    x: 0,
    y: 0,
    width: 10,
    height: 5,
  };
  const uuid = `dddd0000-0000-4000-8000-0000000ai${suffix}${test.info().project.name === 'dark' ? 'd' : 'e'}`.slice(0, 36);
  await putDashboard(page, uuid, { ...dash, title: 'e2e build with ai', pages: [{ title: 'AI', reports: [empty] }] });
  await openPage(page, uuid);
  return uuid;
};

test('a suggestion builds a working report; Undo puts the empty report back', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '1');
  try {
    const report = page.locator('.nd-report-card').first();
    await report.getByRole('button', { name: 'Build with AI' }).click();
    const panel = report.getByRole('region', { name: 'Build with AI' });
    const suggestion = panel.getByRole('button', { name: /Customers by segment/ });
    await expect(suggestion).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole('button', { name: /Orders by channel/ })).toBeVisible();

    await suggestion.click();
    // The built pie chart, titled, with its fields chosen.
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('Customers by segment', { timeout: 30_000 });
    await expect(report.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(report.getByText('Category')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(report.getByRole('button', { name: 'Configure' })).toBeVisible();
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('');
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('a description steers the suggestions, and Build builds it (corrected when the first try is wrong)', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '2');
  try {
    const report = page.locator('.nd-report-card').first();
    await report.getByRole('button', { name: 'Build with AI' }).click();
    const panel = report.getByRole('region', { name: 'Build with AI' });
    // "broken" makes the stand-in model's first answer use a misspelt label, which the server corrects.
    await panel.getByLabel('Describe the report').fill('broken: top products, horizontal with a legend');
    await expect(panel.getByText('Suggestions for your description')).toBeVisible();
    await expect(panel.getByRole('button', { name: /Top products by units/ }).first()).toBeVisible({ timeout: 30_000 });
    await panel.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('Top products by units', { timeout: 30_000 });
    await expect(report.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('without a language model there is only Configure', async ({ page }) => {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, ai: { enabled: false } } });
  });
  // The app reads its config through the page (mocked here); setUp's own check doesn't go through it.
  const uuid = await setUp(page, '3');
  try {
    const report = page.locator('.nd-report-card').first();
    await expect(report.getByRole('button', { name: 'Configure' })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Build with AI' })).toHaveCount(0);
  } finally {
    await deleteDashboard(page, uuid);
  }
});

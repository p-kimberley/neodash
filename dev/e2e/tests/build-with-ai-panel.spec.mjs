// Build with AI: options (with previews and plain descriptions) in an empty report and in a report's
// settings, picked to build or change the report, with Undo. The dev stack's stand-in model answers
// with reports for the seed data (dev/fake-llm).
import { test, expect } from '@playwright/test';
import {
  SALES,
  deleteDashboard,
  editReport,
  expectNoErrors,
  getDashboard,
  openPage,
  putDashboard,
  trackErrors,
} from './helpers.mjs';

/** A temporary dashboard with one report (empty unless given a query), opened. */
const setUp = async (page, suffix, report = {}) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  test.skip(!config.ai?.enabled, 'the backend has no language model configured');
  const dash = await getDashboard(page, SALES);
  const only = {
    ...dash.pages[0].reports[0],
    id: `a1000000-0000-4000-8000-00000000000${suffix}`,
    title: '',
    type: 'table',
    query: '',
    settings: {},
    selection: {},
    fields: [],
    x: 0,
    y: 0,
    width: 12,
    height: 6,
    ...report,
  };
  const uuid = `dddd0000-0000-4000-8000-0000000ai${suffix}${test.info().project.name === 'dark' ? 'd' : 'e'}`.slice(
    0,
    36
  );
  await putDashboard(page, uuid, { ...dash, title: 'e2e build with ai', pages: [{ title: 'AI', reports: [only] }] });
  await openPage(page, uuid);
  return uuid;
};

const options = (scope) => scope.getByRole('button').filter({ has: scope.page().locator('.nd-ai-preview') });

test('options for an empty report: a preview, a description, the recommended one first; picking one builds it, Undo empties it', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '1');
  try {
    const report = page.locator('.nd-report-card').first();
    await report.getByRole('button', { name: 'Build with AI' }).click();
    const panel = report.getByRole('region', { name: 'Build with AI' });
    await expect(options(panel)).toHaveCount(3, { timeout: 30_000 });
    await expect(options(panel).first()).toContainText('Recommended');
    await expect(options(panel).first()).toContainText('sales channels along the bottom');
    // Each preview is drawn from the option's data (bars, slices, a line).
    await expect(
      panel.locator('.nd-ai-preview rect, .nd-ai-preview path, .nd-ai-preview polyline').first()
    ).toBeVisible();

    await options(panel).filter({ hasText: 'Customers by segment' }).click();
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('Customers by segment', {
      timeout: 30_000,
    });
    await expect(report.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(report.getByRole('button', { name: 'Configure' })).toBeVisible();
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('');
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('typing asks for options when it pauses (corrected on the server when the first try is wrong), with a note on their settings', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '2');
  try {
    const report = page.locator('.nd-report-card').first();
    await report.getByRole('button', { name: 'Build with AI' }).click();
    const panel = report.getByRole('region', { name: 'Build with AI' });
    await expect(options(panel)).toHaveCount(3, { timeout: 30_000 });
    // "broken" makes the stand-in model's first answer use a misspelt label, which the server corrects.
    await panel.getByLabel('Describe the report').fill('broken: top products, horizontal with a legend');
    // While the options are worked out, a placeholder holds their place.
    await expect(panel.locator('.nd-ai-option-loading').first()).toBeVisible();
    const recommended = options(panel).first();
    await expect(recommended).toContainText('Top products by units', { timeout: 30_000 });
    await expect(recommended).toContainText('Recommended');
    await expect(recommended).toContainText('Bars run sideways. A legend is shown.');
    await expect(options(panel).nth(1)).toContainText('(table)');

    await recommended.click();
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('Top products by units', {
      timeout: 30_000,
    });
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

test('Ask AI in report settings offers changes; picking one changes the whole report, Undo restores it', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '4', {
    title: 'Customers',
    query: 'MATCH (c:Customer) RETURN c.name AS name LIMIT 5',
  });
  try {
    const report = page.locator('.nd-report-card').first();
    await expect(report.getByRole('columnheader', { name: 'name' })).toBeVisible();
    await editReport(report);
    // Ask AI opens from "Change with AI", beside Type and Database.
    await expect(report.getByLabel('Ask AI to change this report')).toHaveCount(0);
    await report.getByRole('button', { name: 'Change with AI' }).click();
    await report.getByLabel('Ask AI to change this report').fill('top products as horizontal bars with a legend');
    const recommended = options(report).first();
    await expect(recommended).toContainText('Top products by units', { timeout: 30_000 });
    await recommended.click();
    await expect(page.getByText(/Changed: Top products by units/)).toBeVisible();
    await expect(report.locator('.cm-content').first()).toContainText(':CONTAINS]->(p:Product)');
    await report.getByRole('button', { name: 'Save' }).click();
    await expect(report.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    // The title stays (it was set); Undo brings back the table.
    await expect(report.locator('input[aria-label="Report title"]')).toHaveValue('Customers');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(report.getByRole('columnheader', { name: 'name' })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

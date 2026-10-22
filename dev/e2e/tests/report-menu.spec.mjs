// The report actions menu (⋮): view a chart's results as a table and back, settings for editors.
import { test, expect } from '@playwright/test';
import {
  SALES,
  SINK,
  card,
  deleteDashboard,
  editReport,
  expectNoErrors,
  getDashboard,
  openPage,
  putDashboard,
  reportMenu,
  trackErrors,
} from './helpers.mjs';

const BAR = 'Revenue by category and segment (grouped)';

test('a chart can be viewed as a table and back', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 1);
  const report = card(page, BAR);
  await expect(report.locator('canvas').first()).toBeVisible();
  await reportMenu(report, 'View as table');
  // The same results as a table; the chart and its field selectors are gone.
  const grid = report.locator('.ndl-data-grid-root');
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'Category' })).toBeVisible();
  await expect(grid.getByRole('cell', { name: 'Electronics' }).first()).toBeVisible();
  await expect(report.locator('canvas')).toHaveCount(0);
  await expect(report.getByText('Value', { exact: true })).toHaveCount(0);
  await reportMenu(report, 'View as chart');
  await expect(report.locator('canvas').first()).toBeVisible();
  await expect(grid).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test('tables and text reports offer no table view; editors get settings', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 0);
  await card(page, 'Product catalogue').getByRole('button', { name: 'Report actions' }).click();
  // Settings are opened with Edit, beside the menu.
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'View as table' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await editReport(card(page, 'Product catalogue'));
  await expect(card(page, 'Product catalogue').getByText('Advanced settings')).toBeVisible();
  await expectNoErrors(page, errors);
});

test('duplicate, help and delete are in the menu on both faces', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const report = { ...dash.pages[0].reports.find((r) => r.type === 'value'), title: 'Menu me', x: 0, y: 0, width: 6, height: 3 };
  const uuid = `dddd0000-0000-4000-8000-0000000me${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, { ...dash, title: 'e2e menu', pages: [{ title: 'Menu', reports: [report] }] });
  try {
    await openPage(page, uuid);
    const cards = page.locator('.nd-report-card');
    await reportMenu(card(page, 'Menu me'), 'Duplicate');
    await expect(cards).toHaveCount(2);

    // The settings face has the same actions in its menu (and no longer as buttons in its top row).
    const first = cards.first();
    await editReport(first);
    await expect(first.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await reportMenu(first, 'Help');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await reportMenu(first, 'Delete');
    await expect(cards).toHaveCount(1);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('Cancel discards the changes made in settings; Save keeps them', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const report = { ...dash.pages[0].reports.find((r) => r.type === 'value'), title: 'Edit me', query: 'RETURN 1 AS one', x: 0, y: 0, width: 6, height: 3 };
  const uuid = `dddd0000-0000-4000-8000-0000000ca${test.info().project.name === 'dark' ? 'dd' : 'ee'}`.slice(0, 36);
  await putDashboard(page, uuid, { ...dash, title: 'e2e cancel', pages: [{ title: 'Cancel', reports: [report] }] });
  try {
    await openPage(page, uuid);
    const c = card(page, 'Edit me');
    const editor = c.locator('.cm-content').first();
    await editReport(c);
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('RETURN 2 AS two');
    await c.getByRole('button', { name: 'Cancel' }).click();
    await expect(c.getByText('1', { exact: true })).toBeVisible();
    await editReport(c);
    await expect(editor).toHaveText('RETURN 1 AS one');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('RETURN 2 AS two');
    await c.getByRole('button', { name: 'Save' }).click();
    await expect(c.getByText('2', { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test.describe('viewer', () => {
  test.use({ storageState: './.auth/viewer.json' });

  test('viewers can view as table but have no settings', async ({ page }) => {
    const errors = trackErrors(page);
    await openPage(page, SALES);
    const report = card(page, 'Monthly revenue');
    await report.getByRole('button', { name: 'Report actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'View as table' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(report.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await report.getByRole('button', { name: 'Report actions' }).click();
    await page.getByRole('menuitem', { name: 'View as table' }).click();
    await expect(report.locator('.ndl-data-grid-root')).toBeVisible();
    // Text reports have no menu at all for viewers.
    await expect(card(page, 'About').getByRole('button', { name: 'Report actions' })).toHaveCount(0);
    await expectNoErrors(page, errors);
  });
});

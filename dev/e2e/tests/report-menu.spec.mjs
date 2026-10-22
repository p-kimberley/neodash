// The report actions menu (⋮): view a chart's results as a table and back, settings for editors.
import { test, expect } from '@playwright/test';
import { SALES, SINK, card, expectNoErrors, openPage, reportMenu, trackErrors } from './helpers.mjs';

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
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'View as table' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await reportMenu(card(page, 'Product catalogue'), 'Settings');
  await expect(card(page, 'Product catalogue').getByText('Advanced settings')).toBeVisible();
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
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'View as table' }).click();
    await expect(report.locator('.ndl-data-grid-root')).toBeVisible();
    // Text reports have no menu at all for viewers.
    await expect(card(page, 'About').getByRole('button', { name: 'Report actions' })).toHaveCount(0);
    await expectNoErrors(page, errors);
  });
});

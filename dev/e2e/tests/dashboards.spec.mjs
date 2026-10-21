import { test, expect } from '@playwright/test';
import {
  SALES,
  SINK,
  SUPPLY,
  card,
  expectNoErrors,
  expectReportOk,
  getDashboard,
  openPage,
  trackErrors,
} from './helpers.mjs';

// Every page of every seed dashboard renders every report, without errors.
for (const [name, uuid] of [
  ['Sales Overview', SALES],
  ['Supply Chain', SUPPLY],
  ['Kitchen Sink', SINK],
]) {
  test(`${name}: every report renders`, async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await page.goto('/');
    const dash = await getDashboard(page, uuid);
    for (const [index, dashPage] of dash.pages.entries()) {
      await test.step(dashPage.title, async () => {
        await openPage(page, uuid, index);
        for (const report of dashPage.reports) {
          const c = card(page, report.title);
          await c.scrollIntoViewIfNeeded();
          await expectReportOk(c, report.title);
        }
        await testInfo.attach(`${name} - ${dashPage.title}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });
    }
    await expectNoErrors(page, errors);
  });
}

test('dashboard selector: search, open, breadcrumb and browser back', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByPlaceholder('Search by name or author').fill('sales');
  await page.getByText('Sales Overview', { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${SALES}`));
  await expect(page).toHaveTitle(/Sales Overview/);
  await page.getByTitle('All dashboards').click();
  await expect(page).not.toHaveURL(/\/dashboards\//);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${SALES}`));
  await expectNoErrors(page, errors);
});

test('dashboards panel opens and closes', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const menu = page.getByLabel('Dashboards menu');
  await menu.click();
  await expect(page.locator('.ndl-side-navigation, .nd-dashboard-panel').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await expectNoErrors(page, errors);
});

test.describe('viewer', () => {
  test.use({ storageState: './.auth/viewer.json' });

  test('sees reports but no editing or examples', async ({ page }) => {
    const errors = trackErrors(page);
    await openPage(page, SALES);
    await expectReportOk(card(page, 'Monthly revenue'), 'Monthly revenue');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.getByLabel('help').first().click();
    await expect(page.getByRole('menuitem', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Examples' })).toHaveCount(0);
    await expectNoErrors(page, errors);
  });
});

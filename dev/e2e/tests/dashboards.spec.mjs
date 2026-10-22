import { test, expect } from '@playwright/test';
import {
  SALES,
  SINK,
  SUPPLY,
  card,
  expectNoErrors,
  expectReportOk,
  deleteDashboard,
  getDashboard,
  openPage,
  putDashboard,
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
  const menu = page.getByRole('button', { name: 'Dashboards', exact: true });
  await menu.click();
  await expect(page.locator('.nd-dashboard-panel.is-expanded')).toBeVisible();
  // Escape closes it, even with the menu button focused (and showing its tooltip).
  await page.keyboard.press('Escape');
  await expect(page.locator('.nd-dashboard-panel.is-expanded')).toHaveCount(0);
  // With a dashboard's actions menu open, Escape closes the menu first, then the panel.
  await page.getByRole('button', { name: 'Dashboards', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard actions' }).first().click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  await expect(page.locator('.nd-dashboard-panel.is-expanded')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.nd-dashboard-panel.is-expanded')).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test('choosing a dashboard in the panel opens it and closes the panel', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const supply = await getDashboard(page, SUPPLY);
  await page.getByRole('button', { name: 'Dashboards', exact: true }).click();
  const panel = page.locator('.nd-dashboard-panel.is-expanded');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'dashboard' }).filter({ hasText: supply.title }).click();
  await expect(page.locator('.nd-dashboard-panel.is-expanded')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: supply.title })).toBeVisible();
  await expectNoErrors(page, errors);
});

test('a page is renamed from its tab menu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const uuid = `dddd0000-0000-4000-8000-00000000a6${test.info().project.name === 'dark' ? 'dd' : 'ee'}`;
  await putDashboard(page, uuid, { ...dash, title: 'e2e page rename' });
  try {
    await openPage(page, uuid);
    const tab = page.locator('.nd-page-tab').nth(1);
    await tab.hover();
    await tab.getByRole('button', { name: 'Page actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit name' }).click();
    // The field keeps focus after the menu closes, so typing renames the page.
    const input = tab.locator('input');
    await expect(input).toBeFocused();
    await input.fill('Renamed page');
    await input.press('Enter');
    await expect(tab.getByRole('tab')).toHaveText('Renamed page');
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

// Cards clip their content to their rounded corners, and a chart's field selectors stay on the one
// row the chart leaves for them (scrolling sideways in a narrow card) instead of spilling out of it.
test('report cards keep their content inside', async ({ page }) => {
  await page.goto('/');
  const dash = await getDashboard(page, SINK);
  const uuid = `dddd0000-0000-4000-8000-00000000c1${test.info().project.name === 'dark' ? 'dd' : 'ee'}`;
  const graphs = dash.pages.find((p) => p.reports.some((r) => r.type === 'graph'));
  const reports = graphs.reports.map((r, i) => ({ ...r, x: (i % 4) * 6, y: 0, width: 6, height: 5 }));
  await putDashboard(page, uuid, { ...dash, title: 'e2e narrow cards', pages: [{ ...graphs, reports }] });
  try {
    await openPage(page, uuid);
    await expect(page.locator('.nd-card-footer').first()).toBeVisible();
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('.nd-report-card')].map((c) => {
        const surface = getComputedStyle(c.querySelector('.nd-card-surface'));
        const footer = c.querySelector('.nd-card-footer');
        const tops = footer ? [...footer.children].map((x) => Math.round(x.getBoundingClientRect().top)) : [];
        return {
          title: c.querySelector('input')?.value,
          clipped: surface.overflow === 'hidden' && parseFloat(surface.borderBottomRightRadius) > 0,
          footerRows: new Set(tops).size,
        };
      })
    );
    expect(cards.length).toBeGreaterThan(1);
    for (const c of cards) {
      expect(c.clipped, `${c.title} clips its content to its corners`).toBe(true);
      expect(c.footerRows, `${c.title} has one row of field selectors`).toBeLessThanOrEqual(1);
    }
  } finally {
    await deleteDashboard(page, uuid);
  }
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

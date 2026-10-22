import { test, expect } from '@playwright/test';
import {
  SALES,
  SINK,
  SUPPLY,
  card,
  deleteDashboard,
  expectNoErrors,
  getDashboard,
  openPage,
  putDashboard,
  trackErrors,
} from './helpers.mjs';

test('bar click action sets a parameter', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const dash = await getDashboard(page, SINK);
  const charts = dash.pages[1];
  const bar = charts.reports.find((r) => r.type === 'bar');
  bar.settings = {
    ...bar.settings,
    actionsRules: [
      {
        condition: 'Click',
        field: bar.selection.index,
        value: bar.selection.index,
        customization: 'set variable',
        customizationValue: 'picked_category',
      },
    ],
  };
  const uuid = `dddd0000-0000-4000-8000-${test.info().project.name === 'dark' ? '0000000ba5c2' : '0000000ba5c1'}`;
  await putDashboard(page, uuid, {
    ...dash,
    title: 'e2e bar action',
    pages: [charts],
    extensions: { ...(dash.extensions || {}), actions: { active: true } },
  });
  try {
    await openPage(page, uuid);
    const box = await card(page, bar.title).locator('canvas').first().boundingBox();
    let picked = null;
    for (let x = box.x + 60; x < box.x + box.width - 140 && !picked; x += 12) {
      await page.mouse.click(x, box.y + box.height - 120);
      picked = new URL(page.url()).searchParams.get('neodash_picked_category');
    }
    expect(picked, 'clicking a bar set no parameter').toBeTruthy();
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('style rules colour bars and table rows; rows keep their colour on hover', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const table = card(page, 'Top products');
  const row = table.locator('.MuiDataGrid-row[class*="rule0"]').first();
  const before = await row.evaluate((r) => getComputedStyle(r).backgroundColor);
  await row.hover();
  await page.waitForTimeout(300);
  expect(await row.evaluate((r) => getComputedStyle(r).backgroundColor)).toBe(before);
  await expectNoErrors(page, errors);
});

test('graph: search, properties popup and 2D/3D toggle', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES, 1);
  const graph = card(page, 'Recent orders');
  await graph.locator('input[type=search]').fill('Laptop');
  await expect(graph.locator('.nd-graph-search-count')).not.toBeEmpty();
  await graph.locator('input[type=search]').fill('');
  await graph.getByLabel('fit graph to view').click();
  await page.waitForTimeout(800);

  // Click until a node is hit: its properties open in a popup, not a modal dialog.
  const box = await graph.locator('canvas').first().boundingBox();
  let opened = false;
  for (let y = box.y + 30; y < box.y + box.height - 30 && !opened; y += 12) {
    for (let x = box.x + 30; x < box.x + box.width - 30 && !opened; x += 12) {
      await page.mouse.click(x, y);
      opened = (await page.locator('.nd-graph-info').count()) > 0;
    }
  }
  expect(opened, 'no node popup opened').toBe(true);
  await expect(page.locator('.ndl-dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.nd-graph-info')).toHaveCount(0);

  // The 3D view is remembered per report.
  await graph.getByLabel('show in 3D').click();
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(card(page, 'Recent orders').getByLabel('show in 2D')).toBeVisible({ timeout: 30_000 });
  await card(page, 'Recent orders').getByLabel('show in 2D').click();
  await expectNoErrors(page, errors);
});

test('maps: pins, popups and area-map hover', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 3);
  const cities = card(page, 'Customer cities');
  await expect(cities.locator('.nd-map-pin').first()).toBeVisible();
  await cities.locator('.nd-map-pin').last().click({ force: true });
  await expect(cities.locator('.maplibregl-popup-content')).toBeVisible();
  const area = card(page, 'Customers by country (area map, ISO-2)');
  await area.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  expect(await area.locator('.nd-map-legend tr').count()).toBeGreaterThan(0);
  await expectNoErrors(page, errors);
});

test('hierarchy drill-down and reset', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 2);
  const treemap = card(page, 'Revenue treemap');
  await treemap.scrollIntoViewIfNeeded();
  const b = await treemap.locator('canvas').first().boundingBox();
  await page.mouse.click(b.x + 40, b.y + 30);
  await expect(treemap.getByLabel('reset')).toBeVisible();
  await treemap.getByLabel('reset').click();
  await expect(treemap.getByLabel('reset')).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test('parameters: date picker sets its parameter', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 5);
  const field = card(page, 'Date picker').locator('.MuiPickersInputBase-root').first();
  await field.click();
  await page.keyboard.type('20250314', { delay: 50 });
  await page.keyboard.press('Tab');
  // Dates are kept in the URL as typed JSON.
  await expect.poll(() => decodeURIComponent(page.url())).toContain('"year":2025,"month":3,"day":14');
  // ...and read back from it as a date when the link is opened again.
  await page.reload();
  const input = card(page, 'Date picker').locator('.MuiPickersInputBase-root input').first();
  await expect(input).toHaveValue('2025-03-14', { timeout: 20000 });
  await expectNoErrors(page, errors);
});

test('parameters: node property select sets its parameter', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 5);
  const select = card(page, 'Node property');
  const input = select.getByPlaceholder('Start typing...');
  await input.click();
  await input.pressSequentially('Lap', { delay: 50 });
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  const value = (await option.innerText()).trim();
  await option.click();
  await expect.poll(() => decodeURIComponent(page.url().replace(/\+/g, ' '))).toContain(value);
  await expectNoErrors(page, errors);
});

test('report description renders markdown', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  dash.pages[0].reports[0].settings = {
    ...(dash.pages[0].reports[0].settings || {}),
    description: '| Metric | Value |\n|---|---|\n| Revenue | 10 |\n\nSee https://neo4j.com',
  };
  const uuid = `dddd0000-0000-4000-8000-${test.info().project.name === 'dark' ? '00000000d35d' : '00000000d35c'}`;
  await putDashboard(page, uuid, { ...dash, title: 'e2e description' });
  try {
    await openPage(page, uuid);
    await page.getByLabel('details').first().click();
    const dialog = page.locator('.MuiDialog-paper');
    await expect(dialog.locator('td')).toHaveText(['Revenue', '10']);
    await expect(dialog.locator('a').first()).toHaveAttribute('target', '_blank');
    // A <base target> would retarget every link on the page while the dialog is open.
    expect(await page.locator('base[target]').count()).toBe(0);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('help > examples render', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SUPPLY);
  await page.getByLabel('help').first().click();
  await page.getByRole('menuitem', { name: 'Examples' }).click();
  const dialog = page.locator('.ndl-dialog:visible').first();
  await expect(dialog.getByText('Report Examples')).toBeVisible();
  await page.waitForTimeout(4000);
  expect(await dialog.locator('canvas').count()).toBeGreaterThan(8);
  expect(await dialog.getByText(/can not be visualized|Query returned no data/).count()).toBe(0);
  await expectNoErrors(page, errors);
});

test('graph: right-click menu, nested submenu and inspect', async ({ page }) => {
  const errors = trackErrors(page);
  // The Kitchen Sink graph with exploration on, so the menu has the nested "Expand..." submenu.
  await openPage(page, SINK, 4);
  const graph = card(page, 'Electronics supply graph');
  await graph.getByLabel('fit graph to view').click();
  await page.waitForTimeout(800);
  const box = await graph.locator('canvas').first().boundingBox();
  const menu = page.locator('#basic-menu');
  let opened = false;
  for (let y = box.y + 30; y < box.y + box.height - 30 && !opened; y += 12) {
    for (let x = box.x + 30; x < box.x + box.width - 30 && !opened; x += 12) {
      await page.mouse.click(x, y, { button: 'right' });
      opened = (await menu.count()) > 0;
    }
  }
  expect(opened, 'no context menu opened').toBe(true);
  await expect(menu.getByText('Inspect')).toBeVisible();
  await menu.getByText('Expand...').hover();
  // The submenu is its own popover, listing the node's relationship types.
  await expect(page.locator('.MuiPopover-paper table:visible').first()).toBeVisible();
  await menu.getByText('Inspect').click();
  await expect(page.locator('.nd-graph-info')).toBeVisible();
  await expectNoErrors(page, errors);
});

test('branding: legacy design-system colour overrides still apply', async ({ page }, info) => {
  // Overrides as the Helm chart's branding.style documented them for the earlier design system.
  await page.route('**/style.config.json', (route) =>
    route.fulfill({
      json: {
        style: {
          '--palette-light-primary-bg-strong': '200, 0, 0',
          '--palette-dark-primary-bg-strong': '255, 120, 120',
        },
      },
    })
  );
  await page.goto('/');
  const button = page.getByRole('button', { name: 'New dashboard' });
  await expect(button).toBeVisible();
  const expected = info.project.name === 'dark' ? 'rgb(255, 120, 120)' : 'rgb(200, 0, 0)';
  await expect.poll(() => button.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(expected);
});

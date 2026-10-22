// Editors draw new reports on the page grid: press on empty space (or the Add report tile) and drag.
import { test, expect } from '@playwright/test';
import { SALES, deleteDashboard, expectNoErrors, getDashboard, openPage, putDashboard, trackErrors } from './helpers.mjs';

const ROW = 100;
const GAP = 10;

/** A temporary dashboard with one small report at the top left. */
const setUp = async (page, suffix) => {
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const report = { ...dash.pages[0].reports.find((r) => r.type === 'value'), x: 0, y: 0, width: 6, height: 3 };
  const uuid = `dddd0000-0000-4000-8000-00000000d${suffix}${test.info().project.name === 'dark' ? 'd' : 'e'}`.slice(0, 36);
  await putDashboard(page, uuid, { ...dash, title: 'e2e draw', pages: [{ title: 'Draw', reports: [report] }] });
  await openPage(page, uuid);
  return uuid;
};

/** The centre of a grid cell, on screen. */
const cell = async (page, col, row) => {
  const box = await page.locator('.nd-draw-layer').boundingBox();
  const colWidth = (box.width - GAP * 25) / 24;
  return { x: box.x + GAP + col * (colWidth + GAP) + colWidth / 2, y: box.y + GAP + row * (ROW + GAP) + ROW / 2, colWidth };
};

test('drawing on empty space adds a report of the drawn size', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '1');
  try {
    const cards = page.locator('.nd-report-card');
    await expect(cards).toHaveCount(1);

    // A hint follows the pointer over empty space.
    const start = await cell(page, 12, 0);
    await page.mouse.move(start.x, start.y);
    await expect(page.locator('.nd-draw-hint')).toContainText('Drag to draw a report');

    // A plain click adds nothing.
    await page.mouse.click(start.x, start.y);
    await expect(cards).toHaveCount(1);

    // Press and drag: the outline snaps to the cells and shows its size.
    const end = await cell(page, 19, 2);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await expect(page.locator('.nd-draw-outline')).toHaveText('8 × 3');
    await page.mouse.up();
    await expect(cards).toHaveCount(2);
    const drawn = await cards.nth(1).boundingBox();
    expect(Math.abs(drawn.width - (8 * start.colWidth + 7 * GAP))).toBeLessThan(4);
    expect(Math.abs(drawn.height - (3 * ROW + 2 * GAP))).toBeLessThan(4);

    // Escape cancels a drawing.
    const other = await cell(page, 0, 4);
    await page.mouse.move(other.x, other.y);
    await page.mouse.down();
    await page.mouse.move(other.x + 300, other.y + 150, { steps: 5 });
    await expect(page.locator('.nd-draw-outline')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.nd-draw-outline')).toHaveCount(0);
    await page.mouse.up();
    await expect(cards).toHaveCount(2);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('drawing near the bottom scrolls the page, for reports taller than the window', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '2');
  try {
    const start = await cell(page, 8, 1);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const viewport = page.viewportSize();
    await page.mouse.move(start.x + 200, viewport.height - 8, { steps: 10 });
    // Held at the bottom edge, the page scrolls and the outline keeps growing.
    await expect
      .poll(async () => Number((await page.locator('.nd-draw-outline').innerText()).split('×')[1]), { timeout: 10_000 })
      .toBeGreaterThan(10);
    await page.mouse.up();
    const cards = page.locator('.nd-report-card');
    await expect(cards).toHaveCount(2);
    expect((await cards.nth(1).boundingBox()).height).toBeGreaterThan(10 * ROW);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('a drag from the Add report tile draws too; a click adds the default size', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '3');
  try {
    const cards = page.locator('.nd-report-card');
    const tile = page.getByRole('button', { name: 'Add report' });
    await expect(tile).toContainText('drag');
    const box = await tile.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 150, box.y + 260, { steps: 8 });
    await expect(page.locator('.nd-draw-outline')).toBeVisible();
    await page.mouse.up();
    await expect(cards).toHaveCount(2);

    await page.getByRole('button', { name: 'Add report' }).click();
    await expect(cards).toHaveCount(3);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test.describe('viewer', () => {
  test.use({ storageState: './.auth/viewer.json' });

  test('viewers cannot draw reports', async ({ page }) => {
    await openPage(page, SALES);
    await expect(page.locator('.nd-draw-layer')).toHaveCount(0);
  });
});

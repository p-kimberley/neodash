// Dialogs close on a click outside them; a card's top row is centred on one line on both faces.
import { test, expect } from '@playwright/test';
import { SALES, card, expectNoErrors, openPage, reportMenu, trackErrors } from './helpers.mjs';

test('dialogs close on a click outside them, not on a drag out of them', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(20, 600);
  await expect(dialog).toHaveCount(0);

  // Pressing inside (e.g. selecting text) and letting go outside keeps it open.
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  const box = await dialog.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(20, 600, { steps: 5 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // A maximised report fills the window less a 16px margin, which restores it when clicked.
  await card(page, 'Monthly revenue').getByRole('button', { name: 'Maximize' }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 600);
  await expect(dialog).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test("a card's top row is centred on one line, at the same height on both faces", async ({ page }) => {
  await openPage(page, SALES, 1);
  const graph = card(page, 'Recent orders');
  const middles = () =>
    graph.evaluate((c) => {
      const bar = [...c.querySelectorAll('.nd-card-bar')].find((b) => b.closest('.nd-card-face.is-shown'));
      const mid = (el) => {
        const b = el.getBoundingClientRect();
        return Math.round((b.top + b.bottom) / 2);
      };
      const title = bar.querySelector('.nd-card-title');
      const items = [...bar.querySelectorAll('button svg')].map(mid);
      if (title) {
        const s = getComputedStyle(title);
        items.push(
          Math.round(title.getBoundingClientRect().top + parseFloat(s.paddingTop) + parseFloat(s.lineHeight) / 2)
        );
      }
      return items;
    });
  const view = await middles();
  expect(view.length).toBeGreaterThan(2);
  expect(Math.max(...view) - Math.min(...view)).toBeLessThanOrEqual(1);

  await reportMenu(graph, 'Settings');
  await expect(graph.getByRole('button', { name: 'Run' })).toBeVisible();
  const settings = await middles();
  expect(Math.max(...settings) - Math.min(...settings)).toBeLessThanOrEqual(1);
  expect(Math.abs(settings[0] - view[0])).toBeLessThanOrEqual(1);
});

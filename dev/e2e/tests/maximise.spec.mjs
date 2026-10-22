import { test, expect } from '@playwright/test';
import { SINK, card, expectNoErrors, getDashboard, largestVisual, openPage, trackErrors } from './helpers.mjs';

// Report types that draw a full-size visual; the rest (text, value, parameter selects) just need to show.
const FILLS = [
  'table',
  'bar',
  'line',
  'pie',
  'sunburst',
  'treeMap',
  'circlePacking',
  'sankey',
  'radar',
  'choropleth',
  'map',
  'areamap',
  'graph',
  'graph3d',
  'gantt',
  'iframe',
];
const OTHERS = ['text', 'value', 'select', 'gauge', 'json'];

test('every report type maximises to fill the window', async ({ page }) => {
  // One maximise per report type, across all the Kitchen Sink pages.
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await page.goto('/');
  const dash = await getDashboard(page, SINK);
  const seen = new Set();
  for (const [index, dashPage] of dash.pages.entries()) {
    const reports = dashPage.reports.filter((r) => [...FILLS, ...OTHERS].includes(r.type) && !seen.has(r.type));
    if (!reports.length) {
      continue;
    }
    await openPage(page, SINK, index);
    for (const report of reports) {
      if (seen.has(report.type)) {
        continue;
      }
      seen.add(report.type);
      await test.step(`${report.type}: ${report.title}`, async () => {
        const c = card(page, report.title);
        await c.scrollIntoViewIfNeeded();
        await c.getByRole('button', { name: 'maximize' }).click();
        const dialog = page.locator('.nd-maximised');
        await expect(dialog).toBeVisible();
        // The maximised report runs its query again.
        await expect(dialog.locator('.nd-report-loading')).toHaveCount(0, { timeout: 30_000 });
        await page.waitForTimeout(1500);

        // An even margin on every side, and nothing behind it scrolls.
        const box = await dialog.boundingBox();
        const viewport = page.viewportSize();
        for (const margin of [box.x, box.y, viewport.width - box.x - box.width, viewport.height - box.y - box.height]) {
          expect(Math.round(margin)).toBe(16);
        }
        const wrapperOverflow = await page.evaluate(() => {
          const w = document.querySelector('.nd-maximised').parentElement;
          return w.scrollHeight - w.clientHeight;
        });
        expect(wrapperOverflow, 'the dialog wrapper can scroll').toBe(0);

        const visual = await largestVisual(dialog);
        if (FILLS.includes(report.type)) {
          expect(visual.width * visual.height, 'the report does not fill the window').toBeGreaterThan(
            box.width * box.height * 0.5
          );
        } else {
          expect(visual.width * visual.height, 'the report shows nothing').toBeGreaterThan(0);
        }
        if (report.type === 'table') {
          expect(await dialog.locator('.MuiDataGrid-row').count()).toBeGreaterThan(0);
        }

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      });
    }
  }
  expect(
    [...FILLS, ...OTHERS].filter((t) => !seen.has(t)),
    'report types not found on the Kitchen Sink'
  ).toEqual([]);
  await expectNoErrors(page, errors);
});

test('a maximised report can open its settings', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 1);
  const dash = await getDashboard(page, SINK);
  const bar = dash.pages[1].reports.find((r) => r.type === 'bar');
  await card(page, bar.title).getByRole('button', { name: 'maximize' }).click();
  const dialog = page.locator('.nd-maximised');
  await dialog.getByRole('button', { name: 'settings' }).first().click();
  await expect(dialog.getByText('Advanced settings')).toBeVisible();
  const editor = await dialog.locator('.cm-editor, .CodeMirror').first().boundingBox();
  expect(editor.height).toBeGreaterThan(40);
  await page.keyboard.press('Escape');
  await expectNoErrors(page, errors);
});

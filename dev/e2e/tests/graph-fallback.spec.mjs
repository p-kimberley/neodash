import { test, expect } from '@playwright/test';
import { SINK, card, expectNoErrors, expectReportOk, openPage, trackErrors } from './helpers.mjs';

// A browser without WebGL: 3D graphs are drawn in 2D, with a notice, and offer no 3D view.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } });

test('graphs fall back to 2D without WebGL', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 4);
  const graph3d = card(page, 'Whole catalogue (3D)');
  await expect(graph3d.locator('.nd-graph-notice')).toBeVisible();
  await expectReportOk(graph3d, 'Whole catalogue (3D)');
  await expect(graph3d.getByRole('button', { name: /Show in (2D|3D)/ })).toHaveCount(0);
  // A 2D graph report is unaffected (no notice).
  await expect(card(page, 'Electronics supply graph').locator('.nd-graph-notice')).toHaveCount(0);
  await expectNoErrors(page, errors);
});

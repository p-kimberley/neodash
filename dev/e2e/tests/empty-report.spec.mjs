// Reports that aren't set up yet: editors get buttons to set them up, viewers a short note.
import { test, expect } from '@playwright/test';
import { SALES, deleteDashboard, expectNoErrors, getDashboard, openPage, putDashboard, trackErrors } from './helpers.mjs';

/** A temporary dashboard with one report that has no query. */
const setUp = async (page, suffix) => {
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const empty = { ...dash.pages[0].reports[0], id: 'e0000000-0000-4000-8000-000000000001', title: 'Empty', type: 'table', query: '\n\n\n', settings: {}, x: 0, y: 0, width: 8, height: 3 };
  const uuid = `dddd0000-0000-4000-8000-0000000em${suffix}${test.info().project.name === 'dark' ? 'd' : 'e'}`.slice(0, 36);
  await putDashboard(page, uuid, { ...dash, title: 'e2e empty', pages: [{ title: 'Empty', reports: [empty] }] });
  return uuid;
};

test('an empty report offers Configure, which opens its settings', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '1');
  try {
    await openPage(page, uuid);
    const report = page.locator('.nd-report-card').first();
    await expect(report.getByText('No query specified')).toHaveCount(0);
    await report.getByRole('button', { name: 'Configure' }).click();
    await expect(report.getByText('Advanced settings')).toBeVisible();
    // An empty report has nothing to show as a table.
    await report.getByRole('button', { name: 'Run' }).click();
    await report.getByRole('button', { name: 'Report actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'View as table' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('a new report starts empty, with Configure', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = await setUp(page, '2');
  try {
    await openPage(page, uuid);
    await page.getByRole('button', { name: 'Add report' }).click();
    await expect(page.locator('.nd-report-card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Configure' })).toHaveCount(2);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test.describe('viewer', () => {
  test.use({ storageState: './.auth/viewer.json' });

  test('viewers see a note, not the buttons', async ({ page }) => {
    // Viewers can't save dashboards; an editor's context sets one up.
    const editor = await page.context().browser().newContext({ storageState: './.auth/editor.json', baseURL: test.info().project.use.baseURL });
    const editorPage = await editor.newPage();
    const uuid = await setUp(editorPage, '3');
    try {
      await openPage(page, uuid);
      const report = page.locator('.nd-report-card').first();
      await expect(report.getByText('No content yet')).toBeVisible();
      await expect(report.getByRole('button', { name: 'Configure' })).toHaveCount(0);
    } finally {
      await deleteDashboard(editorPage, uuid);
      await editor.close();
    }
  });
});

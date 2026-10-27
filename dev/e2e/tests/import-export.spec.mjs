import { test, expect } from '@playwright/test';
import {
  SALES,
  SINK,
  SUPPLY,
  card,
  deleteDashboard,
  expectNoErrors,
  expectReportOk,
  getDashboard,
  openPage,
  putDashboard,
  trackErrors,
} from './helpers.mjs';

// JSON export (a dashboard's actions menu) and import (the panel's "New dashboard" menu).

/**
 * Opens the dashboards panel (unless a dialog opened from it left it open) and waits for its slide
 * to end, so clicks land on what they target.
 */
const openPanel = async (page) => {
  const panel = page.locator('.nd-dashboard-panel.is-expanded');
  if ((await panel.count()) === 0) {
    await page.getByRole('button', { name: 'Dashboards', exact: true }).click();
  }
  await expect(panel).toBeVisible();
  await expect
    .poll(() =>
      panel.evaluate((p) => Math.round(p.getBoundingClientRect().width) >= Math.round(p.firstElementChild.offsetWidth))
    )
    .toBe(true);
  return panel;
};

/** Opens a dashboard's ⋮ menu in the panel and picks `item`. */
const dashboardMenu = async (page, title, item) => {
  const panel = await openPanel(page);
  await panel
    .locator('.nd-dashboard-panel-row')
    .filter({ hasText: title })
    .getByRole('button', { name: /^Dashboard actions/ })
    .click();
  await page.getByRole('menuitem', { name: item }).click();
};

/** A dialog's JSON editor (CodeMirror). */
const jsonEditor = (dialog) => dialog.getByRole('textbox', { name: 'Dashboard JSON' });

/** Replaces the JSON in a dialog's editor: select all, then insert it as one edit (no auto-closed brackets). */
const setJson = async (dialog, text) => {
  await jsonEditor(dialog).click();
  await dialog.page().keyboard.press('ControlOrMeta+a');
  await dialog.page().keyboard.insertText(text);
};

/** The text a download saves (the editor only renders the lines in view, so this reads all of it). */
const downloadText = async (dialog, button) => {
  const [download] = await Promise.all([
    dialog.page().waitForEvent('download'),
    dialog.getByRole('button', { name: button }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('dashboard.json');
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const openEditJson = async (page, title) => {
  await dashboardMenu(page, title, 'Edit JSON');
  const dialog = page.getByRole('dialog').filter({ hasText: 'Edit Dashboard JSON' });
  // A saved dashboard is fetched after the dialog opens.
  await expect(jsonEditor(dialog)).toContainText('{');
  return dialog;
};

const openImport = async (page) => {
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'New dashboard' }).click();
  await page.getByRole('menuitem', { name: 'Import' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Import Dashboard' });
  await expect(dialog).toBeVisible();
  return dialog;
};

/** Every report of the dashboard's first page renders. */
const expectFirstPageRenders = async (page, dash) => {
  await expect(page.getByRole('heading', { name: dash.title })).toBeVisible();
  await expect(page.locator('.nd-report-card .nd-report-loading')).toHaveCount(0, { timeout: 30_000 });
  for (const report of dash.pages[0].reports) {
    const c = card(page, report.title);
    await c.scrollIntoViewIfNeeded();
    await expectReportOk(c, report.title);
  }
};

/** A saved dashboard as its export has it (uuid included), with a new title. */
const importable = async (page, uuid, title) => ({ ...(await getDashboard(page, uuid)), uuid, title });

test('export shows the dashboard JSON and saves it to a file', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const saved = await getDashboard(page, SALES);
  const panel = await openPanel(page);
  await panel
    .locator('.nd-dashboard-panel-row')
    .filter({ hasText: saved.title })
    .getByRole('button', { name: /^Dashboard actions/ })
    .click();
  // Clicking a dashboard opens it: there is no separate Load.
  await expect(page.getByRole('menuitem', { name: 'Load' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Export' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Export Dashboard' });
  // The dashboard is fetched after the dialog opens.
  await expect(jsonEditor(dialog)).toContainText('{');
  const text = await downloadText(dialog, /Save to file/);
  // The editor shows what the file holds (its first lines, at least: the editor renders those in view).
  for (const line of text.split('\n').slice(0, 3)) {
    await expect(jsonEditor(dialog)).toContainText(line.trim());
  }
  const exported = JSON.parse(text);
  expect(exported.uuid).toBe(SALES);
  expect(exported.title).toBe(saved.title);
  expect(exported.version).toBe(saved.version);
  expect(exported.pages.map((p) => p.reports.map((r) => r.title))).toEqual(
    saved.pages.map((p) => p.reports.map((r) => r.title))
  );
  expect(exported.pages.map((p) => p.reports.map((r) => r.query))).toEqual(
    saved.pages.map((p) => p.reports.map((r) => r.query))
  );
  // Editor-only state is left out.
  expect(JSON.stringify(exported)).not.toMatch(/"(fields|settingsOpen|advancedSettingsOpen|apiKey)"/);
  await expectNoErrors(page, errors);
});

test('import from pasted JSON opens the dashboard as a draft', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SUPPLY);
  const dash = await importable(page, SALES, 'e2e pasted import');
  const dialog = await openImport(page);
  const importButton = dialog.getByRole('button', { name: 'Import' });
  await expect(importButton).toBeDisabled();
  await setJson(dialog, JSON.stringify(dash, null, 2));
  await importButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Unable to load dashboard')).toHaveCount(0);
  await expectFirstPageRenders(page, dash);
  // The panel stays open after an import, listing the import as the open draft.
  const panel = page.locator('.nd-dashboard-panel.is-expanded');
  await expect(panel.getByRole('button', { name: 'dashboard' }).filter({ hasText: '(Draft)' })).toContainText(
    dash.title
  );
  await expectNoErrors(page, errors);
});

test('import from a file fills the JSON and opens the dashboard', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const dash = await importable(page, SUPPLY, 'e2e file import');
  const text = JSON.stringify(dash, null, 2);
  const dialog = await openImport(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: /Select From File/ }).click(),
  ]);
  await chooser.setFiles({ name: 'dashboard.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  // The file's JSON is in the editor, all of it: it verifies.
  await expect(jsonEditor(dialog)).toContainText('{');
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(dialog.getByText(/^Valid dashboard JSON/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Unable to load dashboard')).toHaveCount(0);
  await expectFirstPageRenders(page, dash);
  await expectNoErrors(page, errors);
});

test('an imported dashboard saves as a new dashboard', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SUPPLY);
  const dash = await importable(page, SALES, `e2e saved import ${test.info().project.name}`);
  const dialog = await openImport(page);
  await setJson(dialog, JSON.stringify(dash));
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expectFirstPageRenders(page, dash);
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/api/dashboards/')),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const uuid = new URL(saved.url()).pathname.split('/').pop();
  try {
    expect(saved.status()).toBe(200);
    // The file's uuid is Sales': importing always makes a new dashboard.
    expect(uuid).not.toBe(SALES);
    await expect(page.getByText('All changes saved')).toBeVisible();
    const stored = await getDashboard(page, uuid);
    expect(stored.title).toBe(dash.title);
    expect(stored.pages[0].reports.map((r) => r.title)).toEqual(dash.pages[0].reports.map((r) => r.title));
    // The original is untouched.
    expect((await getDashboard(page, SALES)).title).not.toBe(dash.title);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('import upgrades a dashboard saved by NeoDash 2.3', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SUPPLY);
  const dash = await importable(page, SALES, 'e2e 2.3 import');
  // 2.3 used a 12-column grid: 2.4 doubles every position and size.
  const old = {
    ...dash,
    version: '2.3',
    pages: dash.pages.map((p) => ({
      ...p,
      reports: p.reports.map((r) => ({ ...r, x: r.x / 2, y: r.y / 2, width: r.width / 2, height: r.height / 2 })),
    })),
  };
  const dialog = await openImport(page);
  await setJson(dialog, JSON.stringify(old));
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Dashboard upgraded')).toBeVisible();
  await expectFirstPageRenders(page, dash);
  await expectNoErrors(page, errors);
});

test('import verifies the JSON, and refuses JSON that is not a dashboard', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const dialog = await openImport(page);
  await setJson(dialog, '{ not json');
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByText(/isn't valid JSON/)).toBeVisible();
  // Nothing was imported: the dialog stays open, and Sales is still open and saved.
  await expect(dialog).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();

  await setJson(dialog, JSON.stringify(await importable(page, SUPPLY, 'e2e verified import')));
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(dialog.getByText(/^Valid dashboard JSON: \d+ pages?, \d+ reports?\.$/)).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Edit JSON replaces a dashboard, and Save writes it back to that dashboard', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const uuid = `dddd0000-0000-4000-8000-00000000e1${test.info().project.name === 'dark' ? 'dd' : 'ee'}`;
  const title = `e2e edit json ${test.info().project.name}`;
  await putDashboard(page, uuid, { ...(await getDashboard(page, SALES)), title });
  try {
    await openPage(page, SUPPLY);
    const dialog = await openEditJson(page, title);
    const dash = JSON.parse(await downloadText(dialog, /Download/));
    expect(dash.uuid).toBe(uuid);
    expect(dash.title).toBe(title);
    // A bulk change: every report on the first page renamed.
    const edited = {
      ...dash,
      title: `${title} (edited)`,
      pages: dash.pages.map((p, i) =>
        i === 0 ? { ...p, reports: p.reports.map((r) => ({ ...r, title: `Edited ${r.title}` })) } : p
      ),
    };
    await setJson(dialog, JSON.stringify(edited, null, 2));
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/dashboards/${uuid}`));
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expectFirstPageRenders(page, edited);

    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/api/dashboards/')),
      page.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);
    expect(saved.status()).toBe(200);
    expect(new URL(saved.url()).pathname).toBe(`/api/dashboards/${uuid}`);
    await expect(page.getByText('All changes saved')).toBeVisible();
    const stored = await getDashboard(page, uuid);
    expect(stored.title).toBe(edited.title);
    expect(stored.pages[0].reports.map((r) => r.title)).toEqual(edited.pages[0].reports.map((r) => r.title));
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('Edit JSON on the open dashboard edits its unsaved changes', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const sales = await getDashboard(page, SALES);
  const supply = await getDashboard(page, SUPPLY);
  const tab = page.locator('.nd-page-tab').nth(1);
  await tab.hover();
  await tab.getByRole('button', { name: 'Page actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit name' }).click();
  await tab.locator('input').fill('Unsaved page name');
  await tab.locator('input').press('Enter');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  let dialog = await openEditJson(page, sales.title);
  expect(await downloadText(dialog, /Download/)).toContain('"Unsaved page name"');
  await expect(dialog.getByText('discard the unsaved changes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Another dashboard's JSON can be edited too, but applying it replaces the unsaved changes.
  dialog = await openEditJson(page, supply.title);
  await expect(dialog.getByText('Applying will discard the unsaved changes to the open dashboard.')).toBeVisible();
  await expectNoErrors(page, errors);
});

test('every seed dashboard verifies', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  for (const uuid of [SALES, SUPPLY, SINK]) {
    const { title } = await getDashboard(page, uuid);
    const dialog = await openEditJson(page, title);
    await dialog.getByRole('button', { name: 'Verify' }).click();
    await expect(dialog.getByText(/^Valid dashboard JSON/), title).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  await expectNoErrors(page, errors);
});

test('Edit JSON lists what is wrong, and Apply refuses JSON that does not verify', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const supply = await getDashboard(page, SUPPLY);
  const dialog = await openEditJson(page, supply.title);
  const apply = dialog.getByRole('button', { name: 'Apply' });

  await setJson(dialog, '{ "title": "no pages" ');
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(dialog.getByText(/isn't valid JSON/)).toBeVisible();
  await apply.click();
  await expect(dialog.getByText(/isn't valid JSON/)).toBeVisible();

  // Valid JSON, but not a dashboard that would load: every problem is listed.
  const [first, second] = supply.pages[0].reports;
  const broken = {
    ...supply,
    version: '9.9',
    pages: [
      {
        ...supply.pages[0],
        reports: [
          { ...first, type: 'piechartt' },
          { ...second, id: first.id, width: 'wide' },
        ],
      },
      { title: 'No reports' },
    ],
  };
  await setJson(dialog, JSON.stringify(broken, null, 2));
  await apply.click();
  await expect(dialog.getByText('5 problems:')).toBeVisible();
  for (const problem of [
    '"version" is "9.9"',
    `report 1 ("${first.title}"): "piechartt" is not a report type.`,
    `report 2 ("${second.title}"): "id" ${first.id} is used by another report too.`,
    `report 2 ("${second.title}"): "width" should be a number, 0 or more.`,
    'Page 2 ("No reports"): "reports" should be a list.',
  ]) {
    await expect(dialog.getByText(problem, { exact: false })).toBeVisible();
  }
  // Nothing was applied: the dialog stays open, and Sales is still open and saved.
  await expect(dialog).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Editing clears the result; fixing the JSON lets it through.
  await setJson(dialog, JSON.stringify(supply));
  await expect(dialog.getByText('5 problems:')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(dialog.getByText(/^Valid dashboard JSON/)).toBeVisible();
  await apply.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: supply.title })).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Edit JSON replaces the JSON from a file, and downloads it', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const supply = await getDashboard(page, SUPPLY);
  const dialog = await openEditJson(page, supply.title);
  const text = JSON.stringify({ ...supply, title: 'From a file' }, null, 2);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: /Replace from file/ }).click(),
  ]);
  await chooser.setFiles({ name: 'dashboard.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(jsonEditor(dialog)).toContainText('{');
  expect(await downloadText(dialog, /Download/)).toBe(text);
  await expectNoErrors(page, errors);
});

test('the JSON editor highlights the JSON and numbers its lines', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const supply = await getDashboard(page, SUPPLY);
  const dialog = await openEditJson(page, supply.title);
  await setJson(dialog, '{\n  "title": "Colours",\n  "count": 3,\n  "shared": true,\n  "owner": null\n}');
  const editor = dialog.locator('.nd-json-editor');
  // (The gutter also holds a hidden number it measures its width with.)
  await expect(editor.locator('.cm-lineNumbers .cm-gutterElement:visible')).toHaveText(['1', '2', '3', '4', '5', '6']);
  await expect(editor.locator('.tok-property')).toHaveText(['"title"', '"count"', '"shared"', '"owner"']);
  await expect(editor.locator('.tok-string')).toHaveText(['"Colours"']);
  await expect(editor.locator('.tok-number')).toHaveText(['3']);
  await expect(editor.locator('.tok-literal')).toHaveText(['true', 'null']);
  const colour = (selector) =>
    editor
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).color);
  const colours = new Set([await colour('.tok-property'), await colour('.tok-string'), await colour('.tok-number')]);
  expect(colours.size, 'properties, strings and numbers each have their own colour').toBe(3);
  await expectNoErrors(page, errors);
});

test('the JSON editor marks a syntax error where it is, and explains it', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  // An empty editor has nothing to mark.
  const importDialog = await openImport(page);
  await expect(importDialog.locator('.nd-json-editor')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(importDialog.locator('.cm-lintRange-error')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(importDialog).toHaveCount(0);

  const supply = await getDashboard(page, SUPPLY);
  const dialog = await openEditJson(page, supply.title);
  // Line 3 is missing its comma: the parser stops at the start of line 4.
  await setJson(dialog, '{\n  "title": "Broken",\n  "version": "2.4"\n  "pages": []\n}');
  const mark = dialog.locator('.cm-lintRange-error');
  await expect(mark).toHaveCount(1);
  await expect(dialog.locator('.cm-line:has(.cm-lintRange-error)')).toHaveText('  "pages": []');
  // The gutter marks the line too, so an error is easy to find in a long dashboard.
  const gutterMarker = dialog.locator('.cm-lint-marker-error');
  await expect(gutterMarker).toHaveCount(1);
  const markerTop = (await gutterMarker.boundingBox()).y;
  const lineBox = await dialog.locator('.cm-line:has(.cm-lintRange-error)').boundingBox();
  expect(markerTop).toBeGreaterThanOrEqual(lineBox.y - 2);
  expect(markerTop).toBeLessThan(lineBox.y + lineBox.height);

  // Hovering the mark explains it.
  const box = await mark.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 3 });
  await expect(dialog.locator('.cm-tooltip-lint')).toContainText(/Expected ',' or '}'|Unexpected/);

  // Fixed, the mark goes.
  await setJson(dialog, '{\n  "title": "Fixed",\n  "version": "2.4",\n  "pages": []\n}');
  await expect(mark).toHaveCount(0);
  await expect(gutterMarker).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test('the JSON editor can be made taller or shorter', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const supply = await getDashboard(page, SUPPLY);
  const dialog = await openEditJson(page, supply.title);
  const editor = dialog.locator('.nd-json-editor');
  expect(await editor.evaluate((el) => getComputedStyle(el).resize)).toBe('vertical');
  const before = await editor.boundingBox();
  // Drag the bottom-right corner up by 120px.
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 123, { steps: 5 });
  await page.mouse.up();
  const after = await editor.boundingBox();
  expect(after.height).toBeLessThan(before.height - 50);
  // The editor's text area follows the box.
  const scroller = await editor.locator('.cm-scroller').boundingBox();
  expect(scroller.height).toBeLessThanOrEqual(after.height);
  await expectNoErrors(page, errors);
});

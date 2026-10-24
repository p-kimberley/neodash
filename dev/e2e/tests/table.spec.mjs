// Table reports (NDL's data grid): each table setting, on a temporary dashboard.
import { test, expect } from '@playwright/test';
import {
  SALES,
  card,
  deleteDashboard,
  editReport,
  expectNoErrors,
  getDashboard,
  openPage,
  putDashboard,
  trackErrors,
} from './helpers.mjs';

const uuidFor = (name, project) =>
  `dddd0000-0000-4000-8000-0000${name}${project === 'dark' ? 'd' : 'e'}`.padEnd(36, '0').slice(0, 36);

/** A dashboard with one page of the given table reports (built on a Sales report). */
const tableDashboard = async (page, reports) => {
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const template = dash.pages[0].reports[0];
  return {
    ...dash,
    title: 'e2e tables',
    extensions: { ...(dash.extensions || {}), actions: { active: true } },
    pages: [
      {
        title: 'Tables',
        reports: reports.map((r, i) => ({
          ...template,
          id: `7ab1e000-0000-4000-8000-00000000000${i}`,
          type: 'table',
          x: (i % 2) * 12,
          y: Math.floor(i / 2) * 5,
          width: 12,
          height: 5,
          selection: {},
          settings: {},
          ...r,
        })),
      },
    ],
  };
};

const withDashboard = async (page, name, reports, fn) => {
  const uuid = uuidFor(name, test.info().project.name);
  await putDashboard(page, uuid, await tableDashboard(page, reports));
  try {
    await openPage(page, uuid);
    await fn();
  } finally {
    await deleteDashboard(page, uuid);
  }
};

const bodyRows = (report) => report.locator('.ndl-data-grid-tbody .ndl-data-grid-tr');
const cellTexts = (report, column) =>
  report
    .locator('.ndl-data-grid-tbody .ndl-data-grid-tr')
    .evaluateAll((rows, c) => rows.map((r) => r.querySelectorAll('.ndl-data-grid-td')[c]?.textContent?.trim()), column);

test('table: sorting, filtering, hidden columns, page size and download', async ({ page }) => {
  const errors = trackErrors(page);
  const query = "UNWIND range(1, 30) AS i RETURN i AS n, 'name ' + toString(i) AS name, i % 3 AS __group";
  await withDashboard(
    page,
    'aa',
    [{ title: 'Numbers', query, settings: { pageSize: 10, allowDownload: true } }],
    async () => {
      const report = card(page, 'Numbers');
      // "__" columns are hidden; numbers line up on the right.
      await expect(report.getByRole('columnheader')).toHaveText([/n/, /name/]);
      await expect(report.locator('.ndl-data-grid-td.nd-table-number').first()).toBeVisible();
      // 10 rows per page, as set.
      await expect(bodyRows(report)).toHaveCount(10);
      expect(await cellTexts(report, 0)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

      // Sorting from the column's menu (or by clicking its title), numerically.
      const header = report.getByRole('columnheader').nth(0);
      await header.hover();
      await header.getByRole('button', { name: 'Actions' }).click();
      await page.getByRole('menuitem', { name: /descending/i }).click();
      expect((await cellTexts(report, 0))[0]).toBe('30');

      // Filtering a column (contains, case-insensitive).
      const nameHeader = report.getByRole('columnheader').nth(1);
      await nameHeader.hover();
      await nameHeader.getByRole('button', { name: 'Actions' }).click();
      await page.getByRole('menuitem', { name: 'Filter...' }).click();
      // The filter has focus when it opens.
      await page.keyboard.type('NAME 2');
      await expect(page.getByRole('textbox', { name: /Filter name/ })).toHaveValue('NAME 2');
      await page.keyboard.press('Enter');
      // 11 match; still sorted by n descending, the first page holds 29 down to 20.
      expect(await cellTexts(report, 1)).toEqual([
        'name 29',
        'name 28',
        'name 27',
        'name 26',
        'name 25',
        'name 24',
        'name 23',
        'name 22',
        'name 21',
        'name 20',
      ]);
      await expect(report.getByLabel('Filtered')).toBeVisible();

      // Rows per page: another size is remembered by this browser for the table.
      await report.getByRole('combobox', { name: 'Rows per page' }).click();
      await page.getByRole('option', { name: '25', exact: true }).click();
      await page.reload();
      await expect(bodyRows(card(page, 'Numbers'))).toHaveCount(25);

      // CSV download.
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        card(page, 'Numbers').getByRole('button', { name: 'Download CSV' }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    }
  );
  await expectNoErrors(page, errors);
});

test('table: click and checkbox actions set parameters; double-click copies', async ({ page, context }) => {
  const errors = trackErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const url = () => decodeURIComponent(page.url().replace(/\+/g, ' '));
  await withDashboard(
    page,
    'ab',
    [
      {
        title: 'Letters',
        query: "UNWIND ['alpha', 'beta', 'gamma'] AS letter RETURN letter, size(letter) AS length",
        settings: {
          actionsRules: [
            {
              condition: 'Click',
              field: 'letter',
              value: 'letter',
              customization: 'set variable',
              customizationValue: 'letter',
            },
            {
              condition: 'rowCheck',
              field: '',
              value: 'letter',
              customization: 'set variable',
              customizationValue: 'checked',
            },
          ],
        },
      },
    ],
    async () => {
      const report = card(page, 'Letters');
      // The clicked cell's value becomes the parameter.
      await report.locator('.ndl-data-grid-td', { hasText: 'beta' }).first().click();
      await expect.poll(url).toContain('neodash_letter=beta');
      // Checked rows are collected into a list parameter.
      await report.getByRole('checkbox', { name: 'Select row 1' }).check();
      await report.getByRole('checkbox', { name: 'Select row 3' }).check();
      await expect.poll(url).toMatch(/neodash_checked=.*alpha.*gamma/);
      // Double-clicking a cell without a double-click rule copies its value.
      await report.locator('.ndl-data-grid-td', { hasText: '5' }).first().dblclick();
      await expect(page.getByText('Value copied to clipboard.')).toBeVisible();
    }
  );
  await expectNoErrors(page, errors);
});

test('table: transposed and fixed-width tables', async ({ page }) => {
  const errors = trackErrors(page);
  await withDashboard(
    page,
    'ac',
    [
      { title: 'Transposed', query: "RETURN 'x' AS key, 1 AS a, 2 AS b", settings: { transposed: true } },
      {
        title: 'Fixed widths',
        query: "RETURN 'left' AS l, 'right' AS r",
        settings: { columnWidthsType: 'Fixed (px)', columnWidths: '[200, 90]' },
      },
    ],
    async () => {
      // Transposed: the fields become rows.
      const transposed = card(page, 'Transposed');
      expect(await cellTexts(transposed, 0)).toEqual(['a', 'b']);
      // Fixed widths in pixels.
      const widths = await card(page, 'Fixed widths')
        .getByRole('columnheader')
        .evaluateAll((hs) => hs.map((h) => Math.round(h.getBoundingClientRect().width)));
      expect(widths).toEqual([200, 90]);
    }
  );
  await expectNoErrors(page, errors);
});

/** Rounded widths of a table's column headers, and the width of its grid's scrolling area. */
const columnWidths = (report) =>
  report.getByRole('columnheader').evaluateAll((hs) => hs.map((h) => Math.round(h.getBoundingClientRect().width)));
const gridWidth = (report) => report.locator('.ndl-data-grid-scrollable').evaluate((s) => s.clientWidth);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('table: relative, percentage, default and fixed column widths', async ({ page }) => {
  const errors = trackErrors(page);
  await withDashboard(
    page,
    'ad',
    [
      // Comma-separated, as the setting is described; the hidden column takes no width.
      {
        title: 'Relative',
        query: "RETURN 'a' AS a, 'b' AS b, 'c' AS c, 1 AS __h",
        settings: { columnWidths: '2, 1, 1' },
      },
      { title: 'Percent', query: "RETURN 'a' AS a, 'b' AS b, 'c' AS c", settings: { columnWidths: '50%, 25%, 25%' } },
      { title: 'Default', query: 'RETURN 1 AS x, 2 AS y, 3 AS __hidden' },
      {
        title: 'Fixed',
        query: "RETURN 'left' AS l, 'right' AS r",
        settings: { columnWidthsType: 'Fixed (px)', columnWidths: '150px, 300' },
      },
    ],
    async () => {
      for (const title of ['Relative', 'Percent']) {
        const report = card(page, title);
        const widths = await columnWidths(report);
        expect(widths, title).toHaveLength(3);
        // 2 : 1 : 1, filling the grid.
        expect(Math.abs(widths[0] - 2 * widths[1]), `${title} ${widths}`).toBeLessThanOrEqual(2);
        expect(Math.abs(widths[1] - widths[2]), `${title} ${widths}`).toBeLessThanOrEqual(1);
        expect(sum(widths), title).toBe(await gridWidth(report));
      }
      // By default the visible columns share the whole width equally.
      const defaults = card(page, 'Default');
      const widths = await columnWidths(defaults);
      expect(widths).toHaveLength(2);
      expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
      expect(sum(widths)).toBe(await gridWidth(defaults));
      expect(await columnWidths(card(page, 'Fixed'))).toEqual([150, 300]);
    }
  );
  await expectNoErrors(page, errors);
});

test('table: wrapped content breaks between words and keeps the column widths', async ({ page }) => {
  const errors = trackErrors(page);
  await withDashboard(
    page,
    'ae',
    [
      {
        title: 'Wrapped',
        query:
          "RETURN 'alpha bravo charlie delta echo foxtrot golf' AS words, 'supercalifragilisticexpialidocious' AS long",
        settings: { wrapContent: true, columnWidthsType: 'Fixed (px)', columnWidths: '120, 80' },
      },
    ],
    async () => {
      const report = card(page, 'Wrapped');
      const cells = report.locator('.ndl-data-grid-tbody .ndl-data-grid-td');
      // The text wraps onto several lines, and no word is split across two.
      const lines = await cells.first().evaluate((td) => {
        const text = td.querySelector('.nd-table-cell-value');
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        const result = { tops: new Set(), split: [] };
        for (const match of node.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          if (rects.length !== 1) {
            result.split.push(match[0]);
          }
          rects.forEach((r) => result.tops.add(Math.round(r.top)));
        }
        return { lines: result.tops.size, split: result.split };
      });
      expect(lines.split).toEqual([]);
      expect(lines.lines).toBeGreaterThan(1);
      // A word longer than its column is broken rather than widening the cell.
      const cellWidths = await cells.evaluateAll((tds) =>
        tds.map((td) => Math.round(td.getBoundingClientRect().width))
      );
      expect(cellWidths).toEqual([120, 80]);
      expect(await columnWidths(report)).toEqual([120, 80]);
    }
  );
  await expectNoErrors(page, errors);
});

test('table: dragging a column edge saves fixed widths', async ({ page }) => {
  const errors = trackErrors(page);
  await withDashboard(
    page,
    'af',
    [{ title: 'Drag', query: "RETURN 'one' AS first, 'two' AS second, 'three' AS third" }],
    async () => {
      const report = card(page, 'Drag');
      const before = await columnWidths(report);
      const resizer = report.getByRole('columnheader').nth(0).locator('.ndl-data-grid-resizer');
      const box = await resizer.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      const after = await columnWidths(report);
      expect(Math.abs(after[0] - (before[0] + 60)), `${before} -> ${after}`).toBeLessThanOrEqual(2);
      expect(after.slice(1)).toEqual(before.slice(1));

      // The report now has fixed widths: the ones dragged to.
      await editReport(report);
      await report.getByText('Advanced settings').click();
      await expect(report.getByRole('combobox', { name: 'Column Widths Specification' })).toContainText('Fixed (px)');
      await expect(report.getByRole('textbox', { name: 'Relative/Fixed Column Sizes' })).toHaveValue(
        `[${after.join(', ')}]`
      );
    }
  );
  await expectNoErrors(page, errors);
});

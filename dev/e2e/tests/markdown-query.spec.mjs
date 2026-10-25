// Markdown reports with a Cypher query: the first row fills {{column}} placeholders in the Markdown.
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

/** A one-page dashboard of Markdown reports (built on a Sales report). */
const markdownDashboard = async (page, reports) => {
  await page.goto('/');
  const dash = await getDashboard(page, SALES);
  const template = dash.pages[0].reports[0];
  return {
    ...dash,
    title: 'e2e markdown',
    // Report actions, for a table that sets a parameter.
    extensions: { ...(dash.extensions || {}), actions: { active: true } },
    pages: [
      {
        title: 'Markdown',
        reports: reports.map((r, i) => ({
          ...template,
          id: `3d000000-0000-4000-8000-00000000000${i}`,
          type: 'text',
          x: (i % 2) * 12,
          y: Math.floor(i / 2) * 4,
          width: 12,
          height: 4,
          selection: {},
          ...r,
        })),
      },
    ],
  };
};

const REPORTS = [
  {
    title: 'Values',
    query: 'People: {{people}}. Top: {{top.name}} ({{tags}}). Unknown: {{nope}}. Parameter: `$neodash_who`',
    settings: { cypherQuery: "RETURN 4 AS people, {name: 'Ada'} AS top, ['a', 'b'] AS tags" },
  },
  {
    title: 'Node',
    query: 'Product: {{p.name}} / {{name}}',
    settings: { cypherQuery: 'MATCH (p:Product) RETURN p, p.name AS name ORDER BY p.sku LIMIT 1' },
  },
  {
    title: 'No rows',
    query: 'Name: [{{name}}]',
    settings: { cypherQuery: 'MATCH (p:Product) WHERE p.sku = "no such sku" RETURN p.name AS name' },
  },
  { title: 'Plain', query: 'Braces stay: {{name}}' },
];

const markdownText = async (report) => (await report.locator('.markdown-widget').innerText()).trim();

const expectFilled = async (page) => {
  await expect
    .poll(() => markdownText(card(page, 'Values')))
    .toContain('People: 4. Top: Ada (a, b). Unknown: {{nope}}.');
  const product = await markdownText(card(page, 'Node'));
  const [, byProperty, byColumn] = product.match(/Product: (.+) \/ (.+)/) ?? [];
  expect(byProperty, product).toBeTruthy();
  expect(byProperty).toBe(byColumn.trim());
  expect(await markdownText(card(page, 'No rows'))).toContain('Name: []');
  // Without a query, the Markdown is as written.
  expect(await markdownText(card(page, 'Plain'))).toContain('Braces stay: {{name}}');
};

test('markdown: a Cypher query fills {{column}} placeholders', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = uuidFor('ba', test.info().project.name);
  await putDashboard(page, uuid, await markdownDashboard(page, REPORTS));
  try {
    await openPage(page, uuid);
    await expectFilled(page);

    // In the report's settings the query comes first (where other reports have theirs), then the Markdown.
    const report = card(page, 'Values');
    await editReport(report);
    const editors = report.locator('.cm-content');
    await expect(editors).toHaveCount(2);
    await expect(editors.nth(0)).toContainText('RETURN 4 AS people');
    await expect(editors.nth(1)).toContainText('People: {{people}}');
    const markdownLabel = await report.locator('.nd-markdown-label').boundingBox();
    expect((await editors.nth(0).boundingBox()).y).toBeLessThan(markdownLabel.y);
    expect((await editors.nth(1).boundingBox()).y).toBeGreaterThan(markdownLabel.y);
    // With a language model, the Cypher/English switch sits above the query, as for other reports.
    const english = report.getByRole('switch', { name: 'Write the query in English' });
    if (await english.count()) {
      expect((await english.boundingBox()).y).toBeLessThan((await editors.nth(0).boundingBox()).y);
    }
    // Saved straight after typing: the change still reaches the report.
    await editors.nth(0).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type("RETURN 7 AS people, {name: 'Grace'} AS top, [] AS tags");
    await report.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => markdownText(card(page, 'Values'))).toContain('People: 7. Top: Grace ().');
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('markdown: the query uses dashboard parameters and runs again when they change', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = uuidFor('bd', test.info().project.name);
  await putDashboard(
    page,
    uuid,
    await markdownDashboard(page, [
      { title: 'Greeting', query: 'Hello [{{who}}]', settings: { cypherQuery: 'RETURN $neodash_who AS who' } },
      {
        // Clicking a name sets the "who" parameter.
        title: 'Names',
        type: 'table',
        query: "UNWIND ['Ada', 'Grace'] AS name RETURN name",
        settings: {
          actionsRules: [
            {
              condition: 'Click',
              field: 'name',
              value: 'name',
              customization: 'set variable',
              customizationValue: 'who',
            },
          ],
        },
      },
    ])
  );
  try {
    await openPage(page, uuid);
    const greeting = card(page, 'Greeting');
    // Not set yet: the query gets null, and the placeholder is empty.
    await expect.poll(() => markdownText(greeting)).toBe('Hello []');
    const names = card(page, 'Names');
    await names.locator('.ndl-data-grid-td', { hasText: 'Grace' }).first().click();
    await expect.poll(() => markdownText(greeting)).toBe('Hello [Grace]');
    await names.locator('.ndl-data-grid-td', { hasText: 'Ada' }).first().click();
    await expect.poll(() => markdownText(greeting)).toBe('Hello [Ada]');
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('markdown: Cancel discards a changed query', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = uuidFor('be', test.info().project.name);
  await putDashboard(page, uuid, await markdownDashboard(page, [REPORTS[0]]));
  try {
    await openPage(page, uuid);
    const report = card(page, 'Values');
    await expect.poll(() => markdownText(report)).toContain('People: 4.');
    await editReport(report);
    const query = report.locator('.cm-content').first();
    await query.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('RETURN 9 AS people');
    // Long enough for the change to reach the report before it is cancelled.
    await page.waitForTimeout(500);
    await report.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => markdownText(report)).toContain('People: 4.');
    // The settings show the query as it was.
    await editReport(report);
    await expect(report.locator('.cm-content').first()).toContainText('RETURN 4 AS people');
    await report.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test('markdown: a failing query shows its error', async ({ page }) => {
  const errors = trackErrors(page);
  const uuid = uuidFor('bb', test.info().project.name);
  await putDashboard(
    page,
    uuid,
    await markdownDashboard(page, [{ title: 'Broken', query: '{{x}}', settings: { cypherQuery: 'RETURN nope(' } }])
  );
  try {
    await openPage(page, uuid);
    await expect(card(page, 'Broken')).toContainText(/SyntaxError|Invalid input/);
  } finally {
    await deleteDashboard(page, uuid);
  }
  await expectNoErrors(page, errors);
});

test.describe('viewer', () => {
  test.use({ storageState: './.auth/viewer.json' });

  test('markdown: viewers see the filled Markdown (the saved query runs on the server)', async ({ page }) => {
    const errors = trackErrors(page);
    const editor = await page
      .context()
      .browser()
      .newContext({ storageState: './.auth/editor.json', baseURL: test.info().project.use.baseURL });
    const editorPage = await editor.newPage();
    const uuid = uuidFor('bc', test.info().project.name);
    await putDashboard(editorPage, uuid, await markdownDashboard(editorPage, REPORTS));
    try {
      await openPage(page, uuid);
      await expectFilled(page);
    } finally {
      await deleteDashboard(editorPage, uuid);
      await editor.close();
    }
    await expectNoErrors(page, errors);
  });
});

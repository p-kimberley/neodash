import { expect } from '@playwright/test';

export const SALES = '5a1e5000-0000-4000-8000-000000000000';
export const SUPPLY = '5c4a1000-0000-4000-8000-000000000000';
export const SINK = 'c0ffee00-0000-4000-8000-000000000000';

// Text a report shows instead of its visualisation when something went wrong.
const REPORT_FAILURE =
  /can not be visualized|Query returned no data|timed out|Neo4jError|SyntaxError|is not defined|Invalid report type/i;

/** Collects uncaught page errors and the dev server's error overlay; check with `expectNoErrors`. */
export const trackErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

export const expectNoErrors = async (page, errors) => {
  expect(await page.locator('#webpack-dev-server-client-overlay').count(), 'dev server error overlay').toBe(0);
  expect(errors, 'uncaught page errors').toEqual([]);
};

/** The saved dashboard JSON, via the API (signed in as the page's user). */
export const getDashboard = async (page, uuid) => {
  const res = await page.request.get(`/api/dashboards/${uuid}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return typeof body.content === 'string' ? JSON.parse(body.content) : body.content;
};

/** Saves a temporary copy of a dashboard under `uuid`; delete it with `deleteDashboard`. */
export const putDashboard = async (page, uuid, dash) => {
  const origin = new URL(page.url() === 'about:blank' ? (process.env.APP_URL ?? 'http://localhost:5173') : page.url())
    .origin;
  const res = await page.request.put(`/api/dashboards/${uuid}`, { data: { ...dash, uuid }, headers: { origin } });
  expect(res.status()).toBe(200);
};

export const deleteDashboard = async (page, uuid) => {
  const origin = new URL(page.url()).origin;
  await page.request.delete(`/api/dashboards/${uuid}`, { headers: { origin } });
};

/** Opens a dashboard page and waits until no report is still loading. */
export const openPage = async (page, uuid, pageIndex = 0) => {
  await page.goto(`/dashboards/${uuid}?page=${pageIndex}`);
  await expect(page.locator('.nd-report-card').first()).toBeVisible({ timeout: 60_000 });
  const loading = page.locator('.nd-report-card .nd-report-loading');
  try {
    await expect(loading).toHaveCount(0, { timeout: 30_000 });
  } catch (e) {
    const stuck = await page
      .locator('.nd-report-card:has(.nd-report-loading)')
      .evaluateAll((cards) => cards.map((c) => c.querySelector('input')?.value));
    throw new Error(`reports still loading after 30s: ${JSON.stringify(stuck)}`, { cause: e });
  }
  // Charts animate in and graphs settle; give them a moment before measuring.
  await page.waitForTimeout(1500);
};

export const card = (page, title) => page.locator(`.nd-report-card:has(input[value="${title}"])`).first();

/** The largest visual element in `root` (chart canvas/svg, table, map, graph...), as {width, height}. */
export const largestVisual = (root) =>
  root.evaluate((el) => {
    const rects = [
      ...el.querySelectorAll(
        'canvas, svg, .ndl-data-grid-root, .maplibregl-map, .markdown-widget, iframe, input, table'
      ),
    ]
      .map((e) => e.getBoundingClientRect())
      .map((r) => ({ width: Math.round(r.width), height: Math.round(r.height) }))
      .sort((a, b) => b.width * b.height - a.width * a.height);
    return rects[0] ?? { width: 0, height: 0 };
  });

export const expectReportOk = async (cardLocator, title) => {
  const text = await cardLocator.innerText();
  expect(text, `report "${title}" shows a failure`).not.toMatch(REPORT_FAILURE);
  const visual = await largestVisual(cardLocator);
  expect(visual.width * visual.height, `report "${title}" draws nothing`).toBeGreaterThan(0);
};

/** Opens a report's actions menu (⋮) and picks an item, e.g. 'Settings' or 'View as table'. */
export const reportMenu = async (cardLocator, item) => {
  await cardLocator.getByRole('button', { name: 'Report actions' }).first().click();
  await cardLocator.page().getByRole('menuitem', { name: item }).click();
};

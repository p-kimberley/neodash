// Keeps the address bar and tab title in step with what the user is looking at, so links can be
// shared and bookmarked, back/forward work, and proxy/browser history shows which dashboard and page
// was open. Format:
//
//   /                                                       the dashboard selector (start page)
//   /dashboards/<uuid>?page=<n>&neodash_<parameter>=<value>  a dashboard
//
// String parameter values appear as-is (matching NeoDash's existing ?neodash_x=value deep links);
// other values (numbers, dates, lists) are written as json:<typed JSON> so they round-trip exactly.

import neo4j from 'neo4j-driver';
import { decode, encode } from '../../server/src/codec';
import { loadDashboardFromNeo4jThunk, loadDashboardThunk } from '../dashboard/DashboardThunks';
import { setPageNumberThunk, updateGlobalParametersThunk } from '../settings/SettingsThunks';
import { setDraft, setHomeOpen } from './ApplicationActions';
import { APP_NAME } from '../config/ApplicationConfig';

export interface UrlState {
  /** No dashboard in the URL: show the dashboard selector. */
  home?: boolean;
  uuid?: string;
  page?: number;
  parameters: Record<string, unknown>;
}

const DASHBOARD_PATH = /^\/dashboards\/([^/]+)\/?$/;

function parseValue(raw: string): unknown {
  if (!raw.startsWith('json:')) {
    return raw;
  }
  try {
    return decode(JSON.parse(raw.slice(5)), neo4j as any);
  } catch {
    return raw;
  }
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : `json:${JSON.stringify(encode(value))}`;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

export function parseUrl(url: string | Location = window.location): UrlState {
  const { pathname, search } = typeof url === 'string' ? new URL(url, window.location.origin) : url;
  const query = new URLSearchParams(search);
  let uuid = pathname.match(DASHBOARD_PATH)?.[1];
  // Share links from NeoDash 2.4 (?share&type=database&id=<uuid>) still open the dashboard.
  if (!uuid && query.has('share') && query.get('type') === 'database' && query.get('id')) {
    uuid = query.get('id') ?? undefined;
  }
  const page = Number.parseInt(query.get('page') ?? '', 10);
  const parameters: Record<string, unknown> = {};
  query.forEach((value, key) => {
    if (key.startsWith('neodash_')) {
      parameters[key] = parseValue(value);
    }
  });
  return {
    home: !uuid,
    uuid: uuid ? decodeURIComponent(uuid) : undefined,
    page: Number.isNaN(page) ? undefined : page,
    parameters,
  };
}

export function buildUrl(state: any): string {
  const dashboard = state.dashboard ?? {};
  if (state.application?.homeOpen || !dashboard.uuid) {
    return '/';
  }
  const query = new URLSearchParams();
  const page = dashboard.settings?.pagenumber ?? 0;
  if (page > 0) {
    query.set('page', String(page));
  }
  const parameters = dashboard.settings?.parameters ?? {};
  for (const key of Object.keys(parameters).sort()) {
    // *_display values are derived from the value and only clutter the link.
    if (!key.startsWith('neodash_') || key.endsWith('_display') || isEmpty(parameters[key])) {
      continue;
    }
    query.set(key, formatValue(parameters[key]));
  }
  const qs = query.toString();
  return `/dashboards/${encodeURIComponent(dashboard.uuid)}${qs ? `?${qs}` : ''}`;
}

export function buildTitle(state: any): string {
  const dashboard = state.dashboard ?? {};
  const pages: any[] = dashboard.pages ?? [];
  if (!state.application?.connected) {
    return APP_NAME;
  }
  if (state.application?.homeOpen || !dashboard.uuid) {
    return `Dashboards · ${APP_NAME}`;
  }
  const pageTitle = pages.length > 1 ? pages[dashboard.settings?.pagenumber ?? 0]?.title : undefined;
  return [pageTitle, dashboard.title, APP_NAME].filter(Boolean).join(' · ');
}

/** Opens the dashboard, page and parameters from a URL. Resolves once everything is applied. */
export const applyUrlStateThunk =
  (target: UrlState, options: { fresh?: boolean; keepDraft?: boolean } = {}) =>
  async (dispatch: any, getState: any) => {
    if (!target.uuid) {
      dispatch(setHomeOpen(true));
      return;
    }
    const current = getState();
    const sameDashboard = Boolean(target.uuid) && target.uuid === current.dashboard?.uuid;
    // `fresh` (start-up) refetches the saved copy even if it is already cached, except for an editor's
    // unsaved draft, which survives a reload as it always has in NeoDash.
    const keepCached = sameDashboard && (!options.fresh || (options.keepDraft && current.application?.draft));
    if (!keepCached) {
      const loaded = await new Promise<boolean>((resolve) => {
        dispatch(
          loadDashboardFromNeo4jThunk(undefined, undefined, target.uuid, (text: string) => {
            // Freshly loaded from the server, so nothing is unsaved (upgrades set it again).
            dispatch(setDraft(false));
            dispatch(loadDashboardThunk(target.uuid, text));
            resolve(true);
          })
        ).then(() => resolve(false));
      });
      // Not saved yet (e.g. an editor's new dashboard): keep showing the local copy if it is this one.
      if (!loaded && !sameDashboard) {
        dispatch(setHomeOpen(true));
        return;
      }
    }
    dispatch(setHomeOpen(false));
    if (target.page !== undefined) {
      dispatch(setPageNumberThunk(target.page));
    }
    if (Object.keys(target.parameters).length) {
      dispatch(updateGlobalParametersThunk(target.parameters));
    }
  };

/**
 * Mirrors state into the URL and title. Page and dashboard changes add a history entry; parameter
 * changes replace the current one, so dragging a slider doesn't flood the back button.
 */
export function startUrlSync(store: { getState: () => any; subscribe: (l: () => void) => () => void; dispatch: any }) {
  let applying = false;
  let last = window.location.pathname + window.location.search;

  const sync = () => {
    const state = store.getState();
    document.title = buildTitle(state);
    if (applying || !state.application?.connected) {
      return;
    }
    const next = buildUrl(state);
    if (next === last) {
      return;
    }
    const before = parseUrl(last);
    const after = parseUrl(next);
    const navigation =
      before.uuid !== after.uuid || (before.page ?? 0) !== (after.page ?? 0) || before.home !== after.home;
    window.history[navigation ? 'pushState' : 'replaceState'](null, '', next);
    last = next;
  };

  const onPopState = async () => {
    applying = true;
    try {
      const target = parseUrl(window.location);
      // No ?page means the first page, so going back from page 2 to page 1 works.
      await store.dispatch(applyUrlStateThunk({ ...target, page: target.page ?? 0 }));
    } finally {
      applying = false;
      last = window.location.pathname + window.location.search;
      sync();
    }
  };

  const unsubscribe = store.subscribe(sync);
  window.addEventListener('popstate', onPopState);
  // Normalise the URL we started on (e.g. strip legacy share-link credentials) without a new entry.
  const initial = buildUrl(store.getState());
  if (store.getState().application?.connected && initial !== last) {
    window.history.replaceState(null, '', initial);
    last = initial;
  }
  sync();
  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPopState);
  };
}

import { createSelector } from 'reselect';
export const getDashboardUuid = (state: any) => state.dashboard.uuid;

export const getDashboardTitle = (state: any) => state.dashboard.title;

export const getDashboardSettings = (state: any) => state.dashboard.settings;

// The colour scheme is the user's preference (light, dark, or following the system), not a dashboard
// setting. Dashboards saved with a `theme` keep it in their JSON, but it no longer decides the look.
export const getDashboardTheme = (state: any): 'light' | 'dark' => {
  const preference = state?.application?.themePreference ?? 'system';
  if (preference === 'system') {
    return state?.application?.systemDark ? 'dark' : 'light';
  }
  return preference;
};

const NO_EXTENSIONS = {};

// Memoised: a new object on every call made every connected report re-render on any state change
// (e.g. opening the dashboards panel), which stalled animations on pages with graphs.
export const getDashboardExtensions = createSelector(
  (state: any) => state.dashboard.extensions,
  (extensions) => {
    if (!extensions) {
      return NO_EXTENSIONS;
    }
    return Object.fromEntries(Object.entries(extensions).filter(([_, v]: [string, any]) => v.active));
  }
);

export const getPages = (state: any) => state.dashboard.pages;

// Memoised: it is read with useSelector by every graph, table and bar chart, and a new array on
// every call re-rendered them all on any state change.
export const getPageNumbersAndNames = createSelector(
  (state: any) => state.dashboard.pages,
  (pages) => pages.map((page, idx) => `${idx}/${page.title}`)
);

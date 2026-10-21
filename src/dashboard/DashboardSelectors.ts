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

export const getDashboardExtensions = (state: any) => {
  const { extensions } = state.dashboard;
  if (!extensions) {
    return {};
  }

  return Object.fromEntries(Object.entries(extensions).filter(([_, v]) => v.active));
};

export const getPages = (state: any) => state.dashboard.pages;

export const getPageNumbersAndNames = (state: any) => {
  let pageNames = state.dashboard.pages.reduce((acc, page, idx) => {
    acc.push(`${idx}/${page.title}`);
    return acc;
  }, []);
  return pageNames;
};

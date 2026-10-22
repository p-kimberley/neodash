// The documentation is built from docs/ into a static site that the app serves at /docs (see
// scripts/build-docs.mjs), so it can be read without internet access. It opens in a new tab and
// follows the app's theme, which the app records under DOCS_THEME_KEY.

export const DOCS_THEME_KEY = 'nd-docs-theme';

/** The address of a documentation page, e.g. docsUrl('user-guide/reports/index'). */
export const docsUrl = (page = 'index', anchor?: string) => `/docs/${page}.html${anchor ? `#${anchor}` : ''}`;

/** Remembers the app's theme for the documentation. */
export const rememberThemeForDocs = (theme: 'light' | 'dark') => {
  try {
    window.localStorage.setItem(DOCS_THEME_KEY, theme);
  } catch {
    // Storage blocked (e.g. private mode): the documentation follows the system theme instead.
  }
};

// The design tokens from tokens.css as concrete values, for code that cannot use CSS variables
// (canvas-drawn charts, Material UI's theme functions). Keep in sync with tokens.css.

export type Mode = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceVariant: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
  warning: string;
  chartText: string;
  chartGrid: string;
  chartAxis: string;
}

export const palettes: Record<Mode, Palette> = {
  light: {
    bg: '#f5f7fa',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceVariant: '#f0f3f7',
    border: '#e1e6ed',
    borderStrong: '#c4c9d1',
    text: '#151e29',
    textSecondary: '#46505d',
    textMuted: '#636c78',
    textDisabled: '#9aa1ab',
    primary: '#0a6190',
    onPrimary: '#ffffff',
    danger: '#c8243f',
    success: '#2b7a58',
    warning: '#8a5a00',
    chartText: '#46505d',
    chartGrid: '#e6eaef',
    chartAxis: '#b8bfc8',
  },
  dark: {
    bg: '#121922',
    surface: '#1b2430',
    surfaceRaised: '#232e3b',
    surfaceVariant: '#202a36',
    border: '#2c3744',
    borderStrong: '#475363',
    text: '#f1f4f8',
    textSecondary: '#c6ccd4',
    textMuted: '#9ca5b1',
    textDisabled: '#6b7582',
    primary: '#8fe3e8',
    onPrimary: '#081e2b',
    danger: '#ff8fa3',
    success: '#7fe0b6',
    warning: '#ffd866',
    chartText: '#c6ccd4',
    chartGrid: '#2c3744',
    chartAxis: '#4f5b6b',
  },
};

export const FONT_SANS = "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const FONT_MONO = "'Fira Code', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/**
 * Chart series colours (the "default" colour scheme): eight hues in a fixed order, stepped separately
 * for each appearance. The order keeps neighbouring series apart for colour-blind readers, and every
 * colour stays saturated enough to read as a hue. Checked against the chart surfaces above: all pass
 * the lightness band, chroma floor and colour-blind separation for adjacent series in both modes, and
 * clear 3:1 on the dark surface; aqua, yellow and magenta are below 3:1 on white, which is why charts
 * offer "View as table". Use them in order and don't edit single values without re-checking the set.
 */
export const CHART_CATEGORICAL: Record<Mode, string[]> = {
  //     blue       orange     aqua       yellow     magenta    green      violet     red
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** One hue (blue), light to dark, for magnitudes (e.g. choropleth maps); dark mode runs dark to light. */
export const CHART_SEQUENTIAL: Record<Mode, string[]> = {
  light: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  dark: ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6', '#cde2fb'],
};

/** Good / warning / critical, for gauges; the same in both appearances. */
export const CHART_STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };

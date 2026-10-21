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
    primary: '#006fd6',
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
    primary: '#7cc8ff',
    onPrimary: '#08233a',
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

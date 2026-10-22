import * as echarts from 'echarts/core';
import { useSelector } from 'react-redux';
import { CHART_CATEGORICAL, CHART_SEQUENTIAL, FONT_SANS, palettes, Mode } from '../../theme/palette';
import { categoricalColorSchemes } from '../../config/ColorConfig';
import { getDashboardTheme } from '../../dashboard/DashboardSelectors';

/** Name of the registered ECharts theme for an appearance. */
export const echartsThemeName = (mode: Mode) => `neodash-${mode}`;

/** The dashboard's appearance, for charts that pick colours per appearance. */
export const useChartMode = (): Mode => (useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light');

/** The default colour scheme: contrast-checked series colours, stepped for each appearance. */
export const DEFAULT_SCHEME = 'default';

/**
 * The colour scheme a report uses. Reports that never chose one, or kept the old default ("set2"),
 * get the default scheme; any other saved scheme keeps its colours.
 */
export const resolveScheme = (scheme?: string): string =>
  !scheme || scheme === 'set2' || !categoricalColorSchemes[scheme] ? DEFAULT_SCHEME : scheme;

/** Whether a report's colours come from the default scheme (rather than a scheme it chose). */
export const isDefaultScheme = (scheme?: string) => resolveScheme(scheme) === DEFAULT_SCHEME;

/**
 * Colours of a NeoDash colour scheme (the "Color Scheme" report setting, the names nivo used), as a
 * flat list. The default scheme has its own colours per appearance. Sequential schemes (YlOrRd,
 * greens, ...) are lists per number of classes; their largest is used.
 */
export const schemeColors = (scheme: string | undefined, mode: Mode): string[] =>
  colorsOf(resolveScheme(scheme), mode);

/** The colours of a resolved scheme name. */
const colorsOf = (name: string, mode: Mode): string[] => {
  if (name === DEFAULT_SCHEME) {
    return CHART_CATEGORICAL[mode];
  }
  const colors = categoricalColorSchemes[name];
  const flat = Array.isArray(colors[colors.length - 1]) ? colors[colors.length - 1] : colors;
  return [...flat].filter(Boolean);
};

/**
 * The node colour scheme of a graph or map ("Node Color Scheme"). As with charts, reports that never
 * chose one, or kept the old default ("neodash"), get the default scheme; other schemes keep theirs.
 */
export const resolveNodeScheme = (scheme?: string): string =>
  !scheme || scheme === 'neodash' || !categoricalColorSchemes[scheme] ? DEFAULT_SCHEME : scheme;

/** Colours of a node colour scheme for an appearance (one per node label, in order). */
export const nodeSchemeColors = (scheme: string | undefined, mode: Mode): string[] =>
  colorsOf(resolveNodeScheme(scheme), mode);

/** Colours for magnitudes (one hue, low to high) for an appearance. */
export const sequentialColors = (mode: Mode) => CHART_SEQUENTIAL[mode];

/**
 * An ECharts theme matching the design tokens. Axis and legend text is secondary ink (never a series
 * colour), grid lines are solid hairlines, the value axis has no line of its own and only the category
 * axis keeps a baseline, so the data is the strongest thing in the chart.
 */
const themeFor = (mode: Mode) => {
  const c = palettes[mode];
  const axisLabel = { color: c.textMuted, fontSize: 11, hideOverlap: true };
  const splitLine = { lineStyle: { color: c.chartGrid, width: 1, type: 'solid' } };
  const nameTextStyle = { color: c.textSecondary, fontSize: 12 };
  return {
    color: CHART_CATEGORICAL[mode],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT_SANS, color: c.chartText, fontSize: 12 },
    title: { textStyle: { color: c.text } },
    legend: {
      textStyle: { color: c.textSecondary, fontSize: 12 },
      pageTextStyle: { color: c.textSecondary },
      pageIconColor: c.textSecondary,
      pageIconInactiveColor: c.textDisabled,
      inactiveColor: c.textDisabled,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
    },
    tooltip: {
      backgroundColor: c.surfaceRaised,
      borderColor: c.border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: c.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.18); border-radius: 8px;',
      axisPointer: {
        lineStyle: { color: c.chartAxis, width: 1 },
        crossStyle: { color: c.chartAxis, width: 1 },
        shadowStyle: { color: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(21,30,41,0.05)' },
      },
    },
    categoryAxis: {
      axisLine: { show: true, lineStyle: { color: c.chartAxis } },
      axisTick: { show: false },
      axisLabel,
      splitLine: { ...splitLine, show: false },
      nameTextStyle,
    },
    valueAxis: {
      axisLine: { show: false, lineStyle: { color: c.chartAxis } },
      axisTick: { show: false },
      axisLabel,
      splitLine,
      nameTextStyle,
    },
    logAxis: {
      axisLine: { show: false, lineStyle: { color: c.chartAxis } },
      axisTick: { show: false },
      axisLabel,
      splitLine,
      nameTextStyle,
    },
    timeAxis: {
      axisLine: { show: true, lineStyle: { color: c.chartAxis } },
      axisTick: { show: false },
      axisLabel,
      splitLine: { ...splitLine, show: false },
      nameTextStyle,
    },
    radar: {
      axisName: { color: c.textSecondary },
      splitLine: { lineStyle: { color: c.chartGrid } },
      axisLine: { lineStyle: { color: c.chartGrid } },
      splitArea: { show: false },
    },
    visualMap: { textStyle: { color: c.textSecondary } },
  };
};

echarts.registerTheme(echartsThemeName('light'), themeFor('light'));
echarts.registerTheme(echartsThemeName('dark'), themeFor('dark'));

import * as echarts from 'echarts/core';
import { FONT_SANS, palettes, Mode } from '../../theme/palette';
import { categoricalColorSchemes } from '../../config/ColorConfig';

/** Name of the registered ECharts theme for an appearance. */
export const echartsThemeName = (mode: Mode) => `neodash-${mode}`;

/**
 * Colours of a NeoDash colour scheme (the "Color Scheme" report setting, the names nivo used), as a
 * flat list. Sequential schemes (YlOrRd, greens, ...) are lists per number of classes; their largest
 * is used. Unknown names fall back to the default scheme.
 */
export const schemeColors = (scheme?: string): string[] => {
  const colors = categoricalColorSchemes[scheme ?? ''] ?? categoricalColorSchemes.nivo;
  const flat = Array.isArray(colors[colors.length - 1]) ? colors[colors.length - 1] : colors;
  return [...flat].filter(Boolean);
};

/** An ECharts theme matching the design tokens: text, axes, grid lines, tooltips and legends. */
const themeFor = (mode: Mode) => {
  const c = palettes[mode];
  const axis = {
    axisLine: { lineStyle: { color: c.chartAxis } },
    axisTick: { lineStyle: { color: c.chartAxis } },
    axisLabel: { color: c.chartText },
    splitLine: { lineStyle: { color: c.chartGrid } },
    nameTextStyle: { color: c.textSecondary },
  };
  return {
    color: schemeColors('nivo'),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT_SANS, color: c.chartText, fontSize: 12 },
    title: { textStyle: { color: c.text } },
    legend: { textStyle: { color: c.chartText }, pageTextStyle: { color: c.chartText }, inactiveColor: c.textDisabled },
    tooltip: {
      backgroundColor: c.surfaceRaised,
      borderColor: c.border,
      textStyle: { color: c.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.18); border-radius: 8px;',
    },
    categoryAxis: axis,
    valueAxis: axis,
    logAxis: axis,
    timeAxis: axis,
    radar: {
      axisName: { color: c.chartText },
      splitLine: { lineStyle: { color: c.chartGrid } },
      axisLine: { lineStyle: { color: c.chartGrid } },
      splitArea: { show: false },
    },
    visualMap: { textStyle: { color: c.chartText } },
  };
};

echarts.registerTheme(echartsThemeName('light'), themeFor('light'));
echarts.registerTheme(echartsThemeName('dark'), themeFor('dark'));

import React from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { utcFormat } from 'd3-time-format';
import { format as d3Format } from 'd3-format';
import { NoDrawableDataErrorMessage } from '../../component/editor/CodeViewerComponent';
import { evaluateRulesOnDict, useStyleRules } from '../../extensions/styling/StyleRuleEvaluator';
import { ChartProps } from '../Chart';
import { recordToNative } from '../ChartUtils';
import { extensionEnabled } from '../../utils/ReportUtils';
import { EChart } from '../echarts/EChart';
import { schemeColors, useChartMode } from '../echarts/theme';
import { chartGrid, compactNumber, escapeHtml, toNumber, tooltipRow } from '../echarts/helpers';
import { palettes } from '../../theme/palette';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent]);

const POSSIBLE_TIME_FORMATS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];
const UNIT_MS = {
  years: 365.25 * 864e5,
  months: 30.44 * 864e5,
  weeks: 7 * 864e5,
  days: 864e5,
  hours: 36e5,
  minutes: 6e4,
  seconds: 1e3,
  milliseconds: 1,
};

const isDate = (x) => x && x.__isDate__;
const isDateTime = (x) => x && x.__isDateTime__;

/** Milliseconds (UTC) for a Neo4j Date / DateTime or a JS Date; undefined for anything else. */
const toTime = (x): number | undefined => {
  if (isDate(x)) {
    return Date.UTC(toNumber(x.year), toNumber(x.month) - 1, toNumber(x.day));
  }
  if (isDateTime(x)) {
    return new Date(x.toString()).getTime();
  }
  if (x instanceof Date) {
    return x.getTime();
  }
  return undefined;
};

/** nivo curve names -> ECharts line smoothing / steps. */
const curveStyle = (curve: string) => {
  if (curve === 'step' || curve === 'stepAfter' || curve === 'stepBefore') {
    return { step: { step: 'middle', stepAfter: 'end', stepBefore: 'start' }[curve] };
  }
  if (curve === 'linear') {
    return { smooth: false };
  }
  return { smooth: true, smoothMonotone: curve.startsWith('monotone') ? 'x' : undefined };
};

/**
 * Line chart: one line per selected value field over the x field (numbers, or Neo4j dates/datetimes
 * for a time axis). Settings keep their nivo-era names, defaults and d3 formats.
 */
const NeoLineChart = (props: ChartProps) => {
  const { records, selection } = props;
  const settings = props.settings ? props.settings : {};
  const styleRules = useStyleRules(
    extensionEnabled(props.extensions, 'styling'),
    settings.styleRules,
    props.getGlobalParameter
  );
  const mode = useChartMode();
  const colors = palettes[mode];

  if (records == null || records.length == 0 || records[0].keys == null) {
    return <>No data, re-run the report.</>;
  }
  if (!selection || !selection.value || selection.value.length == 0) {
    return <div style={{ margin: '15px' }}>No y-axis selected. To view the report, select a value below. </div>;
  }

  const colorScheme = settings.colors;
  const xScale = settings.xScale ? settings.xScale : 'linear';
  const yScale = settings.yScale ? settings.yScale : 'linear';
  const xScaleLogBase = settings.xScaleLogBase ? settings.xScaleLogBase : 10;
  const yScaleLogBase = settings.yScaleLogBase ? settings.yScaleLogBase : 10;
  const minXValue = settings.minXValue ? settings.minXValue : 'auto';
  const maxXValue = settings.maxXValue ? settings.maxXValue : 'auto';
  const minYValue = settings.minYValue ? settings.minYValue : 'auto';
  const maxYValue = settings.maxYValue ? settings.maxYValue : 'auto';
  const legend = settings.legend != undefined ? settings.legend : false;
  const legendWidth = settings.legendWidth ? settings.legendWidth : 100;
  const curve = settings.curve ? settings.curve : 'linear';
  const marginRight = settings.marginRight ? settings.marginRight : 24;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 36;
  const marginTop = settings.marginTop ? settings.marginTop : 24;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 40;
  const scatter = settings.type == 'scatter';
  const lineWidth = scatter ? 0 : settings.lineWidth || 2;
  // Unset, lines show their points only under the pointer (a dot on every point is noise); a set
  // size, and scatter plots, show them all.
  const pointSize = settings.pointSize ? settings.pointSize : scatter ? 8 : 0;
  const showGrid = settings.showGrid != undefined ? settings.showGrid : true;
  const xTickValues = settings.xTickValues != undefined ? settings.xTickValues : undefined;
  const xTickTimeValues = settings.xTickTimeValues != undefined ? settings.xTickTimeValues : 'every 1 years';
  const xAxisTimeFormat = settings.xAxisTimeFormat != undefined ? settings.xAxisTimeFormat : '%Y-%m-%dT%H:%M:%SZ';
  const xAxisFormat = settings.xAxisFormat != undefined ? settings.xAxisFormat : undefined;
  const xTickRotationAngle = settings.xTickRotationAngle != undefined ? settings.xTickRotationAngle : 0;
  const yTickRotationAngle = settings.yTickRotationAngle != undefined ? settings.yTickRotationAngle : 0;

  // One series per value field. Missing y values count as 0 (as before); non-numeric rows are skipped.
  const series = selection.value.map((key) => ({ id: `${key}`, data: [] as { x: any; y: number }[] }));
  records.forEach((row) => {
    selection.value.forEach((key, i) => {
      const x = row.get(selection.x) || 0;
      const y = recordToNative(row.get(key)) || 0;
      if (!isNaN(y)) {
        series[i].data.push({ x, y });
      }
    });
  });
  if (series.some((s) => s.data.length == 0)) {
    return <NoDrawableDataErrorMessage />;
  }

  const isTimeChart = toTime(series[0].data[0]?.x) !== undefined;
  if (isTimeChart) {
    const spec = xTickTimeValues.split(' ');
    if (
      spec.length != 3 ||
      spec[0] != 'every' ||
      !Number.isInteger(parseFloat(spec[1])) ||
      parseFloat(spec[1]) <= 0 ||
      !POSSIBLE_TIME_FORMATS.includes(spec[2])
    ) {
      return (
        <code style={{ margin: '10px' }}>
          Invalid tick size specification for time chart. Parameter value must be set to "every [number] ['years',
          'months', 'weeks', 'days', 'hours', 'seconds', 'milliseconds']".
        </code>
      );
    }
  }

  // Colours: the scheme by series, or, when style rules exist, the first rule matching any point.
  const scheme = schemeColors(colorScheme, mode);
  const lineColor = (s, i) => {
    if (styleRules.length < 1) {
      return scheme[i % scheme.length];
    }
    for (const entry of s.data) {
      const validRuleIndex = evaluateRulesOnDict({ [selection.x]: entry.x, [s.id]: entry.y }, styleRules, [
        'line color',
      ]);
      if (validRuleIndex !== -1) {
        return styleRules[validRuleIndex].customizationValue;
      }
    }
    return colors.text;
  };

  const timeFormatter = isTimeChart ? utcFormat(xAxisTimeFormat) : undefined;
  const numberFormatter = !isTimeChart && xAxisFormat ? d3Format(xAxisFormat) : undefined;
  const formatX = (x) => {
    if (timeFormatter) {
      return timeFormatter(new Date(x));
    }
    return numberFormatter ? numberFormatter(x) : x;
  };
  const xValue = (x) => {
    if (isTimeChart) {
      return toTime(x);
    }
    return xScale === 'point' ? `${recordToNative(x)}` : toNumber(x);
  };
  const tickInterval = isTimeChart
    ? parseFloat(xTickTimeValues.split(' ')[1]) * UNIT_MS[xTickTimeValues.split(' ')[2]]
    : undefined;
  const bound = (v) => (v === 'auto' ? undefined : v);

  const lineSeries = series.map((s, i) => {
    const color = lineColor(s, i);
    return {
      type: 'line',
      name: s.id,
      ...curveStyle(curve),
      showSymbol: pointSize > 0,
      symbol: 'circle',
      symbolSize: Math.max(pointSize, 8),
      // Points are filled with the line's colour, with a ring in the card's colour so they stand out
      // where lines cross.
      itemStyle: { color, borderColor: colors.surface, borderWidth: 2 },
      lineStyle: { color, width: lineWidth, opacity: lineWidth > 0 ? 1 : 0, cap: 'round', join: 'round' },
      // A single line gets a faint wash of its colour down to the axis.
      areaStyle: series.length === 1 && lineWidth > 0 ? { color, opacity: 0.08 } : undefined,
      // No fading of the other lines on hover: the tooltip compares all of them at the pointer.
      emphasis: { focus: 'none', scale: 1.25 },
      data: s.data.map((p) => [xValue(p.x), p.y]),
      color,
    };
  });

  const option = {
    grid: chartGrid(
      settings,
      { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft },
      legend ? { top: 24 } : {}
    ),
    xAxis: isTimeChart
      ? {
          type: 'time',
          minInterval: tickInterval,
          maxInterval: tickInterval,
          splitLine: { show: false },
          axisLabel: { rotate: -xTickRotationAngle, formatter: (v) => formatX(v), hideOverlap: true },
        }
      : {
          type: xScale === 'log' ? 'log' : xScale === 'point' ? 'category' : 'value',
          logBase: xScaleLogBase,
          min: bound(minXValue),
          max: bound(maxXValue),
          splitNumber: xTickValues,
          boundaryGap: xScale === 'point' ? false : undefined,
          splitLine: { show: false },
          axisLine: { show: true },
          axisLabel: {
            rotate: -xTickRotationAngle,
            formatter: numberFormatter ? (v) => formatX(v) : xScale === 'point' ? undefined : compactNumber,
          },
        },
    yAxis: {
      type: yScale === 'log' ? 'log' : 'value',
      logBase: yScaleLogBase,
      min: bound(minYValue),
      max: bound(maxYValue),
      splitLine: { show: showGrid },
      axisLabel: { rotate: -yTickRotationAngle, formatter: compactNumber },
    },
    // Lines: a vertical guide follows the pointer and the tooltip lists every line at that point.
    // Scatter plots: the point under the pointer.
    tooltip: scatter
      ? {
          trigger: 'item',
          formatter: (p) =>
            `${escapeHtml(formatX(p.value[0]))}<br/>${tooltipRow(lineSeries[p.seriesIndex].color, p.seriesName, p.value[1])}`,
        }
      : {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          formatter: (items) =>
            `${escapeHtml(formatX(items[0]?.value[0]))}<br/>${items
              .map((p) => tooltipRow(lineSeries[p.seriesIndex].color, p.seriesName, p.value[1]))
              .join('<br/>')}`,
        },
    legend: legend
      ? {
          show: true,
          type: 'scroll',
          top: 0,
          right: 10,
          // Long series names are cut off at the "Legend Label Width".
          textStyle: { width: legendWidth, overflow: 'truncate' },
          // The legend shows the line colours (the points themselves are hollow).
          data: lineSeries.map((s) => ({ name: s.name, itemStyle: { color: s.color } })),
        }
      : { show: false },
    series: lineSeries,
  };

  return <EChart option={option} />;
};

export default NeoLineChart;

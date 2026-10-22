import React from 'react';
import { useSelector } from 'react-redux';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { LegendComponent, RadarComponent, TooltipComponent } from 'echarts/components';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import { escapeHtml, toNumber, tooltipRow } from '../../../../chart/echarts/helpers';
import { schemeColors } from '../../../../chart/echarts/theme';
import { palettes } from '../../../../theme/palette';
import { getDashboardTheme } from '../../../../dashboard/DashboardSelectors';

/** The "Motion Configuration" presets (named after the earlier chart library's springs), as animations. */
const MOTION = {
  default: { duration: 1000, easing: 'cubicOut' },
  gentle: { duration: 700, easing: 'cubicOut' },
  wobbly: { duration: 1000, easing: 'elasticOut' },
  stiff: { duration: 300, easing: 'cubicOut' },
  slow: { duration: 1500, easing: 'cubicInOut' },
  molasses: { duration: 2500, easing: 'cubicInOut' },
};

echarts.use([RadarChart, RadarComponent, LegendComponent, TooltipComponent]);

/**
 * Radar chart: each record is a spoke (the index field), each selected value field a shape.
 * Settings keep their nivo-era names and defaults.
 */
const NeoRadarChart = (props: ChartProps) => {
  const mode = useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light';
  if (
    !props.selection ||
    props.selection.values == undefined ||
    props.records == null ||
    props.records.length == 0 ||
    props.records[0].keys == null
  ) {
    return <NoDrawableDataErrorMessage />;
  }
  const { records } = props;
  const selection = props.selection ? props.selection : {};
  const settings = props.settings ? props.settings : {};
  const legendHeight = 20;
  const marginTop = settings.marginTop ? settings.marginTop : 40;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 40;
  const dotSize = settings.dotSize ? settings.dotSize : 10;
  const dotBorderWidth = settings.dotBorderWidth ? settings.dotBorderWidth : 2;
  const gridLabelOffset = settings.gridLabelOffset ? settings.gridLabelOffset : 16;
  const gridLevels = settings.gridLevels ? settings.gridLevels : 5;
  const interactive = settings.interactive !== undefined ? settings.interactive : true;
  const animate = settings.animate !== undefined ? settings.animate : true;
  const motion = MOTION[settings.motionConfig] ?? MOTION.gentle;
  const legend = settings.legend !== undefined ? settings.legend : false;
  const colorScheme = settings.colors ? settings.colors : 'set2';
  const keys: string[] = selection.values;

  let valid = true;
  const rows = records.map((r) => {
    const values = keys.map((k) => {
      const value = toNumber(r._fields[r._fieldLookup[k]]);
      if (isNaN(value)) {
        valid = false;
      }
      return value;
    });
    return { index: `${r._fields[r._fieldLookup[selection.index]]}`, values };
  });
  if (!valid) {
    return <NoDrawableDataErrorMessage />;
  }

  const scheme = schemeColors(colorScheme);
  const max = Math.max(0, ...rows.flatMap((row) => row.values));
  const surface = palettes[mode].surface;

  const option = {
    animation: animate,
    animationDuration: motion.duration,
    animationDurationUpdate: motion.duration,
    animationEasing: motion.easing,
    animationEasingUpdate: motion.easing,
    tooltip: interactive
      ? {
          trigger: 'item',
          formatter: (p) =>
            `${escapeHtml(p.name)}<br/>${rows
              .map((row, i) => tooltipRow(p.color, row.index, Number(p.value[i]).toFixed(2)))
              .join('<br/>')}`,
        }
      : { show: false },
    legend: legend
      ? { show: true, orient: 'vertical', left: 0, top: 0, icon: 'circle', itemWidth: 12, itemHeight: 12 }
      : { show: false },
    radar: {
      center: ['50%', `${50 + (marginTop + (legend ? legendHeight : 0) - marginBottom) / 2 / 3}%`],
      radius: '68%',
      shape: 'circle',
      splitNumber: gridLevels,
      axisNameGap: gridLabelOffset,
      indicator: rows.map((row) => ({ name: row.index, max: max || 1 })),
    },
    series: keys.map((key, k) => {
      const color = scheme[k % scheme.length];
      return {
        type: 'radar',
        name: key,
        silent: !interactive,
        symbol: 'circle',
        symbolSize: dotSize,
        itemStyle: { color: surface, borderColor: color, borderWidth: dotBorderWidth },
        lineStyle: { color, width: 2 },
        areaStyle: { color, opacity: 0.25 },
        emphasis: { areaStyle: { opacity: 0.4 } },
        data: [{ name: key, value: rows.map((row) => row.values[k]) }],
      };
    }),
  };
  // Legend icons in the series colours (the dots themselves use the background colour).
  if (legend) {
    (option.legend as any).data = keys.map((key, k) => ({
      name: key,
      itemStyle: { color: scheme[k % scheme.length] },
    }));
  }

  return <EChart option={option} />;
};

export default NeoRadarChart;

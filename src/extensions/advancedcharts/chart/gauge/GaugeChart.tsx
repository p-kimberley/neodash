import React from 'react';
import { useSelector } from 'react-redux';
import useDimensions from 'react-cool-dimensions';
import * as echarts from 'echarts/core';
import { GaugeChart, PieChart } from 'echarts/charts';
import { interpolateHsl } from 'd3-interpolate';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import { toNumber } from '../../../../chart/echarts/helpers';
import { palettes } from '../../../../theme/palette';
import { getDashboardTheme } from '../../../../dashboard/DashboardSelectors';

echarts.use([GaugeChart, PieChart]);

// The look of react-gauge-chart, which this replaces: a half ring 20% of the radius thick with
// rounded segments, a needle 55% of the radius long, and the value as a percentage in the middle.
const ARC_WIDTH = 0.2;
const CORNER_RADIUS = 6;
const NEEDLE_LENGTH = 0.55;
const NEEDLE_COLORS = { light: '#464A4F', dark: '#c9ced6' };

/** One colour per segment: the given colours if they match, else first-to-last interpolated (HSL). */
const segmentColors = (colors: string[], count: number) => {
  if (colors.length === count) {
    return colors;
  }
  const between = interpolateHsl(colors[0], colors[colors.length - 1]);
  return Array.from({ length: count }, (_, i) => between(count > 1 ? i / (count - 1) : 0));
};

/** "92%" or "92.5%": the value as a percentage, to at most two decimals. */
const formatPercent = (fraction: number) => `${Math.round(fraction * 100 * 100) / 100}%`;

/**
 * Gauge: the first value of the first record, as a percentage (0-100), on a half ring of coloured
 * segments. Settings keep their names and defaults from the react-gauge-chart version.
 */
const NeoGaugeChart = (props: ChartProps) => {
  const { records, selection } = props;
  const mode = useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light';
  const { observe, width, height } = useDimensions<HTMLDivElement>();
  const settings = props.settings ? props.settings : {};

  if (!selection || records == null || records.length == 0 || records[0].keys == null) {
    return <NoDrawableDataErrorMessage />;
  }

  const nrOfLevels = settings.nrOfLevels ? settings.nrOfLevels : 3;
  const arcsLength = settings.arcsLength ? settings.arcsLength : '0.15, 0.55, 0.3';
  const arcPadding = settings.arcPadding ? Number(settings.arcPadding) : 0.02;
  const colors = settings.colors ? settings.colors : '#5BE12C, #F5CD19, #EA4228';
  // Unset, the text follows the appearance (the old default, black, disappeared in dark mode).
  const textColor = settings.textColor ? settings.textColor : palettes[mode].chartText;
  const animDelay = settings.animDelay ? settings.animDelay : 0;
  const animateDuration = settings.animateDuration ? settings.animateDuration : 2000;
  const marginRight = settings.marginRight ? settings.marginRight : 24;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 24;
  const marginTop = settings.marginTop ? settings.marginTop : 40;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 40;

  let lengths = `${arcsLength}`.split(',').map((e) => parseFloat(e.trim()));
  if (lengths.some((e) => isNaN(e)) || lengths.length != nrOfLevels) {
    lengths = Array(nrOfLevels).fill(1);
  }

  const raw = records[0] && records[0]._fields ? records[0]._fields[0] : undefined;
  let score = raw === null || raw === undefined || raw === '' ? NaN : toNumber(raw);
  if (isNaN(score)) {
    return <NoDrawableDataErrorMessage />;
  }
  if (score >= 0) {
    score /= 100;
  }

  // The half ring fills the space inside the margins, centred, as wide as it can be.
  const innerWidth = Math.max(0, (width || 0) - marginLeft - marginRight);
  const innerHeight = Math.max(0, (height || 0) - marginTop - marginBottom);
  const radius = Math.max(0, Math.min(innerWidth / 2, innerHeight));
  const center = [marginLeft + innerWidth / 2, marginTop + (innerHeight - radius) / 2 + radius];
  const needleWidth = Math.max(4, 15 * (innerWidth / 500));
  const fills = segmentColors(
    `${colors}`.split(',').map((c) => c.trim()),
    lengths.length
  );

  const option = {
    series: [
      {
        type: 'pie',
        silent: true,
        animation: false,
        center,
        radius: [radius * (1 - ARC_WIDTH), radius],
        startAngle: 180,
        endAngle: 0,
        padAngle: (arcPadding * 180) / Math.PI,
        label: { show: false },
        itemStyle: { borderRadius: CORNER_RADIUS },
        data: lengths.map((value, i) => ({ value, itemStyle: { color: fills[i] } })),
      },
      {
        type: 'gauge',
        silent: true,
        center,
        radius,
        min: 0,
        max: 1,
        startAngle: 180,
        endAngle: 0,
        animationDuration: animateDuration,
        animationDelay: animDelay,
        animationEasing: 'elasticOut',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        // A triangle from a round base at the centre, as before.
        pointer: {
          icon: 'triangle',
          length: `${NEEDLE_LENGTH * 100}%`,
          width: needleWidth * 2,
          offsetCenter: [0, 0],
          itemStyle: { color: NEEDLE_COLORS[mode] },
        },
        anchor: { show: true, showAbove: true, size: needleWidth * 2, itemStyle: { color: NEEDLE_COLORS[mode] } },
        title: { show: false },
        detail: {
          offsetCenter: [0, -(radius / 2 - 20)],
          formatter: () => formatPercent(score),
          color: textColor,
          fontSize: Math.max(12, innerWidth / 11),
          fontWeight: 'normal',
        },
        data: [{ value: score }],
      },
    ],
  };

  return (
    <div ref={observe} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {radius > 0 ? <EChart option={option} /> : <></>}
    </div>
  );
};

export default NeoGaugeChart;

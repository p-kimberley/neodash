import React from 'react';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { NoDrawableDataErrorMessage } from '../../component/editor/CodeViewerComponent';
import { getD3ColorsByScheme } from '../../config/ColorConfig';
import { evaluateRulesOnDict, useStyleRules } from '../../extensions/styling/StyleRuleEvaluator';
import { ChartProps } from '../Chart';
import { convertRecordObjectToString, recordToNative } from '../ChartUtils';
import { extensionEnabled } from '../../utils/ReportUtils';
import { EChart } from '../echarts/EChart';
import { darker, labelOnColor, tooltipRow } from '../echarts/helpers';
import { palettes } from '../../theme/palette';
import { useSelector } from 'react-redux';
import { getDashboardTheme } from '../../dashboard/DashboardSelectors';

echarts.use([PieChart, LegendComponent, TooltipComponent]);

/**
 * One slice per record: the category (index field) and its value. Records with a non-numeric value
 * are skipped. (Repeated categories are separate slices, as they always were.)
 */
const buildSlices = (records, selection) => {
  const slices: { id: string; value: any }[] = [];
  records.forEach((row) => {
    try {
      if (!selection || !selection.index || !selection.value) {
        return;
      }
      const index = convertRecordObjectToString(row.get(selection.index));
      const value = recordToNative(row.get(selection.value));
      if (isNaN(value)) {
        return;
      }
      slices.push({ id: index, value: value });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
  return slices;
};

/**
 * Pie / donut chart. Settings keep their nivo-era names and defaults, so saved reports look the same.
 */
const NeoPieChart = (props: ChartProps) => {
  const { records, selection } = props;
  const settings = props.settings ? props.settings : {};
  const styleRules = useStyleRules(
    extensionEnabled(props.extensions, 'styling'),
    settings.styleRules,
    props.getGlobalParameter
  );
  const mode = useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light';

  if (!selection || records == null || records.length == 0 || records[0].keys == null) {
    return <NoDrawableDataErrorMessage />;
  }

  const legendHeight = 20;
  const marginRight = settings.marginRight ? settings.marginRight : 50;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 50;
  const marginTop = settings.marginTop ? settings.marginTop : 50;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 50;
  const sortByValue = settings.sortByValue ? settings.sortByValue : false;
  const enableArcLabels = settings.enableArcLabels !== undefined ? settings.enableArcLabels : true;
  const enableArcLinkLabels = settings.enableArcLinkLabels !== undefined ? settings.enableArcLinkLabels : true;
  const innerRadius = settings.innerRadius ? settings.innerRadius : 0;
  const padAngle = settings.padAngle ? settings.padAngle : 0;
  const borderWidth = settings.borderWidth ? settings.borderWidth : 0;
  const activeOuterRadiusOffset = settings.activeOuterRadiusOffset ? settings.activeOuterRadiusOffset : 8;
  const arcLinkLabelsOffset = settings.arcLinkLabelsOffset ? settings.arcLinkLabelsOffset : 15;
  const arcLinkLabelsSkipAngle = settings.arcLinkLabelsSkipAngle ? settings.arcLinkLabelsSkipAngle : 1;
  const cornerRadius = settings.cornerRadius ? settings.cornerRadius : 1;
  const arcLabelsSkipAngle = settings.arcLabelsSkipAngle ? settings.arcLabelsSkipAngle : 10;
  const arcLabelsFontSize = settings.arcLabelsFontSize ? settings.arcLabelsFontSize : 13;
  const legend = settings.legend ? settings.legend : false;
  const colorScheme = settings.colors ? settings.colors : 'set2';
  const chartColorsByScheme = getD3ColorsByScheme(colorScheme);

  let slices = buildSlices(records, selection);
  if (slices.length == 0) {
    return <NoDrawableDataErrorMessage />;
  }
  // Colours follow the record order (as before); sorting only changes where slices are drawn.
  const colored = slices.map((slice, index) => {
    let color = chartColorsByScheme[index % chartColorsByScheme.length];
    const dict = { [selection.value]: slice.value, [selection.index]: slice.id };
    const validRuleIndex = evaluateRulesOnDict(dict, styleRules, ['slice color']);
    if (validRuleIndex !== -1) {
      color = styleRules[validRuleIndex].customizationValue;
    }
    return { ...slice, color };
  });
  if (sortByValue) {
    colored.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  }
  const total = colored.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0) || 1;
  const angleOf = (value) => ((Number(value) || 0) * 360) / total;

  // The pie's box: the report's margins (plus room for the legend).
  const box = {
    left: marginLeft,
    right: marginRight,
    top: marginTop,
    bottom: legend ? legendHeight + marginBottom : marginBottom,
  };
  const radius = [`${Math.round(innerRadius * 100)}%`, '100%'];
  const base = {
    type: 'pie',
    ...box,
    radius,
    padAngle,
    startAngle: 90,
    clockwise: true,
    avoidLabelOverlap: false,
  };

  const option = {
    animation: true,
    tooltip: {
      trigger: 'item',
      formatter: (p) => tooltipRow(p.color, p.name, p.value),
    },
    legend: legend
      ? { show: true, orient: 'horizontal', bottom: 4, icon: 'circle', itemWidth: 14, itemHeight: 14 }
      : { show: false },
    series: [
      // The slices, with percentage labels inside.
      {
        ...base,
        name: 'slices',
        itemStyle: { borderRadius: cornerRadius, borderWidth },
        emphasis: { scale: true, scaleSize: activeOuterRadiusOffset },
        label: { show: false },
        labelLine: { show: false },
        data: colored.map((slice) => ({
          name: slice.id,
          value: slice.value,
          itemStyle: { color: slice.color, borderColor: darker(slice.color, 0.2) },
          label: {
            show: enableArcLabels && angleOf(slice.value) >= arcLabelsSkipAngle,
            position: 'inside',
            color: labelOnColor(slice.color),
            fontSize: arcLabelsFontSize,
            formatter: () => `${((angleOf(slice.value) * 100) / 360).toFixed(2)}%`,
          },
        })),
      },
      // An invisible copy carrying the outside "link" labels (category names), as nivo drew both.
      ...(enableArcLinkLabels
        ? [
            {
              ...base,
              name: 'labels',
              silent: true,
              tooltip: { show: false },
              itemStyle: { color: 'transparent' },
              emphasis: { disabled: true },
              // Spread labels of small neighbouring slices apart, and keep them inside the card.
              avoidLabelOverlap: true,
              labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
              labelLine: { length: arcLinkLabelsOffset, length2: 16 },
              data: colored.map((slice) => ({
                name: slice.id,
                value: slice.value,
                label: {
                  show: angleOf(slice.value) >= arcLinkLabelsSkipAngle,
                  position: 'outside',
                  alignTo: 'labelLine',
                  bleedMargin: 4,
                  color: palettes[mode].chartText,
                  formatter: '{b}',
                },
                labelLine: { show: angleOf(slice.value) >= arcLinkLabelsSkipAngle, lineStyle: { color: slice.color } },
              })),
            },
          ]
        : []),
    ],
  };

  return <EChart option={option} />;
};

export default NeoPieChart;

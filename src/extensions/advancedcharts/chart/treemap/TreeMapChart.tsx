import React from 'react';
import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import chroma from 'chroma-js';
import { compactNumber, darker, labelOnColor, tooltipRow, withoutInteraction } from '../../../../chart/echarts/helpers';
import { schemeColors, useChartMode } from '../../../../chart/echarts/theme';
import { palettes } from '../../../../theme/palette';
import { buildHierarchy, HierarchyNode, ordinalColors, totalOf, useDrillDown } from '../hierarchy/Hierarchy';

echarts.use([TreemapChart, TooltipComponent]);

/**
 * Treemap of a hierarchy (path + value): one colour per top-level branch, parent names in a band at
 * the top of each group, and leaf tiles labelled with their value (as with nivo). Clicking a group
 * drills into it. Settings keep their nivo-era names and defaults.
 */
const NeoTreeMapChart = (props: ChartProps) => {
  const { records, selection } = props;
  const root = buildHierarchy(records, selection);
  const { current, drillInto, resetButton } = useDrillDown(root);
  const mode = useChartMode();

  if (records == null || records.length == 0 || records[0].keys == null) {
    return <>No data, re-run the report.</>;
  }
  if (!selection || !current || !current.children || current.children.length == 0) {
    return <NoDrawableDataErrorMessage />;
  }

  const settings = props.settings ? props.settings : {};
  const legendHeight = 20;
  const marginRight = settings.marginRight ? settings.marginRight : 24;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 24;
  const marginTop = settings.marginTop ? settings.marginTop : 24;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 40;
  const borderWidth = settings.borderWidth ? settings.borderWidth : 0;
  const legend = settings.legend ? settings.legend : false;
  const colorScheme = settings.colors;
  const interactive = settings.interactive !== undefined ? settings.interactive : true;
  const colorOf = ordinalColors(schemeColors(colorScheme, mode));
  const surface = palettes[mode].surface;
  // Unset border width: tiles are parted by a 2px gap in the card's colour; a set width draws darker
  // edges, as before.
  const gap = borderWidth || 2;

  // Parent groups show their name in a band of the branch colour; the tiles inside are a step lighter
  // (light mode) or darker (dark mode), so the band reads as a heading.
  const toData = (node: HierarchyNode, branchColor: string, depth = 0) => {
    const isParent = Boolean(node.children && node.children.length);
    const color = depth > 1 ? chroma.mix(branchColor, surface, 0.18, 'rgb').hex() : branchColor;
    return {
      name: node.name,
      value: totalOf(node),
      itemStyle: borderWidth
        ? { color, borderColor: darker(branchColor, 0.4), borderWidth, gapWidth: borderWidth }
        : // ECharts paints a group's heading band in its border colour.
          { color, borderColor: color, borderWidth: 0, gapWidth: gap },
      upperLabel: { show: isParent, color: labelOnColor(color), formatter: '{b}', height: 20, fontWeight: 600 },
      label: { color: labelOnColor(color) },
      children: isParent ? node.children.map((child) => toData(child, branchColor, depth + 1)) : undefined,
    };
  };

  const option = {
    tooltip: { trigger: 'item', formatter: (p) => tooltipRow(p.color, p.name, p.value) },
    series: [
      {
        type: 'treemap',
        left: marginLeft,
        right: marginRight,
        top: marginTop,
        bottom: legend ? legendHeight + marginBottom : marginBottom,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        // Leaf tiles show their value; tiles too small for it stay blank.
        label: { show: true, formatter: (p) => compactNumber(Number(p.value)), fontSize: 11 },
        // Only parents (set per node above) get a band; not the hidden root.
        upperLabel: { show: false },
        levels: [{ itemStyle: { gapWidth: gap, borderWidth: 0 } }],
        data: current.children.map((child) => toData(child, colorOf(child.name), 1)),
      },
    ],
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      {resetButton}
      <EChart
        option={interactive ? option : withoutInteraction(option)}
        onClick={interactive ? (p) => drillInto(p.name) : undefined}
      />
    </div>
  );
};

export default NeoTreeMapChart;

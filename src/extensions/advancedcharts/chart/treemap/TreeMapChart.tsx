import React from 'react';
import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import { darker, labelOnColor, tooltipRow, withoutInteraction } from '../../../../chart/echarts/helpers';
import { schemeColors } from '../../../../chart/echarts/theme';
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
  const colorScheme = settings.colors ? settings.colors : 'nivo';
  const interactive = settings.interactive !== undefined ? settings.interactive : true;
  const colorOf = ordinalColors(schemeColors(colorScheme));

  const toData = (node: HierarchyNode, branchColor: string) => {
    const isParent = Boolean(node.children && node.children.length);
    return {
      name: node.name,
      value: totalOf(node),
      itemStyle: { color: branchColor, borderColor: darker(branchColor, 0.4), borderWidth, gapWidth: borderWidth },
      // Parent groups show their name in a band at the top.
      upperLabel: { show: isParent, color: labelOnColor(branchColor), formatter: '{b}', height: 20, fontWeight: 600 },
      label: { color: labelOnColor(branchColor) },
      children: isParent ? node.children.map((child) => toData(child, branchColor)) : undefined,
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
        label: { show: true, formatter: (p) => Number(p.value).toLocaleString(), fontSize: 12 },
        // Only parents (set per node above) get a band; not the hidden root.
        upperLabel: { show: false },
        levels: [{ itemStyle: { gapWidth: borderWidth } }],
        data: current.children.map((child) => toData(child, colorOf(child.name))),
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

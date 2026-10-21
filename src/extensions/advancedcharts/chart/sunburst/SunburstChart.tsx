import React from 'react';
import * as echarts from 'echarts/core';
import { SunburstChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import { brighter, labelOnColor, tooltipRow } from '../../../../chart/echarts/helpers';
import { schemeColors } from '../../../../chart/echarts/theme';
import { buildHierarchy, HierarchyNode, ordinalColors, totalOf, useDrillDown } from '../hierarchy/Hierarchy';

echarts.use([SunburstChart, TooltipComponent]);

/**
 * Sunburst of a hierarchy (path + value). Rings are coloured by node (the colour scheme, in order of
 * appearance); with "inherit colour from parent", children take a lighter shade of their parent's.
 * Clicking a node with children drills into it. Settings keep their nivo-era names and defaults.
 */
const NeoSunburstChart = (props: ChartProps) => {
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
  const enableArcLabels = settings.enableArcLabels !== undefined ? settings.enableArcLabels : true;
  const borderWidth = settings.borderWidth ? settings.borderWidth : 0;
  const arcLabelsSkipAngle = settings.arcLabelsSkipAngle ? settings.arcLabelsSkipAngle : 10;
  const cornerRadius = settings.cornerRadius ? settings.cornerRadius : 3;
  const colorScheme = settings.colors ? settings.colors : 'nivo';
  const inheritColorFromParent = settings.inheritColorFromParent !== undefined ? settings.inheritColorFromParent : true;
  const colorOf = ordinalColors(schemeColors(colorScheme));

  const toData = (node: HierarchyNode, parentColor?: string) => {
    const color = inheritColorFromParent && parentColor ? brighter(parentColor, 0.4) : colorOf(node.name);
    return {
      name: node.name,
      value: totalOf(node),
      itemStyle: { color, borderRadius: cornerRadius, borderWidth },
      label: { color: labelOnColor(color) },
      children: (node.children || []).map((child) => toData(child, color)),
    };
  };

  const option = {
    tooltip: { trigger: 'item', formatter: (p) => tooltipRow(p.color, p.name, p.value) },
    series: [
      {
        type: 'sunburst',
        radius: ['0%', '92%'],
        sort: undefined,
        nodeClick: false,
        // nivo labelled arcs with their value.
        label: {
          show: enableArcLabels,
          rotate: 0,
          minAngle: arcLabelsSkipAngle,
          formatter: (p) => `${p.value}`,
        },
        emphasis: { focus: 'ancestor' },
        data: current.children.map((child) => toData(child)),
      },
    ],
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      {resetButton}
      <EChart option={option} onClick={(p) => drillInto(p.name)} />
    </div>
  );
};

export default NeoSunburstChart;

import React from 'react';
import * as echarts from 'echarts/core';
import { SunburstChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import chroma from 'chroma-js';
import { compactNumber, labelOnColor, tooltipRow, withoutInteraction } from '../../../../chart/echarts/helpers';
import { schemeColors, useChartMode } from '../../../../chart/echarts/theme';
import { palettes } from '../../../../theme/palette';
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
  const mode = useChartMode();

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
  const colorScheme = settings.colors;
  const interactive = settings.interactive !== undefined ? settings.interactive : true;
  const inheritColorFromParent = settings.inheritColorFromParent !== undefined ? settings.inheritColorFromParent : true;
  const colorOf = ordinalColors(schemeColors(colorScheme, mode));
  const surface = palettes[mode].surface;

  // Inherited colours fade a step towards the card's colour per ring, so outer rings recede (lighter
  // in light mode, darker in dark mode) instead of turning neon.
  const toData = (node: HierarchyNode, parentColor?: string) => {
    const color =
      inheritColorFromParent && parentColor ? chroma.mix(parentColor, surface, 0.22, 'rgb').hex() : colorOf(node.name);
    return {
      name: node.name,
      value: totalOf(node),
      // Unset border width: arcs are parted by a 2px gap in the card's colour.
      itemStyle: { color, borderRadius: cornerRadius, borderWidth: borderWidth || 2, borderColor: surface },
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
          formatter: (p) => compactNumber(p.value),
          fontSize: 11,
        },
        emphasis: { focus: 'ancestor' },
        data: current.children.map((child) => toData(child)),
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

export default NeoSunburstChart;

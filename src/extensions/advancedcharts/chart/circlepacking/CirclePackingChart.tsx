import React from 'react';
import * as echarts from 'echarts/core';
import { CustomChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { hierarchy, pack } from 'd3-hierarchy';
import { ChartProps } from '../../../../chart/Chart';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { EChart } from '../../../../chart/echarts/EChart';
import { darker, labelOnColor, tooltipRow } from '../../../../chart/echarts/helpers';
import { schemeColors } from '../../../../chart/echarts/theme';
import { buildHierarchy, HierarchyNode, totalOf, useDrillDown } from '../hierarchy/Hierarchy';

echarts.use([CustomChart, TooltipComponent]);

/**
 * Circle packing of a hierarchy (path + value), laid out with d3's pack (as nivo did) and drawn as an
 * ECharts custom series. Circles are coloured by depth; leaves are labelled with their name. Clicking
 * a circle with children drills into it. Settings keep their nivo-era names and defaults.
 */
const NeoCirclePackingChart = (props: ChartProps) => {
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
  const showLabels = settings.showLabels !== undefined ? settings.showLabels : true;
  const colorScheme = settings.colors ? settings.colors : 'nivo';
  const scheme = schemeColors(colorScheme);
  const bottom = legend ? legendHeight + marginBottom : marginBottom;

  // Nodes in a fixed order; the pack layout is computed for the chart's size when it renders.
  const tree = hierarchy<HierarchyNode>(current).sum((d) => Number(d.loc) || 0);
  const nodes = tree.descendants();
  let layoutSize = '';
  const layout = (width: number, height: number) => {
    const key = `${width}x${height}`;
    if (key !== layoutSize) {
      pack<HierarchyNode>().size([width, height]).padding(4)(tree);
      layoutSize = key;
    }
  };

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (p) => tooltipRow(p.color, nodes[p.dataIndex].data.name, totalOf(nodes[p.dataIndex].data)),
    },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'none',
        data: nodes.map((node, i) => ({ value: i, name: node.data.name })),
        renderItem: (params, api) => {
          const width = api.getWidth() - marginLeft - marginRight;
          const height = api.getHeight() - marginTop - bottom;
          layout(Math.max(1, width), Math.max(1, height));
          const node = nodes[params.dataIndex] as any;
          const color = scheme[node.depth % scheme.length];
          const isLeaf = !node.children;
          return {
            type: 'circle',
            shape: { cx: node.x + marginLeft, cy: node.y + marginTop, r: node.r },
            style: { fill: color, stroke: darker(color, 0.4), lineWidth: borderWidth },
            emphasis: { style: { stroke: darker(color, 1), lineWidth: Math.max(2, borderWidth) } },
            textContent:
              showLabels && isLeaf && node.r > 12
                ? {
                    style: {
                      text: node.data.name,
                      fill: labelOnColor(color),
                      fontSize: 11,
                      width: node.r * 1.8,
                      overflow: 'truncate',
                    },
                  }
                : undefined,
            textConfig: { position: 'inside' },
          };
        },
      },
    ],
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      {resetButton}
      <EChart option={option} onClick={(p) => drillInto(nodes[p.dataIndex]?.data.name)} />
    </div>
  );
};

export default NeoCirclePackingChart;

import React, { useEffect, useState } from 'react';
import * as echarts from 'echarts/core';
import { SankeyChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { useSelector } from 'react-redux';
import { EChart } from '../../../../chart/echarts/EChart';
import { darker, escapeHtml, toNumber } from '../../../../chart/echarts/helpers';
import { schemeColors } from '../../../../chart/echarts/theme';
import { ordinalColors } from '../hierarchy/Hierarchy';
import { palettes } from '../../../../theme/palette';
import { getDashboardTheme } from '../../../../dashboard/DashboardSelectors';
import { ChartProps } from '../../../../chart/Chart';
import { valueIsArray, valueIsNode, valueIsPath, valueIsRelationship } from '../../../../chart/ChartUtils';
import { categoricalColorSchemes } from '../../../../config/ColorConfig';
import { evaluateRulesOnNode, useStyleRules } from '../../../styling/StyleRuleEvaluator';
import NeoCodeViewerComponent from '../../../../component/editor/CodeViewerComponent';
import { isCyclic } from '../../Utils';
import { extensionEnabled } from '../../../../utils/ReportUtils';

echarts.use([SankeyChart, LegendComponent, TooltipComponent]);

const UNWEIGHTED_SANKEY_PROPERTY = 'SANKEY_UNWEIGHTED';

/**
 * Embeds a SankeyChart (from Charts) into NeoDash.
 */
const NeoSankeyChart = (props: ChartProps) => {
  const settings = props.settings ? props.settings : {};
  const legendHeight = 20;
  const legendWidth = 120;
  const marginRight = settings.marginRight ? settings.marginRight : 24;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 24;
  const marginTop = settings.marginTop ? settings.marginTop : 24;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 40;

  const interactive = settings.interactive !== undefined ? settings.interactive : true;
  const nodeBorderWidth = settings.nodeBorderWidth ? settings.nodeBorderWidth : 0;

  const legend = settings.legend !== undefined ? settings.legend : false;
  const colorScheme = settings.colors ? settings.colors : 'set2';
  const labelProperty = settings.labelProperty ? settings.labelProperty : 'value';
  const layout = settings.layout ? settings.layout : 'horizontal';
  const labelPosition = settings.labelPosition ? settings.labelPosition : 'inside';
  const labelOrientation = settings.labelOrientation ? settings.labelOrientation : 'horizontal';
  const nodeThickness = settings.nodeThickness ? settings.nodeThickness : 12;
  const nodeSpacing = settings.nodeSpacing ? settings.nodeSpacing : 12;

  const styleRules = useStyleRules(
    extensionEnabled(props.extensions, 'styling'),
    props.settings.styleRules,
    props.getGlobalParameter
  );

  // TODO this line is duplicated in a lot of places, should be in an utils file
  const update = (state, mutations) => Object.assign({}, state, mutations);

  const [data, setData] = useState({ nodes: [], links: [] });
  const mode = useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    buildVisualizationDictionaryFromRecords(props.records);
  }, [props.records]);

  if (props.records == null || props.records.length == 0 || props.records[0].keys == null) {
    return <>No data, re-run the report.</>;
  }
  let nodes = {};
  let nodeLabels = {};
  let links = {};

  function extractGraphEntitiesFromField(value) {
    if (value == undefined) {
      return;
    }
    if (valueIsArray(value)) {
      value.forEach((v) => extractGraphEntitiesFromField(v));
    } else if (valueIsNode(value)) {
      value.labels.forEach((l) => (nodeLabels[l] = true));
      nodes[value.identity.low] = {
        id: value.identity.low,
        labels: value.labels,
        properties: value.properties,
        lastLabel: value.labels[value.labels.length - 1],
      };
    } else if (valueIsRelationship(value)) {
      if (links[`${value.start.low},${value.end.low}`] == undefined) {
        links[`${value.start.low},${value.end.low}`] = [];
      }
      const addItem = (arr, item) => arr.find((x) => x.id === item.id) || arr.push(item);
      if (labelProperty === UNWEIGHTED_SANKEY_PROPERTY) {
        addItem(links[`${value.start.low},${value.end.low}`], {
          id: value.identity.low,
          source: value.start.low,
          target: value.end.low,
          type: value.type,
          properties: value.properties,
          value: 1,
        });
      } else if (value.properties[labelProperty] !== undefined && !isNaN(value.properties[labelProperty])) {
        addItem(links[`${value.start.low},${value.end.low}`], {
          id: value.identity.low,
          source: value.start.low,
          target: value.end.low,
          type: value.type,
          properties: value.properties,
          value: value.properties[labelProperty],
        });
      }
    } else if (valueIsPath(value)) {
      value.segments.map((segment) => {
        extractGraphEntitiesFromField(segment.start);
        extractGraphEntitiesFromField(segment.relationship);
        extractGraphEntitiesFromField(segment.end);
      });
    }
  }

  function buildVisualizationDictionaryFromRecords(records) {
    // Extract graph objects from result set.
    records.forEach((record) => {
      record._fields.forEach((field) => {
        extractGraphEntitiesFromField(field);
      });
    });
    // Assign proper curvatures to relationships.
    // This is needed for pairs of nodes that have multiple relationships between them, or self-loops.
    const linksList = Object.values(links).map((nodePair) => {
      return nodePair;
    });

    // Assign proper colors to nodes.
    const totalColors = categoricalColorSchemes[colorScheme] ? categoricalColorSchemes[colorScheme].length : 0;
    const nodeLabelsList = Object.keys(nodeLabels);
    const nodesList = Object.values(nodes).map((node) => {
      // First try to assign a node a color if it has a property specifying the color.
      let assignedColor =
        totalColors > 0
          ? categoricalColorSchemes[colorScheme][nodeLabelsList.indexOf(node.lastLabel) % totalColors]
          : 'grey';
      // Next, evaluate the custom styling rules to see if there's a rule-based override
      assignedColor = evaluateRulesOnNode(node, 'node color', assignedColor, styleRules);
      return update(node, { nodeColor: assignedColor ? assignedColor : 'grey' });
    });

    // Set the data dictionary that is read by the visualization.
    setData({
      nodes: nodesList,
      links: linksList.flat(),
    });
  }

  // Compute slice color based on rules - overrides default color scheme completely.

  const getArcLabel = (item) => {
    let lbl = '';

    switch (props.selection[item.lastLabel]) {
      case '(id)':
        lbl = item.id;
        break;
      case '(label)':
        lbl = item.lastLabel;
        break;
      default:
        lbl = item.properties[props.selection[item.lastLabel]];
    }

    return typeof lbl === 'object' ? lbl.low : lbl;
  };

  if (data && data.links && data.links.length == 0) {
    return (
      <NeoCodeViewerComponent
        value={
          "No relationship weights found. \nDefine a numeric 'Relationship Property' in the \nreport's advanced settings to view the sankey diagram."
        }
      ></NeoCodeViewerComponent>
    );
  }

  if (data && data.nodes && data.links && isCyclic(data)) {
    return (
      <NeoCodeViewerComponent
        value={'Please be careful with the data you use for this chart as it does not support cyclic dependencies.'}
      ></NeoCodeViewerComponent>
    );
  }

  // Nodes coloured by the scheme in order of appearance (as nivo's ordinal colours were); links take
  // a gradient between their ends.
  const colorOf = ordinalColors(schemeColors(colorScheme));
  // Each node's column (longest path from a source), so labels in the last column can sit on its
  // inner side, as nivo's "inside" labels did, instead of running off the edge.
  const depth: Record<string, number> = {};
  const incoming = new Set(data.links.map((l) => `${l.target}`));
  let frontier = data.nodes.map((n) => `${n.id}`).filter((id) => !incoming.has(id));
  frontier.forEach((id) => (depth[id] = 0));
  for (let step = 0; frontier.length && step < data.nodes.length; step++) {
    const next: string[] = [];
    const current = new Set(frontier);
    data.links.forEach((l) => {
      const from = `${l.source}`;
      const to = `${l.target}`;
      if (current.has(from) && (depth[to] ?? -1) < depth[from] + 1) {
        depth[to] = depth[from] + 1;
        next.push(to);
      }
    });
    frontier = next;
  }
  const lastColumn = Math.max(0, ...Object.values(depth));
  const nodeData = data.nodes.map((node) => {
    const color = colorOf(`${node.id}`);
    return {
      name: `${node.id}`,
      label: {
        formatter: () => `${getArcLabel(node) ?? ''}`,
        ...(labelPosition !== 'outside' && lastColumn > 0 && depth[`${node.id}`] === lastColumn
          ? { position: layout !== 'vertical' ? 'left' : 'top' }
          : {}),
      },
      itemStyle: { color, borderColor: darker(color, 0.8), borderWidth: nodeBorderWidth },
      node,
    };
  });
  const nodeById = Object.fromEntries(nodeData.map((n) => [n.name, n]));
  const labelOf = (id) => {
    const node = nodeById[`${id}`];
    return node ? `${getArcLabel(node.node) ?? ''}` : `${id}`;
  };
  const horizontal = layout !== 'vertical';
  const option = {
    tooltip: interactive
      ? {
          trigger: 'item',
          formatter: (p) =>
            p.dataType === 'edge'
              ? `${escapeHtml(labelOf(p.data.source))} → ${escapeHtml(labelOf(p.data.target))}: <b>${escapeHtml(p.data.value)}</b>`
              : `<b>${escapeHtml(labelOf(p.name))}</b>: ${escapeHtml(p.value)}`,
        }
      : { show: false },
    series: [
      {
        type: 'sankey',
        left: marginLeft,
        top: marginTop,
        right: legend ? legendWidth + marginRight : marginRight,
        bottom: legend ? legendHeight + marginBottom : marginBottom,
        orient: horizontal ? 'horizontal' : 'vertical',
        nodeAlign: 'justify',
        nodeWidth: nodeThickness,
        nodeGap: nodeSpacing,
        draggable: false,
        silent: !interactive,
        emphasis: { focus: 'adjacency' },
        label: {
          position: labelPosition === 'outside' ? (horizontal ? 'left' : 'top') : horizontal ? 'right' : 'bottom',
          rotate: labelOrientation === 'vertical' ? 90 : 0,
          color: palettes[mode].chartText,
        },
        lineStyle: { color: 'gradient', opacity: 0.5, curveness: 0.5 },
        data: nodeData,
        links: data.links.map((link) => ({
          source: `${link.source}`,
          target: `${link.target}`,
          value: toNumber(link.value),
        })),
      },
    ],
  };

  return <EChart option={option} />;
};

export default NeoSankeyChart;

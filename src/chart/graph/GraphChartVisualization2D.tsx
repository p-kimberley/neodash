import React from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { GraphChartVisualizationProps } from './GraphChartVisualization';
import { generateNodeCanvasObject } from './util/NodeUtils';
import { generateRelCanvasObject } from './util/RelUtils';
import { NeoGraphChartVisualizationBase } from './GraphChartVisualizationBase';

/*
 *
 */
const SEARCH_RING_COLOR = '#f59e0b';

export const NeoGraphChartVisualization2D = (props: GraphChartVisualizationProps) => {
  const config2d = {
    graphComponent: ForceGraph2D,
    cooldownAfterengineStop: 0,
    nodeCanvasObjectMode: () => 'after',
    nodeCanvasObject: (node: any, ctx: any, globalScale: number) => {
      generateNodeCanvasObject(
        node,
        ctx,
        props.style.nodeIcons,
        props.interactivity.layoutFrozen,
        props.interactivity.nodePositions,
        props.style.nodeLabelFontSize,
        props.style.defaultNodeSize,
        props.style.nodeLabelColor,
        props.extensions.styleRules,
        props.engine.selection,
        globalScale
      );
      const search = props.interactivity.search;
      if (search && search.matches.has(node.id)) {
        const focused = search.current === node.id;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.sqrt(node.size || 1) * 4 + 3 / globalScale, 0, 2 * Math.PI);
        ctx.lineWidth = (focused ? 3 : 1.5) / globalScale;
        ctx.strokeStyle = SEARCH_RING_COLOR;
        ctx.stroke();
      }
    },
    linkCanvasObjectMode: () => 'after',
    linkCanvasObject: (link: any, ctx: any, globalScale: number) =>
      generateRelCanvasObject(link, ctx, props.style.relLabelFontSize, props.style.relLabelColor, globalScale),
  };
  const props2d = { ...props, config: config2d };
  return <NeoGraphChartVisualizationBase {...props2d} />;
};

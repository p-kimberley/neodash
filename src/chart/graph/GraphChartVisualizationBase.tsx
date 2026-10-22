import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import chroma from 'chroma-js';
import { executeActionRule, getRuleWithFieldPropertyName } from '../../extensions/advancedcharts/Utils';
import { getTooltip } from './component/GraphChartTooltip';
import { GraphChartVisualizationProps } from './GraphChartVisualization';

/** A colour at low opacity, for nodes and relationships that don't match a search. */
const faded = (color?: string) => {
  return color && chroma.valid(color) ? chroma(color).alpha(0.12).css() : 'rgba(128, 128, 128, 0.12)';
};

// Accessors that read from the data only, defined once so their identity never changes.
const linkWidthOf = (link: any) => link.width;
const nodeSizeOf = (node: any) => node.size;
const linkDashOf = (link: any) => (link.new ? [2, 1] : null);

export const NeoGraphChartVisualizationBase = (props: GraphChartVisualizationProps) => {
  const fgRef: React.MutableRefObject<any> = useRef(undefined);
  const GraphComponent = props.config?.graphComponent;
  const ready = Boolean(props.style.width && props.style.height);

  // WebGL renderers: cap the pixel ratio (a 2x or 3x screen otherwise renders 4-9x the pixels).
  const maxPixelRatio = props.config?.maxPixelRatio;
  useEffect(() => {
    const renderer = fgRef.current?.renderer?.();
    if (renderer && maxPixelRatio) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    }
  }, [GraphComponent, ready, maxPixelRatio]);

  // Accessors keep their identity across re-renders: the graph re-applies every accessor that
  // changes to every node and relationship.
  // While searching, everything that isn't a match (or a relationship touching one) is dimmed.
  const matches: Set<string> | undefined = props.interactivity.search?.matches;
  const nodeColor = useCallback(
    (node: any) => (matches && !matches.has(node.id) ? faded(node.color) : node.color),
    [matches]
  );
  const linkColor = useCallback(
    (link: any) =>
      matches && !(matches.has(link.source?.id ?? link.source) || matches.has(link.target?.id ?? link.target))
        ? faded(link.color)
        : link.color,
    [matches]
  );
  const showPropertiesOnHover = props.interactivity.showPropertiesOnHover;
  const nodeLabel = useCallback(
    (node: any) => (showPropertiesOnHover ? `<div>${getTooltip(node)}</div>` : ''),
    [showPropertiesOnHover]
  );
  const linkLabel = useCallback(
    (link: any) => (showPropertiesOnHover ? `<div>${getTooltip(link)}</div>` : ''),
    [showPropertiesOnHover]
  );
  const linkPositionUpdate = props.config?.linkPositionUpdate;
  const positionLinkLabel = useCallback(
    (sprite, { start, end }, link) => linkPositionUpdate && linkPositionUpdate(sprite, { start, end }, link, fgRef),
    [linkPositionUpdate]
  );

  // The same object while the nodes and relationships are the same: a new one restarts the layout
  // simulation, which (in 3D) nudged every node on each re-render, e.g. when clicking a node.
  const { nodes, links } = props.data;
  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  if (!ready) {
    return <></>;
  }
  props.interactivity.zoomToFit = () => fgRef.current && fgRef.current.zoomToFit(400);
  // Centres the view on a node: pans and zooms in 2D, moves the camera to look at it in 3D.
  props.interactivity.focusNode = (node: any) => {
    const graph = fgRef.current;
    if (!graph || !node || node.x === undefined) {
      return;
    }
    if (node.z === undefined) {
      graph.centerAt(node.x, node.y, 600);
      graph.zoom(Math.max(graph.zoom(), 2.5), 600);
    } else {
      const distance = 140;
      const ratio = 1 + distance / Math.max(1, Math.hypot(node.x, node.y, node.z));
      graph.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 800);
    }
  };
  // Large 3D graphs leave out relationship arrows and particles (one mesh each).
  const hideLinkDecorations = props.config?.hideLinkDecorations;
  return (
    <GraphComponent
      ref={fgRef}
      width={props.style.width - 20}
      height={props.style.height}
      linkCurvature='curvature'
      backgroundColor={props.style.backgroundColor}
      linkDirectionalArrowLength={hideLinkDecorations ? 0 : props.style.linkDirectionalArrowLength}
      linkDirectionalArrowRelPos={1}
      dagMode={props.engine.layout}
      dagLevelDistance={props.engine.graphDepthSep}
      linkWidth={linkWidthOf}
      linkLabel={linkLabel}
      nodeLabel={nodeLabel}
      nodeVal={nodeSizeOf}
      nodeColor={nodeColor}
      linkColor={linkColor}
      onNodeClick={(item, event) => {
        props.interactivity.setClickPosition({ x: event.clientX, y: event.clientY });
        let rules = getRuleWithFieldPropertyName(item, props.extensions.actionsRules, 'onNodeClick', 'labels');
        rules != null
          ? rules.forEach((rule) => executeActionRule(rule, item, { ...props.interactivity }))
          : props.interactivity.onNodeClick(item);
      }}
      onLinkClick={(item, event) => {
        props.interactivity.setClickPosition({ x: event.clientX, y: event.clientY });
        let rules = getRuleWithFieldPropertyName(item, props.extensions.actionsRules, 'onLinkClick', 'type');
        rules != null
          ? rules.forEach((rule) => executeActionRule(rule, item, props.interactivity.setGlobalParameter))
          : props.interactivity.onRelationshipClick(item);
      }}
      onNodeRightClick={(node, event) => props.interactivity.onNodeRightClick(node, event)}
      onLinkRightClick={(link, event) => props.interactivity.onRelationshipRightClick(link, event)}
      onBackgroundClick={() => props.interactivity.onNodeClick(undefined)}
      onBackgroundRightClick={() => props.interactivity.onNodeClick(undefined)}
      linkLineDash={linkDashOf}
      linkDirectionalParticles={hideLinkDecorations ? 0 : props.style.linkDirectionalParticles}
      linkDirectionalParticleSpeed={props.style.linkDirectionalParticleSpeed}
      cooldownTicks={props.engine.cooldownTicks}
      onEngineStop={() => {
        props.engine.setCooldownTicks(props.config.cooldownAfterengineStop);
        if (props.engine.recenterAfterEngineStop) {
          fgRef.current.zoomToFit(400);
          props.engine.setRecenterAfterEngineStop(false);
        }
      }}
      onZoom={() => {
        props.interactivity.setContextMenuOpen(false);
      }}
      onNodeDrag={() => {
        props.interactivity.setContextMenuOpen(false);
        props.engine.setCooldownTicks(1);
        props.engine.setRecenterAfterEngineStop(false);
      }}
      onNodeDragEnd={(node) => {
        props.engine.setCooldownTicks(props.config.cooldownAfterengineStop);
        if (props.interactivity.fixNodeAfterDrag) {
          node.fx = node.x;
          node.fy = node.y;
          if (node.z !== undefined) {
            node.fz = node.z;
          }
        }
        // TODO - Frozen layout only works in 2D
        if (props.interactivity.layoutFrozen) {
          const key = node.id;
          const val = [node.x, node.y];
          const old = { ...props.interactivity.nodePositions };
          old[key] = val;
          props.interactivity.setNodePositions(old);
        }
      }}
      // 2D-specific config settings
      nodeCanvasObjectMode={props.config?.nodeCanvasObjectMode}
      nodeCanvasObject={props.config?.nodeCanvasObject}
      linkCanvasObjectMode={props.config?.linkCanvasObjectMode}
      linkCanvasObject={props.config?.linkCanvasObject}
      // 3D-specific config settings
      nodeThreeObjectExtend={props.config?.nodeThreeObjectExtend}
      nodeThreeObject={props.config?.nodeThreeObject}
      linkThreeObjectExtend={props.config?.linkThreeObjectExtend}
      linkThreeObject={props.config?.linkThreeObject}
      linkPositionUpdate={linkPositionUpdate ? positionLinkLabel : undefined}
      // Data to populate graph
      graphData={graphData}
    />
  );
};

import React, { useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { GraphChartVisualizationProps } from '../../../../chart/graph/GraphChartVisualization';
import { getNodeLabel } from '../../../../chart/graph/util/NodeUtils';
import SpriteText from 'three-spritetext';
import { evaluateRulesOnNode } from '../../../styling/StyleRuleEvaluator';
import { NeoGraphChartVisualizationBase } from '../../../../chart/graph/GraphChartVisualizationBase';
import * as THREE from 'three';

/** Above this many relationships, relationship labels, arrows and particles are left out in 3D. */
export const LARGE_GRAPH_LINKS = 1000;

/**
 * Text labels as sprites that share one texture per distinct label (text, colour, size): a graph's
 * relationship labels are mostly a handful of types, and node captions repeat too. Each sprite
 * still has its own position. Labels ignore the pointer, so hovering and clicking only test nodes
 * and relationships.
 */
const createLabelFactory = () => {
  // (SpriteText is a THREE.Sprite; its bundled typings don't resolve three's, hence any.)
  const templates = new Map<string, any>();
  return {
    make: (text: string, color: string, height: number) => {
      const key = `${text}\u0000${color}\u0000${height}`;
      let template = templates.get(key);
      if (!template) {
        template = new SpriteText(text);
        template.color = color;
        template.textHeight = height;
        templates.set(key, template);
      }
      const sprite = new THREE.Sprite(template.material);
      sprite.scale.copy(template.scale);
      sprite.raycast = () => {};
      return sprite;
    },
    dispose: () => {
      templates.forEach((t) => {
        t.material.map?.dispose();
        t.material.dispose();
      });
      templates.clear();
    },
  };
};

export const NeoGraphChartVisualization3D = (props: GraphChartVisualizationProps) => {
  const { selection } = props.engine;
  const { nodeLabelColor, nodeLabelFontSize, relLabelColor, relLabelFontSize } = props.style;
  const { styleRules } = props.extensions;
  const large = props.data.links.length > LARGE_GRAPH_LINKS;

  // The label factories only change when what labels look like changes, so re-renders (a search
  // keystroke, a click) don't make the graph rebuild every label.
  const labelKey = JSON.stringify([
    selection,
    nodeLabelColor,
    nodeLabelFontSize,
    styleRules,
    relLabelColor,
    relLabelFontSize,
  ]);
  const labels = useMemo(() => createLabelFactory(), [labelKey]);
  useEffect(() => () => labels.dispose(), [labels]);

  const nodeThreeObject = useMemo(
    () => (node) => {
      const text = selection && selection[node.mainLabel] ? `${getNodeLabel(selection, node)}` : '';
      if (!text) {
        return undefined;
      }
      const color = evaluateRulesOnNode(node, 'node label color', nodeLabelColor, styleRules);
      return labels.make(text, color, nodeLabelFontSize);
    },
    [labels]
  );
  const linkThreeObject = useMemo(
    () => (link) => labels.make(`${link.properties.name || link.type || link.id}`, relLabelColor, relLabelFontSize),
    [labels]
  );

  const config3d = {
    graphComponent: ForceGraph3D,
    cooldownAfterengineStop: 1,
    // Sharp enough on high-density screens without rendering up to 4x the pixels.
    maxPixelRatio: 1.5,
    hideLinkDecorations: large,
    nodeThreeObjectExtend: true,
    nodeThreeObject: nodeThreeObject,
    linkThreeObjectExtend: true,
    linkThreeObject: large ? undefined : linkThreeObject,
    linkPositionUpdate: (sprite, { start, end }, link, _) => {
      if (!sprite) {
        return;
      }
      if (link.source.id !== link.target.id) {
        // If this is a relationship with a different start and end node...
        const middle = {
          x: start.x + (end.x - start.x) / 2,
          y: start.y + (end.y - start.y) / 2,
          z: start.z + (end.z - start.z) / 2,
        };
        if (!link.curvature) {
          // Simple case - no curvature assigned, we position the label in the middle of the two nodes.
          Object.assign(sprite.position, middle);
        } else {
          // Complex case, multiple rels between a pair of nodes. Adjust the position to match each rel's curvature.
          let vector = new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
          let length = vector.length();
          let axis = new THREE.Vector3(0, 0, 1);
          let angle = -Math.PI / 2;
          vector = vector.applyAxisAngle(axis, angle);
          vector.multiplyScalar(0.5 * link.curvature * Math.pow(length / 30.0, 0.01));
          const translated = { x: middle.x + vector.x, y: middle.y + vector.y, z: middle.z + vector.z };
          Object.assign(sprite.position, translated);
        }
      } else {
        // If this is a relationship with an identical start and end node...
        const vector = { x: 26 * link.curvature, y: 26 * link.curvature, z: 0 };

        const translated = { x: start.x + vector.x, y: start.y + vector.y, z: start.z + vector.z };
        Object.assign(sprite.position, translated);
      }
    },
  };
  const props3d = { ...props, config: config3d };
  return <NeoGraphChartVisualizationBase {...props3d} />;
};

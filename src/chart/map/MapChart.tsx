import React, { useEffect, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { ChartProps } from '../Chart';
import { categoricalColorSchemes } from '../../config/ColorConfig';
import { valueIsArray, valueIsNode, valueIsRelationship, valueIsPath, valueIsObject } from '../../chart/ChartUtils';
import { tileAttributionFor, tileUrlFor } from '../../config/MapConfig';
import { MapView, fitToPoints } from './maplibre/MapView';
import { evaluateRulesOnNode, useStyleRules } from '../../extensions/styling/StyleRuleEvaluator';
import { addHeatmapLayer } from './layers/HeatmapLayer';
import { addMarkerLayer } from './layers/MarkerLayer';
import { addLineLayer } from './layers/LineLayer';
import { extensionEnabled } from '../../utils/ReportUtils';

const update = (state, mutations) => Object.assign({}, state, mutations);

/**
 * Renders nodes with a location (latitude/longitude properties or a Neo4j point) on a map, as pins
 * (optionally clustered) with the relationships between them, or as a heatmap. Drawn with MapLibre.
 */
const NeoMapChart = (props: ChartProps) => {
  // Retrieve config from advanced settings
  const layerType = props.settings && props.settings.layerType ? props.settings.layerType : 'markers';
  const nodeColorProp = props.settings && props.settings.nodeColorProp ? props.settings.nodeColorProp : 'color';
  const defaultNodeSize = props.settings && props.settings.defaultNodeSize ? props.settings.defaultNodeSize : 'large';
  const relWidthProp = props.settings && props.settings.relWidthProp ? props.settings.relWidthProp : 'width';
  const relColorProp = props.settings && props.settings.relColorProp ? props.settings.relColorProp : 'color';
  const defaultRelWidth = props.settings && props.settings.defaultRelWidth ? props.settings.defaultRelWidth : 3.5;
  const defaultRelColor = props.settings && props.settings.defaultRelColor ? props.settings.defaultRelColor : '#666';
  const nodeColorScheme = props.settings && props.settings.nodeColorScheme ? props.settings.nodeColorScheme : 'neodash';
  const styleRules = useStyleRules(
    extensionEnabled(props.extensions, 'styling'),
    props.settings.styleRules,
    props.getGlobalParameter
  );
  const defaultNodeColor = 'grey'; // Color of nodes without labels
  const mapProviderURL = tileUrlFor(props.settings);
  const attribution = tileAttributionFor(props.settings);

  const [data, setData] = useState({ nodes: [], links: [] });
  const [map, setMap] = useState<maplibregl.Map | undefined>(undefined);

  useEffect(() => {
    buildVisualizationDictionaryFromRecords(props.records);
  }, [props.records]);

  // Draw the layers once the map is ready, and fit the view to the located nodes.
  useEffect(() => {
    if (!map) {
      return undefined;
    }
    const cleanups =
      layerType == 'heatmap'
        ? [addHeatmapLayer(map, data.nodes, props)]
        : [addLineLayer(map, data.links), addMarkerLayer(map, data.nodes, props)];
    fitToPoints(
      map,
      data.nodes.filter((node) => node.pos).map((node) => node.pos)
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [map, data, layerType, props.selection]);

  let nodes = {};
  let nodeLabels = {};
  let links = {};
  let linkTypes = {};

  // Gets all graphy objects (nodes/relationships) from the complete set of return values.
  // TODO this should be in Utils.ts
  function extractGraphEntitiesFromField(value) {
    if (value == undefined) {
      return;
    }
    if (valueIsArray(value)) {
      value.forEach((v) => extractGraphEntitiesFromField(v));
    } else if (valueIsObject(value)) {
      if (value.label && value.id) {
        // Override for adding point nodes using a manually constructed dict.
        nodeLabels[value.label] = true;
        nodes[value.id] = {
          id: value.id,
          labels: [value.label],
          size: defaultNodeSize,
          properties: value,
          firstLabel: value.label,
        };
      } else if (value.type && value.id && value.start && value.end) {
        // Override for adding relationships using a manually constructed dict.
        if (links[`${value.start},${value.end}`] == undefined) {
          links[`${value.start},${value.end}`] = [];
        }
        const addItem = (arr, item) => arr.find((x) => x.id === item.id) || arr.push(item);
        addItem(links[`${value.start},${value.end}`], {
          id: value.id,
          source: value.start,
          target: value.end,
          type: value.type,
          width: value[relWidthProp] ? value[relWidthProp] : defaultRelWidth,
          color: value[relColorProp] ? value[relColorProp] : defaultRelColor,
          properties: value,
        });
      }
    } else if (valueIsNode(value)) {
      value.labels.forEach((l) => (nodeLabels[l] = true));
      nodes[value.identity.low] = {
        id: value.identity.low,
        labels: value.labels,
        size: defaultNodeSize,
        properties: value.properties,
        firstLabel: value.labels[0],
      };
    } else if (valueIsRelationship(value)) {
      if (links[`${value.start.low},${value.end.low}`] == undefined) {
        links[`${value.start.low},${value.end.low}`] = [];
      }
      const addItem = (arr, item) => arr.find((x) => x.id === item.id) || arr.push(item);
      addItem(links[`${value.start.low},${value.end.low}`], {
        id: value.identity.low,
        source: value.start.low,
        target: value.end.low,
        type: value.type,
        width: value.properties[relWidthProp] ? value.properties[relWidthProp] : defaultRelWidth,
        color: value.properties[relColorProp] ? value.properties[relColorProp] : defaultRelColor,
        properties: value.properties,
      });
    } else if (valueIsPath(value)) {
      value.segments.map((segment) => {
        extractGraphEntitiesFromField(segment.start);
        extractGraphEntitiesFromField(segment.relationship);
        extractGraphEntitiesFromField(segment.end);
      });
    }
  }

  // TODO this should be in Utils.ts
  function buildVisualizationDictionaryFromRecords(records) {
    // Extract graph objects from result set.
    records.forEach((record) => {
      record._fields &&
        record._fields.forEach((field) => {
          extractGraphEntitiesFromField(field);
        });
    });

    // Assign proper colors & coordinates to nodes.
    const totalColors = categoricalColorSchemes[nodeColorScheme].length;
    const nodeLabelsList = Object.keys(nodeLabels);
    const nodesList = Object.values(nodes).map((node) => {
      const assignPosition = (node) => {
        if (node.properties.latitude && node.properties.longitude) {
          nodes[node.id].pos = [parseFloat(node.properties.latitude), parseFloat(node.properties.longitude)];
          return nodes[node.id].pos;
        }
        if (node.properties.lat && node.properties.long) {
          nodes[node.id].pos = [parseFloat(node.properties.lat), parseFloat(node.properties.long)];
          return nodes[node.id].pos;
        }
        Object.values(node.properties).forEach((p) => {
          if (p != null && p.srid != null && p.x != null && p.y != null) {
            if (!isNaN(p.x) && !isNaN(p.y)) {
              nodes[node.id].pos = [p.y, p.x];
              return [p.y, p.x];
            }
          }
        });
      };

      let assignedColor = node.properties[nodeColorProp]
        ? node.properties[nodeColorProp]
        : categoricalColorSchemes[nodeColorScheme][nodeLabelsList.indexOf(node.firstLabel) % totalColors];

      assignedColor = evaluateRulesOnNode(node, 'marker color', assignedColor, styleRules);
      const assignedPos = assignPosition(node);
      return update(node, {
        pos: node.pos ? node.pos : assignedPos,
        color: assignedColor ? assignedColor : defaultNodeColor,
      });
    });

    // Assign proper curvatures to relationships.
    const linksList = Object.values(links)
      .map((nodePair) => {
        return nodePair.map((link) => {
          if (nodes[link.source] && nodes[link.source].pos && nodes[link.target] && nodes[link.target].pos) {
            return update(link, { start: nodes[link.source].pos, end: nodes[link.target].pos });
          }
        });
      })
      .flat();

    // Set data based on result values.
    setData({ nodes: nodesList, links: linksList });
  }

  return <MapView tileUrl={mapProviderURL} attribution={attribution} onReady={setMap} />;
};

export default NeoMapChart;

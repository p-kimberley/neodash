import * as maplibregl from 'maplibre-gl';
import { toLngLat } from '../maplibre/MapView';

const SOURCE = 'nd-heat';
const LAYER = 'nd-heat';

/** A node's intensity: the chosen property (Neo4j integers included), or 1 when none is set. */
const intensityOf = (node, intensityProp: string) => {
  if (!intensityProp) {
    return 1;
  }
  const value = node.properties[intensityProp];
  const number = parseFloat(value?.low ?? value);
  return Number.isFinite(number) ? number : 0;
};

/** Draws the located nodes as a heatmap, weighted by the `intensityProp` setting. */
export function addHeatmapLayer(map: maplibregl.Map, nodes: any[], props): () => void {
  const intensityProp = props.settings?.intensityProp ?? '';
  const points = nodes.filter((node) => node.pos && !isNaN(node.pos[0]) && !isNaN(node.pos[1]));
  // Weights are scaled to 0..1, so the strongest point is fully hot whatever the property's range.
  const max = Math.max(1e-9, ...points.map((node) => intensityOf(node, intensityProp)));
  map.addSource(SOURCE, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: points.map((node) => ({
        type: 'Feature',
        properties: { weight: intensityOf(node, intensityProp) / max },
        geometry: { type: 'Point', coordinates: toLngLat(node.pos) },
      })),
    },
  });
  map.addLayer({
    id: LAYER,
    type: 'heatmap',
    source: SOURCE,
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 9, 28],
      'heatmap-opacity': 0.85,
    },
  });
  return () => {
    if (map.getLayer(LAYER)) {
      map.removeLayer(LAYER);
    }
    if (map.getSource(SOURCE)) {
      map.removeSource(SOURCE);
    }
  };
}

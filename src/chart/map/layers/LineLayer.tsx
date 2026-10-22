import React from 'react';
import * as maplibregl from 'maplibre-gl';
import { Typography } from '@neo4j-ndl/react';
import { openReactPopup, toLngLat } from '../maplibre/MapView';

const SOURCE = 'nd-links';
const LAYER = 'nd-links';

const RelPopup = ({ rel }) => (
  <div className='nd-map-popup-content'>
    <Typography variant='title-2'>
      <b>{rel.type}</b>
    </Typography>
    <table>
      <tbody>
        {Object.keys(rel.properties).length == 0 ? (
          <tr>
            <td>(No properties)</td>
          </tr>
        ) : (
          Object.keys(rel.properties).map((k) => (
            <tr key={k}>
              <td className='nd-map-popup-key'>{k}:</td>
              <td>{`${rel.properties[k]}`}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

/** Draws relationships between located nodes as lines; clicking one shows its properties. */
export function addLineLayer(map: maplibregl.Map, links: any[]): () => void {
  const drawn = links.filter((link) => link && link.start && link.end);
  map.addSource(SOURCE, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: drawn.map((rel, i) => ({
        type: 'Feature',
        properties: { i, color: rel.color, width: Number(rel.width) || 3.5 },
        geometry: { type: 'LineString', coordinates: [toLngLat(rel.start), toLngLat(rel.end)] },
      })),
    },
  });
  map.addLayer({
    id: LAYER,
    type: 'line',
    source: SOURCE,
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] },
  });
  const onClick = (e: maplibregl.MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature) {
      openReactPopup(map, e.lngLat, <RelPopup rel={drawn[feature.properties.i]} />);
    }
  };
  const pointer = () => (map.getCanvas().style.cursor = 'pointer');
  const noPointer = () => (map.getCanvas().style.cursor = '');
  map.on('click', LAYER, onClick);
  map.on('mouseenter', LAYER, pointer);
  map.on('mouseleave', LAYER, noPointer);
  return () => {
    map.off('click', LAYER, onClick);
    map.off('mouseenter', LAYER, pointer);
    map.off('mouseleave', LAYER, noPointer);
    if (map.getLayer(LAYER)) {
      map.removeLayer(LAYER);
    }
    if (map.getSource(SOURCE)) {
      map.removeSource(SOURCE);
    }
  };
}

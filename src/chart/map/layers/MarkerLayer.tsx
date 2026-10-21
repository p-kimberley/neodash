import React from 'react';
import * as maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import { Button, Typography } from '@neo4j-ndl/react';
import { getRule } from '../../../extensions/advancedcharts/Utils';
import { extensionEnabled } from '../../../utils/ReportUtils';
import { openReactPopup, toLngLat } from '../maplibre/MapView';

// Heroicons "map-pin" (solid), the icon the Leaflet version used.
const PIN_PATH =
  'M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z';

const PIN_SIZES = { large: 34, medium: 26, small: 20 };

/** Properties popup for a node, with the "set parameter" click actions from the actions extension. */
const NodePopup = ({ node, actionsRules, setGlobalParameter }) => (
  <div className='nd-map-popup-content'>
    <Typography variant='h4'>
      <b>{node.labels.length > 0 ? node.labels.join(' ') : '(No labels)'}</b>
    </Typography>
    <table>
      <tbody>
        {Object.keys(node.properties).length == 0 ? (
          <tr>
            <td>(No properties)</td>
          </tr>
        ) : (
          Object.keys(node.properties).map((k) => {
            const value = `${node.properties[k]}`;
            const rule = getRule({ field: k, value: value }, actionsRules, 'Click');
            const execRule =
              rule !== null && rule[0] !== null && rule[0].customization == 'set variable' && setGlobalParameter;
            return (
              <tr key={k}>
                <td className='nd-map-popup-key'>{k}:</td>
                <td>
                  {execRule ? (
                    <Button
                      style={{ width: '100%' }}
                      color='primary'
                      onClick={() => setGlobalParameter(`neodash_${rule[0].customizationValue}`, value)}
                    >
                      {value}
                    </Button>
                  ) : (
                    value
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);

const pinElement = (color: string, size: number) => {
  const el = document.createElement('div');
  el.className = 'nd-map-pin';
  el.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${PIN_PATH}"/></svg>`;
  el.style.color = color;
  return el;
};

const clusterElement = (count: number) => {
  const el = document.createElement('div');
  el.className = 'nd-map-cluster';
  const size = Math.min(56, 28 + Math.log2(count) * 4);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.textContent = `${count}`;
  return el;
};

/**
 * Draws the nodes of a map report as pin markers. Returns a cleanup function.
 * - clusterMarkers: nearby markers merge into numbered clusters; clicking one zooms in.
 * - separateOverlappingMarkers: markers at (almost) the same place are grouped, and clicking the
 *   group fans them out in a circle (as Leaflet's cluster "spiderfy" did).
 */
export function addMarkerLayer(map: maplibregl.Map, nodes: any[], props): () => void {
  const clusterMarkers = props.settings?.clusterMarkers ?? false;
  const separateOverlappingMarkers = props.settings?.separateOverlappingMarkers ?? false;
  const size = PIN_SIZES[props.settings?.defaultNodeSize ?? 'large'] ?? PIN_SIZES.large;
  const actionsRules =
    extensionEnabled(props.extensions, 'actions') && props.settings?.actionsRules ? props.settings.actionsRules : [];

  const labelFor = (node) => {
    const selected = props.selection && props.selection[node.firstLabel];
    if (!selected || selected == '(no label)') {
      return '';
    }
    if (selected == '(id)') {
      return `${node.id}`;
    }
    if (selected == '(label)') {
      return node.labels.join(', ');
    }
    return node.properties[selected] !== undefined ? `${node.properties[selected]}` : '';
  };

  const located = nodes.filter((node) => node.pos && !isNaN(node.pos[0]) && !isNaN(node.pos[1]));
  const index = new Supercluster({ radius: clusterMarkers ? 60 : separateOverlappingMarkers ? 12 : 0, maxZoom: 17 });
  index.load(
    located.map((node, i) => ({
      type: 'Feature',
      properties: { i },
      geometry: { type: 'Point', coordinates: toLngLat(node.pos) },
    }))
  );

  let markers: maplibregl.Marker[] = [];
  let hoverLabel: maplibregl.Popup | undefined;

  const makeNodeMarker = (node, lngLat: [number, number], offset: [number, number] = [0, 0]) => {
    const el = pinElement(node.color, size);
    const label = labelFor(node);
    if (label) {
      el.addEventListener('mouseenter', () => {
        hoverLabel?.remove();
        hoverLabel = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'nd-map-tooltip',
          offset: [offset[0], offset[1] + 4],
          anchor: 'top',
        })
          .setLngLat(lngLat)
          .setText(label)
          .addTo(map);
      });
      el.addEventListener('mouseleave', () => hoverLabel?.remove());
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      hoverLabel?.remove();
      openReactPopup(
        map,
        lngLat,
        <NodePopup node={node} actionsRules={actionsRules} setGlobalParameter={props.setGlobalParameter} />,
        { offset: [offset[0], offset[1] - size] }
      );
    });
    return new maplibregl.Marker({ element: el, anchor: 'bottom', offset }).setLngLat(lngLat).addTo(map);
  };

  // Fans the members of a group out in a circle around its position.
  const spiderfy = (clusterId: number, lngLat: [number, number]) => {
    const leaves = index.getLeaves(clusterId, Infinity);
    const radius = Math.max(28, leaves.length * 6);
    render();
    leaves.forEach((leaf, n) => {
      const angle = (2 * Math.PI * n) / leaves.length;
      const offset: [number, number] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
      markers.push(makeNodeMarker(located[leaf.properties.i], lngLat, offset));
    });
  };

  function render() {
    markers.forEach((marker) => marker.remove());
    markers = [];
    const bounds = map.getBounds();
    const zoom = Math.floor(map.getZoom());
    const features = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom
    );
    features.forEach((feature) => {
      const lngLat = feature.geometry.coordinates as [number, number];
      if (feature.properties.cluster) {
        const el = clusterElement(feature.properties.point_count);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const expansionZoom = index.getClusterExpansionZoom(feature.properties.cluster_id);
          // Markers that never separate (same place) are fanned out instead of zooming further.
          if (expansionZoom > 17 || !clusterMarkers) {
            spiderfy(feature.properties.cluster_id, lngLat);
          } else {
            map.easeTo({ center: lngLat, zoom: expansionZoom });
          }
        });
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map));
      } else {
        markers.push(makeNodeMarker(located[feature.properties.i], lngLat));
      }
    });
  }

  render();
  map.on('moveend', render);
  return () => {
    map.off('moveend', render);
    hoverLabel?.remove();
    markers.forEach((marker) => marker.remove());
  };
}

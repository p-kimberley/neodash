import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Emitted as a file by webpack (see webpack.config.js), so the worker is served by NeoDash itself.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs';

maplibregl.setWorkerUrl(workerUrl);

/** A [latitude, longitude] pair, the order the map reports have always used. */
export type LatLng = [number, number];

export const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];

/** The design-system colour behind the map when there are no tiles (and while they load). */
const backgroundColor = () =>
  getComputedStyle(document.body).getPropertyValue('--nd-surface-variant').trim() || '#eef1f5';

/**
 * A MapLibre style for a raster tile URL template ({z}/{x}/{y}; Leaflet's {s} subdomains and {r}
 * retina placeholders are expanded), or a plain background when there's no tile server, so maps work
 * offline.
 */
const styleFor = (tileUrl: string, attribution: string): maplibregl.StyleSpecification => {
  const layers: maplibregl.LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': backgroundColor() } },
  ];
  const sources: maplibregl.StyleSpecification['sources'] = {};
  if (tileUrl) {
    const url = tileUrl.replace('{r}', '');
    sources.tiles = {
      type: 'raster',
      tiles: url.includes('{s}') ? ['a', 'b', 'c'].map((s) => url.replace('{s}', s)) : [url],
      tileSize: 256,
      maxzoom: 19,
      attribution: attribution || undefined,
    };
    layers.push({ id: 'tiles', type: 'raster', source: 'tiles' });
  }
  return { version: 8, sources, layers };
};

/** Fits the view to a set of points (no animation); a single point is shown at a city-level zoom. */
export const fitToPoints = (map: maplibregl.Map, points: LatLng[], padding = 40) => {
  const valid = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (valid.length === 0) {
    return;
  }
  if (valid.length === 1) {
    map.jumpTo({ center: toLngLat(valid[0]), zoom: 10 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  valid.forEach((point) => bounds.extend(toLngLat(point)));
  map.fitBounds(bounds, { padding, maxZoom: 14, duration: 0 });
};

/**
 * Renders React content into a map popup. Returns the popup; its React tree is unmounted when the
 * popup closes.
 */
export const openReactPopup = (
  map: maplibregl.Map,
  lngLat: maplibregl.LngLatLike,
  content: React.ReactElement,
  options: maplibregl.PopupOptions = {}
) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(content);
  const popup = new maplibregl.Popup({ maxWidth: '360px', className: 'nd-map-popup', ...options })
    .setLngLat(lngLat)
    .setDOMContent(container)
    .addTo(map);
  // Unmount after the current render pass (unmounting synchronously from a React event is not allowed).
  popup.on('close', () => setTimeout(() => root.unmount()));
  return popup;
};

/**
 * A MapLibre map filling its container. `onReady` receives the map once its style has loaded;
 * layers and markers are added by the report through it. Scroll-wheel zoom is off (as before), so
 * scrolling the dashboard isn't captured by maps; the +/- buttons and pinch/double-click zoom work.
 */
export const MapView = ({
  tileUrl,
  attribution,
  onReady,
  children,
}: {
  tileUrl: string;
  attribution: string;
  onReady: (map: maplibregl.Map | undefined) => void;
  children?: React.ReactNode;
}) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) {
      return undefined;
    }
    const map = new maplibregl.Map({
      container: container.current,
      style: styleFor(tileUrl, attribution),
      center: [0, 20],
      zoom: 0.5,
      maxZoom: 18,
      scrollZoom: false,
      attributionControl: { compact: true },
      // No glyphs or sprites: everything with text is drawn as HTML, so no fonts are fetched.
      validateStyle: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.on('load', () => onReady(map));
    // Keep the canvas in step with the card's size (resizing, maximising). Resizing in the next frame,
    // not inside the observer callback, avoids "ResizeObserver loop" errors.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.resize());
    });
    observer.observe(container.current);
    // Follow light/dark: the background colour comes from the design tokens.
    const themeObserver = new MutationObserver(() => {
      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', backgroundColor());
      }
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      onReady(undefined);
      map.remove();
    };
  }, [tileUrl, attribution]);

  return (
    <div className='nd-map' style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {children}
    </div>
  );
};

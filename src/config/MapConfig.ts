// Where maps get their background tiles and country shapes. Both come from the backend's
// configuration (MAP_TILE_URL, MAP_DATA_URL) rather than public internet services, so NeoDash works
// offline. With no tile server configured, maps draw on a plain background.

import { session } from '../api/client';

/** Tile URL template for a map report: the report's own setting, else the deployment default. */
export const tileUrlFor = (settings?: { providerUrl?: string }): string =>
  settings?.providerUrl || session.config?.maps?.tileUrl || '';

export const tileAttributionFor = (settings?: { attribution?: string }): string =>
  settings?.attribution || session.config?.maps?.tileAttribution || '';

/** URL of a GeoJSON file used by the choropleth and area map charts. */
export const mapDataUrl = (file: string): string =>
  `${(session.config?.maps?.dataUrl || '/maps').replace(/\/$/, '')}/${file}`;

/**
 * Loads a map data file. If it isn't available (e.g. not installed on this deployment), resolves to
 * an empty feature collection so the chart renders without shapes instead of failing.
 */
export const fetchMapData = (file: string): Promise<{ features: any[] }> =>
  fetch(mapDataUrl(file))
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status} ${res.statusText}`))))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.warn(`Map data ${mapDataUrl(file)} is not available (${e.message}); see public/maps/README.md.`);
      return { features: [] };
    });

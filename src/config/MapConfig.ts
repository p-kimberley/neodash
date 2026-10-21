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

import React, { useEffect, useMemo, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { FilledButton } from '@neo4j-ndl/react';
import { categoricalColorSchemes } from '../../../../config/ColorConfig';
import { abbreviateNumber } from '../../../../chart/map/MapUtils';

const SOURCE = 'nd-areas';
const FILL = 'nd-areas-fill';
const OUTLINE = 'nd-areas-outline';
const NO_DATA_COLOR = 'gray';

/**
 * Creates the list of values that will be used for the legend
 * @param min Minimum of the legend
 * @param max Maximum of the legend
 * @param legendLength Number of buckets
 * @returns List of numbers
 */
function getLegendRange(min, max, legendLength) {
  let diff = (max - min) / legendLength;
  // If the difference is 0 or less (strange that can be less, but you never know)
  // Return only one value
  if (diff <= 0) {
    return [Math.round(min * 100) / 100];
  }
  return [...Array(legendLength).keys()].map((i) => {
    return Math.round((min + diff * i) * 100) / 100;
  });
}

/**
 * Function responsible of getting the regions inside a country
 * @param geoJson geoJson clicked on the UI, if we can't find anything we still show the clicked geoJson
 * @param features Object that matches an id to it's polygon
 * @param key Name of the parameter that will be used to match a polygon adn it's components
 * @returns feature object filtered of the useless objects
 */
function getDrillDown(geoJson, features, key, keepConflict = false) {
  let id = geoJson.properties[key];
  let polygonsToKeep = Object.keys(features).filter((polygonId) => {
    let tmp = features[polygonId];

    // Some regions can be disputed between two or more countries
    let toDrillDown =
      key === 'SHORT_COUNTRY_CODE' && tmp.properties.POSSIBLE_COUNTRIES && keepConflict
        ? tmp.properties.POSSIBLE_COUNTRIES.includes(id)
        : tmp.properties[key] === id;
    return toDrillDown;
  });

  // We don't want to re-render if there is no data in the drillDown
  if (polygonsToKeep.length == 0) {
    return [geoJson];
  }

  // Creating a dictionary that is just a filtered version of  features
  let res = {};
  polygonsToKeep.map((id) => {
    res[id] = features[id];
  });
  return res;
}

/**
 * Function used to bind the data from the query with each geojson
 * @param geoData Data parsed from the query results
 * @param geoJsonData geoJson data that needs to be joined with the query results
 * @returns
 */
function bindDataToMap(geoData, geoJsonData) {
  let newValues = {};
  let listValues: any[] = [];
  Object.keys(geoData).forEach((key) => {
    let tmp;
    if (geoJsonData[key] != undefined) {
      tmp = Object.assign({}, geoJsonData[key]);
      tmp.properties.neo_value = geoData[key];
      listValues.push(geoData[key]);
      newValues[key] = tmp;
    }
  });

  // Deepcopying data to prevent strange behaviors
  let geoJsonData_copy = Object.assign(geoJsonData, {});
  let res = Object.assign(geoJsonData_copy, newValues);

  // Sorting the values to get min and max
  listValues.sort((a, b) => {
    return a - b;
  });
  // Returning the list of features
  return [Object.values(res), listValues[0], listValues.slice(-1)[0]];
}

/**
 * The colour of a value: the legend bucket it falls in.
 * @param weight value inside the polygon
 * @param legendRange List that is used to define the legend range
 * @param listColors List of colors in the palette
 */
function getColor(weight, legendRange, listColors) {
  let index = legendRange.findIndex((number) => {
    return number >= weight;
  });
  return listColors.slice(index)[0];
}

/** Bounding box of a GeoJSON feature, for zooming to it. */
function featureBounds(feature): maplibregl.LngLatBounds | undefined {
  const bounds = new maplibregl.LngLatBounds();
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      bounds.extend(coords as [number, number]);
    } else {
      coords.forEach(visit);
    }
  };
  if (feature?.geometry?.coordinates) {
    visit(feature.geometry.coordinates);
  }
  return bounds.isEmpty() ? undefined : bounds;
}

const WORLD_VIEW = { center: [0, 20] as [number, number], zoom: 0.5 };

/**
 * Draws country (and, with drill-down, region) polygons coloured by the report's values on a
 * MapLibre map, with an optional legend and a "Reset view" button after drilling down.
 */
export const MapBoundary = ({ map, dimensions, data, props, featureLevel0, featureLevel1 }) => {
  // Keys used for the drill down
  // (right now only 0 is useful but important to keep in mind that we can add more levels)
  const level0key = 'SHORT_COUNTRY_CODE';
  const level1key = 'isoCode';
  const isLegendEnabled = props.settings && props.settings.showLegend != undefined ? props.settings.showLegend : true;
  const isDrillDownEnabled = props.settings && props.settings.mapDrillDown ? props.settings.mapDrillDown : false;
  // Getting the list of colors from the scheme (for now, starting from a scheme, we always get the last color of the scheme)
  const colorScheme =
    props.settings && props.settings.colors
      ? categoricalColorSchemes[props.settings.colors]
      : categoricalColorSchemes.YlOrRd;
  const listColors = Array.isArray(colorScheme)
    ? Array.isArray(colorScheme.slice(-1)[0])
      ? colorScheme.slice(-1)[0]
      : colorScheme
    : colorScheme;

  // The polygon whose regions are shown (after a drill-down click), or undefined for the world view.
  const [drilledInto, setDrilledInto] = useState<any>(undefined);

  // Polygons with their values and colours, and the legend buckets.
  const { polygonData, legendRange, hasValues } = useMemo(() => {
    let currentKey =
      drilledInto != undefined && Object.keys(drilledInto.properties).includes(level1key) ? level1key : level0key;
    let tmp = drilledInto === undefined ? featureLevel0 : getDrillDown(drilledInto, featureLevel1, currentKey);
    let [newData, minValue, maxValue] = bindDataToMap(data, tmp);
    const range = !isNaN(minValue) && !isNaN(maxValue) ? getLegendRange(minValue, maxValue, listColors.length) : [];
    return { polygonData: newData as any[], legendRange: range, hasValues: !(isNaN(minValue) && isNaN(maxValue)) };
  }, [drilledInto, data, featureLevel0, featureLevel1, props.settings?.colors]);

  // Draw (or redraw) the polygons.
  useEffect(() => {
    if (!map || polygonData.length == 0) {
      return undefined;
    }
    const collection = {
      type: 'FeatureCollection',
      features: polygonData.map((feature, i) => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          i,
          fill: !isNaN(feature.properties.neo_value)
            ? getColor(feature.properties.neo_value, legendRange, listColors)
            : NO_DATA_COLOR,
        },
      })),
    } as any;
    map.addSource(SOURCE, { type: 'geojson', data: collection });
    map.addLayer({
      id: FILL,
      type: 'fill',
      source: SOURCE,
      paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.8 },
    });
    map.addLayer({ id: OUTLINE, type: 'line', source: SOURCE, paint: { 'line-color': '#1f2021', 'line-width': 1 } });

    // Hover: the region's name or code, and its value.
    const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'nd-map-tooltip' });
    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = polygonData[e.features?.[0]?.properties?.i];
      if (!feature) {
        return;
      }
      const p = feature.properties;
      const name = p.REGION_NAME || p.name || p.COUNTRY_CODE || p.code || '';
      const value = feature.properties.neo_value;
      map.getCanvas().style.cursor = isDrillDownEnabled ? 'pointer' : '';
      tooltip
        .setLngLat(e.lngLat)
        .setText(value !== undefined && !isNaN(value) ? `${name}: ${value}` : name)
        .addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      tooltip.remove();
    };
    // Drill-down: show the regions of the clicked country and zoom to it.
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = polygonData[e.features?.[0]?.properties?.i];
      if (!isDrillDownEnabled || !feature) {
        return;
      }
      tooltip.remove();
      setDrilledInto(feature);
      const bounds = featureBounds(feature);
      if (bounds) {
        map.fitBounds(bounds, { padding: 30, maxZoom: 8 });
      }
    };
    map.on('mousemove', FILL, onMove);
    map.on('mouseleave', FILL, onLeave);
    map.on('click', FILL, onClick);
    return () => {
      map.off('mousemove', FILL, onMove);
      map.off('mouseleave', FILL, onLeave);
      map.off('click', FILL, onClick);
      tooltip.remove();
      [OUTLINE, FILL].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(SOURCE)) {
        map.removeSource(SOURCE);
      }
    };
  }, [map, polygonData, legendRange]);

  const resetButton = (
    <div className='nd-map-reset'>
      <FilledButton
        size='small'
        onClick={() => {
          setDrilledInto(undefined);
          map?.easeTo(WORLD_VIEW);
        }}
      >
        Reset View
      </FilledButton>
    </div>
  );

  const legend = (
    <div className='nd-map-legend' style={{ width: dimensions.width * 0.25 }}>
      <table>
        <tbody>
          {legendRange.map((from, i) => {
            let to = legendRange[i + 1];
            return (
              <tr key={i}>
                <td>
                  <i style={{ background: listColors[i] }} />
                </td>
                <td>
                  {abbreviateNumber(from, 2)}
                  {!isNaN(to) ? ` - ${abbreviateNumber(to, 2)}` : i > 0 ? '+' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {isDrillDownEnabled && drilledInto !== undefined ? resetButton : <></>}
      {isLegendEnabled && hasValues && legendRange.length > 0 ? legend : <></>}
    </>
  );
};

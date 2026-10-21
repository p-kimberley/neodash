import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import * as echarts from 'echarts/core';
import { MapChart } from 'echarts/charts';
import { TooltipComponent, VisualMapComponent } from 'echarts/components';
import { format as d3Format } from 'd3-format';
import { ChartProps } from '../../../../chart/Chart';
import { recordToNative } from '../../../../chart/ChartUtils';
import { NoDrawableDataErrorMessage } from '../../../../component/editor/CodeViewerComponent';
import { fetchMapData } from '../../../../config/MapConfig';
import { EChart } from '../../../../chart/echarts/EChart';
import { escapeHtml } from '../../../../chart/echarts/helpers';
import { schemeColors } from '../../../../chart/echarts/theme';
import { palettes } from '../../../../theme/palette';
import { getDashboardTheme } from '../../../../dashboard/DashboardSelectors';

echarts.use([MapChart, TooltipComponent, VisualMapComponent]);

const MAP_NAME = 'neodash-world';
// The "nivo" scheme of nivo's choropleth (its quantize colours differ from the categorical "nivo").
const NIVO_CHOROPLETH = ['#d76445', '#f47560', '#e8c1a0', '#97e3d5', '#61cdbb', '#00b0a7'];
const formatValue = d3Format('.2s');

// Mercator, as nivo's choropleth used (latitude clamped where the projection diverges).
const mercator = {
  project: ([lng, lat]: number[]) => {
    const clamped = Math.max(-85, Math.min(85, lat));
    return [(lng * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))];
  },
  unproject: ([x, y]: number[]) => [(x * 180) / Math.PI, ((2 * Math.atan(Math.exp(-y)) - Math.PI / 2) * 180) / Math.PI],
};

let registered: Promise<any> | undefined;
/** Loads the country shapes once and registers them with ECharts. */
const loadWorld = () => {
  registered ??= fetchMapData('world_polymap.json').then((geo) => {
    if (geo.features.length) {
      echarts.registerMap(MAP_NAME, geo as any);
    } else {
      registered = undefined;
    }
    return geo;
  });
  return registered;
};

/**
 * Choropleth world map: countries coloured by value (matched by ISO code), in equal-width buckets of
 * the colour scheme from 0 to the largest value. Settings keep their nivo-era names and defaults.
 */
const NeoChoroplethMapChart = (props: ChartProps) => {
  const { records, selection } = props;
  const mode = useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light';
  const [geo, setGeo] = useState<{ features: any[] } | undefined>(undefined);
  useEffect(() => {
    let active = true;
    loadWorld().then((g) => active && setGeo(g));
    return () => {
      active = false;
    };
  }, []);

  if (!selection || records == null || records.length == 0 || records[0].keys == null) {
    return <NoDrawableDataErrorMessage />;
  }

  const settings = props.settings ? props.settings : {};
  const marginRight = settings.marginRight ? settings.marginRight : 24;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 24;
  const marginTop = settings.marginTop ? settings.marginTop : 24;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 40;
  const interactive = settings.interactive !== undefined ? settings.interactive : true;
  const borderWidth = settings.borderWidth ? settings.borderWidth : 0;
  const legend = settings.legend !== undefined ? settings.legend : true;
  const colorScheme = settings.colors ? settings.colors : 'nivo';
  const projectionScale = settings.projectionScale ? settings.projectionScale : 100;
  const projectionTranslationX = settings.projectionTranslationX ? settings.projectionTranslationX : 0.5;
  const projectionTranslationY = settings.projectionTranslationY ? settings.projectionTranslationY : 0.5;
  const labelProperty: string = settings.labelProperty ? settings.labelProperty : 'properties.name';
  const matchAccessor: string = settings.matchAccessor ? settings.matchAccessor : 'iso_a3';

  // One value per country code. Codes are compared as text, so numeric ISO codes (iso_n3) match too.
  const data: { name: string; value: number }[] = [];
  records.forEach((row) => {
    try {
      const index = recordToNative(row.get(selection.index));
      const value = recordToNative(row.get(selection.value));
      if (index === null || index === undefined || index === '' || isNaN(value)) {
        return;
      }
      data.push({ name: `${index}`, value: Number(value) });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
  if (data.length == 0) {
    return <NoDrawableDataErrorMessage />;
  }
  if (!geo) {
    return <></>;
  }

  // Tooltip label from a feature property path such as "properties.name".
  const labelPath = labelProperty.split('.').filter((p) => p !== 'properties');
  const labelByCode = new Map<string, string>();
  geo.features.forEach((f) => {
    const code = f.properties?.[matchAccessor];
    const label = labelPath.reduce((v, key) => (v == null ? v : v[key]), f.properties);
    if (code !== undefined) {
      labelByCode.set(`${code}`, label !== undefined ? `${label}` : `${code}`);
    }
  });

  const colors = colorScheme === 'nivo' ? NIVO_CHOROPLETH : schemeColors(colorScheme);
  const max = Math.max(...data.map((d) => d.value));
  const c = palettes[mode];

  const option = {
    tooltip: interactive
      ? {
          trigger: 'item',
          formatter: (p) =>
            p.value === undefined || isNaN(p.value)
              ? escapeHtml(labelByCode.get(p.name) ?? p.name)
              : `${escapeHtml(labelByCode.get(p.name) ?? p.name)}: <b>${escapeHtml(formatValue(p.value))}</b>`,
        }
      : { show: false },
    visualMap: {
      type: 'piecewise',
      show: legend,
      min: 0,
      max: max || 1,
      splitNumber: colors.length,
      inRange: { color: colors },
      left: 20,
      bottom: 20,
      itemWidth: 18,
      itemHeight: 14,
      formatter: (low, high) => `${formatValue(low)} - ${formatValue(high)}`,
      textStyle: { color: c.chartText },
    },
    series: [
      {
        type: 'map',
        map: MAP_NAME,
        nameProperty: matchAccessor,
        projection: mercator,
        roam: false,
        silent: !interactive,
        left: marginLeft,
        right: marginRight,
        top: marginTop,
        bottom: marginBottom,
        zoom: projectionScale / 100,
        layoutCenter:
          projectionTranslationX !== 0.5 || projectionTranslationY !== 0.5
            ? [`${projectionTranslationX * 100}%`, `${projectionTranslationY * 100}%`]
            : undefined,
        layoutSize: projectionTranslationX !== 0.5 || projectionTranslationY !== 0.5 ? '100%' : undefined,
        label: { show: false },
        // Countries without a value use the surface shade.
        itemStyle: { areaColor: c.surfaceVariant, borderColor: c.borderStrong, borderWidth },
        emphasis: { label: { show: false }, itemStyle: { borderColor: c.text, borderWidth: Math.max(1, borderWidth) } },
        select: { disabled: true },
        data,
      },
    ],
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      <EChart option={option} />
    </div>
  );
};

export default NeoChoroplethMapChart;

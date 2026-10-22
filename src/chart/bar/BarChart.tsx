import React, { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { EChart } from '../echarts/EChart';
import { chartGrid, compactNumber, hasCustomMargins, escapeHtml, labelOnColor, tooltipRow } from '../echarts/helpers';
import { isDefaultScheme, schemeColors, useChartMode } from '../echarts/theme';
import { palettes } from '../../theme/palette';
import { NoDrawableDataErrorMessage } from '../../component/editor/CodeViewerComponent';
import { evaluateRulesOnDict, useStyleRules } from '../../extensions/styling/StyleRuleEvaluator';
import { ChartProps } from '../Chart';
import { convertRecordObjectToString, recordToNative } from '../ChartUtils';
import { extensionEnabled } from '../../utils/ReportUtils';
import { getPageNumbersAndNamesList, getRule, performActionOnElement } from '../../extensions/advancedcharts/Utils';
import { getOriginalRecordForBarClick } from './util';

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent]);

const NeoBarChart = (props: ChartProps) => {
  const { records, selection } = props;

  const [keys, setKeys] = React.useState<string[]>([]);
  const [data, setData] = React.useState<Record<string, any>[]>([]);
  const settings = props.settings ? props.settings : {};
  const marginRight = settings.marginRight ? settings.marginRight : 24;
  const marginLeft = settings.marginLeft ? settings.marginLeft : 50;
  const customDimensions = settings.customDimensions ? settings.customDimensions : false;
  const legendWidth = settings.legendWidth ? settings.legendWidth : 128;
  const marginTop = settings.marginTop ? settings.marginTop : 24;
  const marginBottom = settings.marginBottom ? settings.marginBottom : 30;
  const legend = settings.legend ? settings.legend : false;
  // Unset, category labels are tilted only when they don't fit side by side (see below).
  const labelRotationSetting = settings.labelRotation != undefined ? settings.labelRotation : undefined;
  const barWidth = settings.barWidth ? settings.barWidth : 10;
  const padding = settings.padding ? settings.padding : 0.25;
  const innerPadding = settings.innerPadding ? settings.innerPadding : 0;
  const expandHeightForLegend = settings.expandHeightForLegend ? settings.expandHeightForLegend : false;
  const displayYAxis = settings.displayYAxis ?? true;
  const displayYGridLines = settings.displayYGridLines ?? true;

  const actionsRules =
    extensionEnabled(props.extensions, 'actions') && props.settings && props.settings.actionsRules
      ? props.settings.actionsRules
      : [];
  const pageNames = getPageNumbersAndNamesList();

  const legendPosition = settings.legendPosition ? settings.legendPosition : 'Vertical';

  const labelSkipWidth = settings.labelSkipWidth ? settings.labelSkipWidth : 0;
  const labelSkipHeight = settings.labelSkipHeight ? settings.labelSkipHeight : 0;
  const enableLabel = settings.barValues ? settings.barValues : false;
  const positionLabel = settings.positionLabel ? settings.positionLabel : 'off';

  // TODO: we should make all these defaults be loaded from the config file.
  const layout = settings.layout ? settings.layout : 'vertical';
  const colorScheme = settings.colors;
  const mode = useChartMode();
  const [chartWidth, setChartWidth] = React.useState(0);
  const groupMode = settings.groupMode ? settings.groupMode : 'stacked';
  const valueScale = settings.valueScale ? settings.valueScale : 'linear';
  const minValue = settings.minValue ? settings.minValue : 'auto';
  const maxValue = settings.maxValue ? settings.maxValue : 'auto';
  const styleRules = useStyleRules(
    extensionEnabled(props.extensions, 'styling'),
    settings.styleRules,
    props.getGlobalParameter
  );
  // For adaptable item length in the legend

  // Populates data with record information
  useEffect(() => {
    let newKeys = {};
    let newData: Record<string, unknown>[] = records
      .reduce((data: Record<string, unknown>[], row: Record<string, any>) => {
        try {
          if (!selection || !selection.index || !selection.value) {
            return data;
          }
          const index = convertRecordObjectToString(row.get(selection.index));
          const idx = data.findIndex((item) => item.index === index);

          const key = selection.key !== '(none)' ? recordToNative(row.get(selection.key)) : selection.value;
          const rawValue = recordToNative(row.get(selection.value));
          const value = rawValue !== null ? rawValue : 0.0000001;
          if (isNaN(value)) {
            return data;
          }
          newKeys[key] = true;

          if (idx > -1) {
            data[idx][key] = value;
          } else {
            data.push({ index, [key]: value });
          }

          return data;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
          return [];
        }
      }, [])
      .map((row) => {
        Object.keys(newKeys).forEach((key) => {
          // eslint-disable-next-line no-prototype-builtins
          if (!row.hasOwnProperty(key)) {
            row[key] = 0;
          }
        });
        return row;
      });
    setKeys(Object.keys(newKeys));
    setData(newData);
  }, [selection]);

  if (!selection || props.records == null || props.records.length == 0 || props.records[0].keys == null) {
    return <NoDrawableDataErrorMessage />;
  }

  // Function to calculate the conditional margin bottom
  function calculateMarginBottom(legendPosition, showLegend, legendWidth, marginBottom) {
    // Check if legendPosition is 'Horizontal'
    if (legendPosition === 'Horizontal') {
      // Calculate margin based on whether the legend is shown
      return showLegend ? legendWidth * 0.3 + marginBottom + 50 : legendWidth * 0.3 + marginBottom;
    }
    // Return the default marginBottom if legendPosition is not 'Horizontal'
    return marginBottom;
  }

  // Using the function in your code
  const conditionalMarginBottom = calculateMarginBottom(legendPosition, settings.legend, legendWidth, marginBottom);

  // Function to call from BarComponent. Conducts necessary logic for Report Action.
  const handleBarClick = (e) => {
    // Get the original record that was used to draw this bar (or a group in a bar).
    const record = getOriginalRecordForBarClick(e, records, selection);

    // If there's a record, check if there are any rules assigned to each of the fields (columns).
    if (record) {
      Object.keys(record).forEach((key) => {
        let rules = getRule({ field: key, value: record[key] }, actionsRules, 'Click');
        // If there is a rule assigned, run the rule with the specified field and value retrieved from the record.
        rules?.forEach((rule) => {
          const ruleField = rule.field;
          const ruleValue = record[rule.value];
          performActionOnElement(
            { field: ruleField, value: ruleValue },
            actionsRules,
            { ...props, pageNames: pageNames },
            'Click',
            'bar'
          );
        });
      });
    }
  };

  // Function to calculate the right margin
  function calculateRightMargin(legendPosition, legend, legendWidth, marginRight) {
    if (legendPosition === 'Vertical') {
      return legend ? legendWidth + marginRight : marginRight;
    }
    return marginRight;
  }

  // Original margin function, refactored
  const margin = () => {
    return {
      top: marginTop,
      right: calculateRightMargin(legendPosition, legend, legendWidth, marginRight),
      bottom: conditionalMarginBottom,
      left: marginLeft,
    };
  };

  const chartColorsByScheme = schemeColors(colorScheme, mode);
  const surface = palettes[mode].surface;
  // Compute bar color based on rules - overrides default color scheme completely.
  const getBarColor = (bar) => {
    // With several series (grouped / stacked bars), colour by series so bars match the legend. A single
    // series is one colour with the default scheme (bar length already tells the bars apart); a chosen
    // scheme keeps one colour per bar, as before.
    let colorIndex =
      keys.length > 1 ? Math.max(0, keys.indexOf(bar.id)) : isDefaultScheme(colorScheme) ? 0 : (bar.index ?? 0);
    if (colorIndex >= chartColorsByScheme.length) {
      colorIndex %= chartColorsByScheme.length;
    }

    if (!props.selection) {
      return chartColorsByScheme[colorIndex];
    }

    const dict = {};
    dict[selection.index] = bar.indexValue;
    dict[selection.value] = bar.value;
    dict[selection.key] = bar.id;

    const validRuleIndex = evaluateRulesOnDict(dict, styleRules, ['bar color']);
    if (validRuleIndex !== -1) {
      return styleRules[validRuleIndex].customizationValue;
    }

    return chartColorsByScheme[colorIndex];
  };

  // Creates enough width to ensure chart doesn't get cut off
  const adaptableWidth =
    marginLeft +
    marginRight +
    data.length * barWidth * 4 +
    (data.length - 1) * 4 +
    (data.length - 1) * innerPadding * 4;

  // Height of each legend item
  const itemHeight = 24.5;

  // Function to handle width logic, including scrollbar logic
  function calculateWidth(customDimensions, legendPosition, adaptableWidth, legendWidth, data, barWidth) {
    if (!customDimensions) {
      return '100%';
    }

    if (legendPosition === 'Horizontal') {
      const horizontalLegendWidth = legendWidth * data.length + 200;
      return adaptableWidth > horizontalLegendWidth ? adaptableWidth : horizontalLegendWidth;
    }

    return barWidth * 5 * data.length + legendWidth;
  }

  // Container to make the chart scroll horizontally
  const scrollableWrapperStyle: React.CSSProperties = {
    width: calculateWidth(customDimensions, legendPosition, adaptableWidth, legendWidth, data, barWidth),
    height: expandHeightForLegend ? itemHeight * data.length + conditionalMarginBottom : '100%',
    whiteSpace: 'nowrap',
  };

  // Container for scrolling container to scroll in
  const barChartStyle: React.CSSProperties = customDimensions
    ? {
        width: '100%',
        overflowX: 'auto',
        overflowY: 'auto',
        height: '100%',
      }
    : {
        width: '100%',
        height: '100%',
        overflowY: 'auto',
      };

  // ECharts option. Vertical bars put categories on the x axis; horizontal ones on the y axis.
  const horizontal = layout === 'horizontal';
  const stacked = groupMode == 'stacked';
  const categories = data.map((row) => row.index);
  // Unset, vertical bars' category labels stay level while they fit their slot, and tilt when they don't.
  const longestLabel = Math.max(0, ...categories.map((c) => `${c}`.length));
  const slotWidth = ((chartWidth || 600) - 80) / Math.max(1, categories.length);
  const labelRotation = labelRotationSetting ?? (longestLabel * 6.5 + 8 > slotWidth ? 30 : 0);
  const option = (() => {
    const labelPosition =
      { off: 'inside', top: horizontal ? 'right' : 'top', bottom: horizontal ? 'insideLeft' : 'insideBottom' }[
        positionLabel
      ] ?? 'inside';
    // Bars end in a 4px rounded cap at their value end (stacks: only the outermost segment), and touching
    // bars or segments are parted by a 2px gap in the card's colour.
    const endRadius = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
    const series = keys.map((key, keyIndex) => {
      const rounded = !stacked || keyIndex === keys.length - 1;
      const itemStyle = { borderRadius: rounded ? endRadius : 0, borderColor: surface, borderWidth: 1 };
      return {
        type: 'bar',
        name: key,
        // The series colour (for the legend); bars may still be coloured individually below.
        itemStyle: { ...itemStyle, color: chartColorsByScheme[keyIndex % chartColorsByScheme.length] },
        stack: stacked ? 'total' : undefined,
        barCategoryGap: `${Math.round(padding * 100)}%`,
        // nivo's innerPadding was pixels between the bars of a group; ECharts' gap is a percentage.
        barGap: innerPadding ? `${Math.min(100, innerPadding * 10)}%` : '0%',
        barMaxWidth: 24,
        emphasis: { focus: keys.length > 1 ? 'series' : 'none' },
        data: data.map((row, i) => {
          const color = getBarColor({ id: key, index: i, indexValue: row.index, value: row[key] });
          return {
            value: row[key],
            itemStyle: { ...itemStyle, color },
            label: {
              show: enableLabel,
              position: labelPosition,
              // Inside a bar: white or ink, whichever reads on it; outside: secondary text.
              color: labelPosition.startsWith('inside') ? labelOnColor(color) : palettes[mode].textSecondary,
              fontSize: 11,
              formatter: (p) => compactNumber(p.value),
            },
          };
        }),
        labelLayout: { hideOverlap: Boolean(labelSkipWidth || labelSkipHeight) },
      };
    });
    const categoryAxis = {
      type: 'category',
      data: categories,
      // nivo's tick rotation is clockwise; ECharts' is anticlockwise.
      axisLabel: horizontal
        ? { show: displayYAxis, width: 140, overflow: 'truncate' }
        : {
            // Every category gets its label: level ones are cut to their slot, tilted ones to 120px.
            rotate: -labelRotation,
            interval: 0,
            width: labelRotation ? 120 : Math.max(32, slotWidth - 8),
            overflow: 'truncate',
          },
      axisLine: { show: horizontal ? displayYAxis : true },
    };
    const valueAxis = {
      type: valueScale === 'symlog' ? 'log' : 'value',
      min: minValue === 'auto' ? undefined : minValue,
      max: maxValue === 'auto' ? undefined : maxValue,
      splitLine: { show: displayYGridLines },
      axisLabel: horizontal
        ? { rotate: labelRotationSetting ? -labelRotationSetting : 0, formatter: compactNumber }
        : { show: displayYAxis, formatter: compactNumber },
    };
    const verticalLegend = legend && legendPosition === 'Vertical';
    const horizontalLegend = legend && legendPosition === 'Horizontal';
    const legacy = margin();
    const grid = chartGrid(
      settings,
      { top: legacy.top, right: marginRight, bottom: legacy.bottom, left: legacy.left },
      verticalLegend ? { right: legendWidth } : horizontalLegend && !hasCustomMargins(settings) ? { bottom: 28 } : {}
    );
    return {
      animation: false,
      grid,
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      // Several series: hovering a category shows all its bars; one series: the bar itself.
      tooltip:
        keys.length > 1
          ? {
              trigger: 'axis',
              axisPointer: { type: 'shadow' },
              formatter: (items) =>
                `${escapeHtml(items[0]?.name)}<br/>${items
                  .map((p) => tooltipRow(p.color, p.seriesName, p.value))
                  .join('<br/>')}`,
            }
          : {
              trigger: 'item',
              formatter: (p) => `${escapeHtml(p.name)}<br/>${tooltipRow(p.color, p.seriesName, p.value)}`,
            },
      legend: legend
        ? horizontalLegend
          ? { show: true, type: 'scroll', orient: 'horizontal', bottom: 4, left: 'center' }
          : {
              show: true,
              type: 'scroll',
              orient: 'vertical',
              right: 8,
              top: 'middle',
              textStyle: { width: legendWidth - 30, overflow: 'truncate' },
            }
        : { show: false },
      series,
    };
  })();

  // Clicks run the report's actions, using the record behind the clicked bar.
  const onClick = (p) => {
    const row = data[p.dataIndex];
    handleBarClick({ indexValue: p.name, id: p.seriesName, value: p.value, data: row });
  };

  return (
    <div style={barChartStyle}>
      <div style={scrollableWrapperStyle}>
        <EChart option={option} onClick={onClick} onWidth={setChartWidth} />
      </div>
    </div>
  );
};

export default NeoBarChart;

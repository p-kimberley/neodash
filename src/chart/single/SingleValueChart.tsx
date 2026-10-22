import React from 'react';
import { ChartProps } from '../Chart';
import { renderValueByType } from '../../report/ReportRecordProcessing';
import { evaluateRulesOnNeo4jRecord } from '../../extensions/styling/StyleRuleEvaluator';
import YAML from 'yaml';
import { extensionEnabled } from '../../utils/ReportUtils';
import { CARD_HEADER_HEIGHT } from '../../config/CardConfig';

/**
 * Renders Neo4j records as their JSON representation.
 */
const NeoSingleValueChart = (props: ChartProps) => {
  const { records } = props;
  const fontSize = props.settings && props.settings.fontSize ? props.settings.fontSize : 64;
  const color = props.settings && props.settings.color ? props.settings.color : 'NO-OP';
  const format = props.settings && props.settings.format ? props.settings.format : 'auto';
  const textAlign = props.settings && props.settings.textAlign ? props.settings.textAlign : 'left';
  const verticalAlign = props.settings && props.settings.verticalAlign ? props.settings.verticalAlign : 'top';
  const monospace = props.settings && props.settings.monospace !== undefined ? props.settings.monospace : false;
  const styleRules =
    extensionEnabled(props.extensions, 'styling') && props.settings && props.settings.styleRules
      ? props.settings.styleRules
      : [];

  const dimensions = props.dimensions ? props.dimensions : { width: 100, height: 100 };
  const reportHeight = dimensions.height - fontSize;

  // 0 and false are values too, so only a missing value shows as blank.
  const first = records?.[0]?._fields?.[0];
  const value = first === undefined || first === null ? '' : first;

  const createDisplayValue = (value) => {
    if (format == 'json') {
      return JSON.stringify(value, null, 2);
    }
    if (format == 'yml') {
      return YAML.stringify(value, null, 2);
    }
    return renderValueByType(value);
  };

  const displayValue = createDisplayValue(value);
  // Shrink single-line values that would not fit the card's width (roughly 0.6em per character),
  // instead of letting them overflow. Values that fit keep the configured size.
  const longestLine = Math.max(
    1,
    ...String(displayValue)
      .split(/\r?\n/)
      .map((line) => line.length)
  );
  const fittingSize = Math.floor((dimensions.width - 40) / (longestLine * 0.6));
  const isText = typeof displayValue === 'string' || typeof displayValue === 'number';
  const effectiveFontSize = isText ? Math.max(12, Math.min(fontSize, fittingSize)) : fontSize;

  return (
    <div
      style={{
        height: reportHeight,
        lineHeight: `${reportHeight}px`,
        position: 'relative',
        textAlign: textAlign,
        marginLeft: '15px',
        marginRight: '15px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          verticalAlign: verticalAlign,
          whiteSpace: 'pre',
          marginTop: verticalAlign == 'middle' ? `-${CARD_HEADER_HEIGHT}px` : '0px', // go to a "true middle", subtract header height.
          fontSize: effectiveFontSize,
          fontFamily: monospace ? 'monospace' : 'inherit',
          lineHeight: `${effectiveFontSize + 8}px`,
          color: evaluateRulesOnNeo4jRecord(records[0], 'text color', color, styleRules),
        }}
      >
        {displayValue}
      </span>
    </div>
  );
};

export default NeoSingleValueChart;

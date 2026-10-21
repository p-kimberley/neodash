import React from 'react';
import { ChartProps } from '../Chart';
import YAML from 'yaml';
import CodeBlock from '../../component/editor/CodeBlock';

/**
 * Renders Neo4j records as their JSON (or YAML) representation.
 */
const NeoJSONChart = (props: ChartProps) => {
  const { records, settings } = props;
  const type = settings && settings.format ? settings.format : 'json';
  const value = type == 'json' ? JSON.stringify(records, null, 2) : YAML.stringify(records, null, 2);
  return (
    <CodeBlock
      value={value}
      language={type == 'json' ? 'json' : 'yaml'}
      placeholder='Query output should be rendered here.'
      className='nd-code-block-report'
    />
  );
};

export default NeoJSONChart;

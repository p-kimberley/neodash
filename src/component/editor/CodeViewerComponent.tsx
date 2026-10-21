import React from 'react';
import CodeBlock from './CodeBlock';

/**
 * Returns a static, wrapped text block (messages, raw values), without line numbers.
 */
const NeoCodeViewerComponent = ({ value = '', placeholder = '' }) => {
  return (
    <div style={{ overflowY: 'auto', margin: '4px 12px', height: '100%' }}>
      <CodeBlock value={value} placeholder={placeholder} lineNumbers={false} wrap />
    </div>
  );
};

export const NoDrawableDataErrorMessage = () => {
  return (
    <NeoCodeViewerComponent
      value={
        'Data was returned, but it can not be visualized.\n\n' +
        'This could have one of the following causes:\n' +
        '- a numeric value field was selected, but no numeric values were returned. \n' +
        '- a numeric value field was selected, but only zeroes were returned.\n' +
        '- an array field was selected, but no array was returned.\n' +
        '- Your visualization expects nodes/relationships, but none were returned.\n\n' +
        'View the NeoDash documentation for more information.'
      }
    />
  );
};

export default NeoCodeViewerComponent;

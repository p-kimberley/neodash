import React from 'react';
import { XMarkIconOutline } from '@neo4j-ndl/react/icons';
import { CleanIconButton } from '@neo4j-ndl/react';

/**
 * Returns a button to delete a property entry from the table inside the GraphChartEditModal.
 */
export const DeletePropertyButton = ({ onClick, key }) => {
  return (
    <CleanIconButton
      description='Delete'
      key={key}
      size='medium'
      style={{
        background: 'white',
        color: 'grey',
        marginTop: '-6px',
        marginLeft: '20px',
        width: '26px',
        height: '26px',
        minHeight: '26px',
      }}
      onClick={onClick}
    >
      <XMarkIconOutline key={`icon${key}`} />
    </CleanIconButton>
  );
};

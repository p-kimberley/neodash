import React from 'react';
import { XMarkIconOutline } from '@neo4j-ndl/react/icons';
import { CleanIconButton } from '@neo4j-ndl/react';

/**
 * Returns a button to delete a property entry from the table inside the GraphChartEditModal.
 */
export const DeletePropertyButton = ({ onClick, key }) => {
  return (
    <CleanIconButton description='Delete property' key={key} size='small' onClick={onClick}>
      <XMarkIconOutline key={`icon${key}`} />
    </CleanIconButton>
  );
};

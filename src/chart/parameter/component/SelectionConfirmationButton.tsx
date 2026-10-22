import React from 'react';

import { PlayIconOutline } from '@neo4j-ndl/react/icons';
import { CleanIconButton } from '@neo4j-ndl/react';
/**
 * Returns a button to confirm a selection entry from the parameter selector.
 */
export const SelectionConfirmationButton = ({ onClick }) => {
  return (
    <CleanIconButton description={'Confirm'} className='logo-btn n-p-1' size='large' onClick={onClick}>
      <PlayIconOutline className='header-icon' />
    </CleanIconButton>
  );
};

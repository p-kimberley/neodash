import { IconButton } from '@neo4j-ndl/react';
import { ArrowPathIconOutline } from '@neo4j-ndl/react/icons';
import React from 'react';

const RefreshButton = ({ onClick }) => (
  <IconButton
    description='Reset'
    onClick={() => onClick()}
    className='n-z-10'
    style={{
      opacity: 0.6,
      bottom: 12,
      right: 12,
      position: 'absolute',
      borderRadius: '12px',
    }}
    size={'small'}
  >
    <ArrowPathIconOutline />
  </IconButton>
);

export default RefreshButton;

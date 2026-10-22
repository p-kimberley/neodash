import React from 'react';
import { LoadingSpinner } from '@neo4j-ndl/react';

/** Shown in a report while the server's language model writes its query. */
export const TEXT2CYPHER_LOADING_ICON = (
  <div className='centered n-flex n-flex-col n-items-center n-gap-token-8' role='status'>
    <LoadingSpinner size='medium' />
    <span style={{ fontSize: 12 }}>Writing the query…</span>
  </div>
);

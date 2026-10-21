import React from 'react';
import { LoadingSpinner } from '@neo4j-ndl/react';
import { APP_NAME, markText } from '../../config/ApplicationConfig';

/** Shown while NeoDash checks who is signed in and opens the first view. */
export const NeoDashboardPlaceholder = () => {
  return (
    <>
      <header className='app-header'>
        <span className='app-header-brand' style={{ cursor: 'default' }}>
          <span className='app-header-mark' aria-hidden>
            {markText()}
          </span>
          <span>{APP_NAME}</span>
        </span>
      </header>
      <div
        className='n-flex n-items-center n-justify-center'
        style={{ height: 'calc(100vh - var(--app-header-height))' }}
      >
        <LoadingSpinner size='large' />
      </div>
    </>
  );
};

export default NeoDashboardPlaceholder;

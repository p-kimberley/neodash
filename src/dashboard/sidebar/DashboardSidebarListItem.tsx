import { CleanIconButton, OutlinedButton, TextButton } from '@neo4j-ndl/react';
import React from 'react';
import { EllipsisVerticalIconOutline } from '@neo4j-ndl/react/icons';
import { Tip } from '../../component/text/Tip';
import { NEODASH_VERSION } from '../DashboardReducer';

export const DashboardSidebarListItem = ({ title, selected, readonly, saved, version, onSelect, onSettingsOpen }) => {
  // The open dashboard is outlined; the others are plain text buttons.
  const ItemButton = selected ? OutlinedButton : TextButton;
  return (
    <div className='nd-dashboard-panel-header'>
      <div className='nd-dashboard-panel-row'>
        <Tip title={version !== NEODASH_VERSION ? `Old version: v${version}` : ''} placement='right'>
          {/* A span takes the tooltip's props (the design system's buttons don't pass them through). */}
          <span className='nd-dashboard-panel-row-title'>
            <ItemButton
              size='medium'
              variant={selected ? 'primary' : 'neutral'}
              style={{
                width: '100%',
                whiteSpace: 'nowrap',
                overflowX: 'clip',
                justifyContent: 'left',
                paddingLeft: '5px',
                paddingRight: '5px',
              }}
              onClick={() => {
                onSelect();
              }}
              htmlAttributes={{ 'aria-label': 'dashboard', 'aria-current': selected ? 'true' : undefined }}
            >
              {saved == false ? <b>(Draft)</b> : <></>}
              {title ? title : '(no title)'}
            </ItemButton>
          </span>
        </Tip>
        {readonly !== true ? (
          <CleanIconButton
            description={saved ? 'Dashboard actions' : 'Dashboard actions (unsaved changes)'}
            size='small'
            onClick={(event) => onSettingsOpen(event)}
          >
            <EllipsisVerticalIconOutline style={{ color: saved ? undefined : 'var(--theme-color-warning-text)' }} />
          </CleanIconButton>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
};

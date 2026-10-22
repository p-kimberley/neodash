import { CleanIconButton, OutlinedButton, TextButton } from '@neo4j-ndl/react';
import React from 'react';
import { EllipsisVerticalIconOutline } from '@neo4j-ndl/react/icons';
import Tooltip from '@mui/material/Tooltip';
import { NEODASH_VERSION } from '../DashboardReducer';

export const DashboardSidebarListItem = ({ title, selected, readonly, saved, version, onSelect, onSettingsOpen }) => {
  // The open dashboard is outlined; the others are plain text buttons.
  const ItemButton = selected ? OutlinedButton : TextButton;
  return (
    <div className='nd-dashboard-panel-header'>
      <div style={{ display: 'contents', width: '100%' }}>
        <Tooltip
          title={version !== NEODASH_VERSION ? `Old version: v${version}` : ''}
          aria-label='old version'
          disableInteractive
        >
          {/* A span takes the tooltip's props (the design system's buttons don't pass them through). */}
          <span>
            <ItemButton
              size='medium'
              variant={selected ? 'primary' : 'neutral'}
              style={{
                width: '240px',
                whiteSpace: 'nowrap',
                overflowX: 'clip',
                justifyContent: 'left',
                marginRight: '10px',
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
        </Tooltip>
        {readonly !== true ? (
          <CleanIconButton
            description={saved ? 'Dashboard actions' : 'Dashboard actions (unsaved changes)'}
            size='small'
            style={{
              justifyContent: 'left',
              paddingLeft: '0px',
              marginRight: '10px',
            }}
            onClick={(event) => onSettingsOpen(event)}
          >
            <EllipsisVerticalIconOutline
              style={{
                float: 'right',
                marginRight: '-6px',
                color: saved ? undefined : 'var(--theme-color-warning-text)',
              }}
              className='btn-icon-base-r'
            />
          </CleanIconButton>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
};

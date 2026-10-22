import React from 'react';
import { TextareaAutosize } from '@mui/material';
import { Dialog, FilledButton } from '@neo4j-ndl/react';
import { TrashIconOutline, PlayIconSolid } from '@neo4j-ndl/react/icons';
import { createUUID } from '../utils/uuid';

export const NeoUpgradeOldDashboardModal = ({ open, text, clearOldDashboard, loadDashboard }) => {
  return (
    <div>
      <Dialog size='large' isOpen={open}>
        <Dialog.Header>Old Dashboard Found</Dialog.Header>
        <Dialog.Content>
          We've found a dashboard built with an old version of NeoDash. Would you like to attempt an upgrade, or start
          from scratch?
          <br />
          <b>Make sure you back up this dashboard first!</b>
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <FilledButton
              onClick={() => {
                localStorage.removeItem('neodash-dashboard');
                clearOldDashboard();
              }}
              style={{ marginRight: '20px' }}
              isFloating
              variant='danger'
            >
              Delete old dashboard
              <TrashIconOutline className='btn-icon-base-r' />
            </FilledButton>
            <FilledButton
              onClick={() => {
                localStorage.removeItem('neodash-dashboard');
                loadDashboard(createUUID(), text);
                clearOldDashboard();
              }}
              style={{ marginRight: '6px' }}
              size='large'
              isFloating
            >
              Upgrade
              <PlayIconSolid className='btn-icon-base-r' />
            </FilledButton>
          </div>
          <TextareaAutosize
            style={{ minHeight: '200px', width: '100%', border: '1px solid lightgray' }}
            className={'textinput-linenumbers'}
            onChange={() => {}}
            value={text ? text : ''}
            aria-label=''
            placeholder=''
          />
        </Dialog.Content>
      </Dialog>
    </div>
  );
};

export default NeoUpgradeOldDashboardModal;

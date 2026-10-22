import React from 'react';
import { DatabasePlusIcon, BackspaceIconOutline } from '@neo4j-ndl/react/icons';
import { Dialog, FilledButton, OutlinedButton } from '@neo4j-ndl/react';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarSaveModal = ({ open, onConfirm, handleClose, overwrite }) => {
  return (
    <Dialog size='small' isOpen={open} onClose={handleClose}>
      <Dialog.Header>Save dashboard</Dialog.Header>
      <Dialog.Content>
        This will <b>{overwrite ? 'overwrite the saved version' : 'save'}</b> of this dashboard. Everyone who opens it
        will see your changes.
      </Dialog.Content>
      <Dialog.Actions>
        <OutlinedButton onClick={handleClose} style={{ float: 'right' }} isFloating>
          <BackspaceIconOutline className='btn-icon-base-l' aria-label={'save back'} />
          Cancel
        </OutlinedButton>
        <FilledButton
          onClick={() => {
            onConfirm();
            handleClose();
          }}
          style={{ float: 'right', marginRight: '10px' }}
          isFloating
        >
          Save
          <DatabasePlusIcon className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDashboardSidebarSaveModal;

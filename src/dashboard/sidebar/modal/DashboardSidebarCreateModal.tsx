import React from 'react';
import { Dialog, OutlinedButton, FilledButton } from '@neo4j-ndl/react';
import { BackspaceIconOutline, ExclamationTriangleIconOutline } from '@neo4j-ndl/react/icons';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarCreateModal = ({ open, onConfirm, handleClose }) => {
  return (
    <Dialog size='small' isOpen={open == true} onClose={handleClose}>
      <Dialog.Header>Discard Draft?</Dialog.Header>
      <Dialog.Subtitle>
        Creating a new dashboard will delete your current draft. Save the draft first to ensure your dashboard is
        stored.
      </Dialog.Subtitle>
      <Dialog.Actions>
        <FilledButton
          onClick={() => {
            handleClose();
          }}
          style={{ float: 'right' }}
        >
          <BackspaceIconOutline className='btn-icon-base-l' />
          Cancel
        </FilledButton>
        <OutlinedButton
          onClick={() => {
            onConfirm();
            handleClose();
          }}
          style={{ float: 'right', marginRight: '5px' }}
          variant='danger'
        >
          Continue
          <ExclamationTriangleIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDashboardSidebarCreateModal;

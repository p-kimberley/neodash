import React from 'react';
import { FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import { BackspaceIconOutline, TrashIconSolid } from '@neo4j-ndl/react/icons';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarDeleteModal = ({ open, title, onConfirm, handleClose }) => {
  return (
    <Dialog size='small' isOpen={open == true} onClose={handleClose}>
      <Dialog.Header>Delete Dashboard '{title}'?</Dialog.Header>
      <Dialog.Subtitle>
        Are you sure you want to delete this dashboard? <br /> This action cannot be undone.
      </Dialog.Subtitle>
      <Dialog.Actions>
        <OutlinedButton
          onClick={() => {
            handleClose();
          }}
          style={{ float: 'right' }}
        >
          <BackspaceIconOutline className='btn-icon-base-l' />
          Cancel
        </OutlinedButton>
        <FilledButton
          onClick={() => {
            onConfirm();
            handleClose();
          }}
          style={{ float: 'right', marginRight: '5px' }}
          variant='danger'
        >
          Delete
          <TrashIconSolid className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDashboardSidebarDeleteModal;

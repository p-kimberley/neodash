import React from 'react';
import { Dialog, FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { BackspaceIconOutline, TrashIconSolid } from '@neo4j-ndl/react/icons';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDeletePageModal = ({ modalOpen, onRemove, handleClose }) => {
  return (
    <Dialog size='small' isOpen={modalOpen == true} onClose={handleClose}>
      <Dialog.Header>Delete page?</Dialog.Header>
      <Dialog.Subtitle>Are you sure you want to remove this page? This cannot be undone.</Dialog.Subtitle>
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
            onRemove();
            handleClose();
          }}
          style={{ float: 'right', marginRight: '5px' }}
          variant='danger'
        >
          Remove
          <TrashIconSolid className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDeletePageModal;

import React from 'react';
import { Dialog, FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { BackspaceIconOutline, TrashIconOutline } from '@neo4j-ndl/react/icons';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarLoadModal = ({ open, onConfirm, handleClose }) => {
  return (
    <Dialog size='small' isOpen={open == true} onClose={handleClose}>
      <Dialog.Header>Discard Draft?</Dialog.Header>
      <Dialog.Subtitle>
        You are discarding your current draft dashboard.
        <br />
        <b>Your draft will not be recoverable.</b>
      </Dialog.Subtitle>
      <Dialog.Actions>
        <OutlinedButton
          onClick={() => {
            handleClose();
          }}
          style={{ float: 'right' }}
        >
          <BackspaceIconOutline className='btn-icon-base-l' />
          Keep
        </OutlinedButton>
        <FilledButton
          onClick={() => {
            onConfirm();
            handleClose();
          }}
          style={{ float: 'right', marginRight: '5px' }}
          variant='danger'
        >
          Discard
          <TrashIconOutline className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDashboardSidebarLoadModal;

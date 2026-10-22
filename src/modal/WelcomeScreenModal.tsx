import React from 'react';
import { Tooltip } from '@mui/material';
import { Dialog, TextLink, FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { BoltIconSolid, BackspaceIconOutline, PlayIconSolid } from '@neo4j-ndl/react/icons';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoWelcomeScreenModal = ({
  welcomeScreenOpen,
  setWelcomeScreenOpen,
  hasCachedDashboard,
  hasNeo4jDesktopConnection,
  createConnectionFromDesktopIntegration,
  resetDashboard,
  onConnectionModalOpen,
  onAboutModalOpen,
}) => {
  const [promptOpen, setPromptOpen] = React.useState(false);
  const handleOpen = () => {
    setWelcomeScreenOpen(true);
  };
  const handleClose = () => {
    setWelcomeScreenOpen(false);
  };
  const handlePromptOpen = () => {
    setPromptOpen(true);
  };
  const handlePromptClose = () => {
    setPromptOpen(false);
  };

  return (
    <div>
      <Dialog size='small' isOpen={welcomeScreenOpen} hasDisabledCloseButton>
        <Dialog.Header>
          NeoDash - Neo4j Dashboard Builder
          <BoltIconSolid className='icon-base' style={{ float: 'right', color: 'gold' }} />
        </Dialog.Header>
        <Dialog.Content>
          <Tooltip title='Connect to Neo4j and create a new dashboard.' aria-label='create' disableInteractive>
            <span>
              <OutlinedButton
                onClick={() => {
                  if (hasCachedDashboard) {
                    handlePromptOpen();
                    handleClose();
                  } else {
                    onConnectionModalOpen();
                    handleClose();
                  }
                }}
                style={{ marginTop: '10px', width: '100%' }}
                size='large'
              >
                New Dashboard
              </OutlinedButton>
            </span>
          </Tooltip>

          <Tooltip title='Load the existing dashboard from cache (if it exists).' aria-label='load' disableInteractive>
            {hasCachedDashboard ? (
              <OutlinedButton
                onClick={() => {
                  handleClose();
                  onConnectionModalOpen();
                }}
                style={{ marginTop: '10px', width: '100%' }}
                size='large'
              >
                Existing Dashboard
              </OutlinedButton>
            ) : (
              <OutlinedButton isDisabled style={{ marginTop: '10px', width: '100%' }} size='large' variant='neutral'>
                Existing Dashboard
              </OutlinedButton>
            )}
          </Tooltip>
          {hasNeo4jDesktopConnection ? (
            <Tooltip title='Connect to an active database in Neo4j Desktop.' aria-label='connect' disableInteractive>
              <span>
                <OutlinedButton
                  onClick={() => {
                    handleClose();
                    createConnectionFromDesktopIntegration();
                  }}
                  style={{ marginTop: '10px', width: '100%' }}
                  size='large'
                  variant='neutral'
                >
                  Connect to Neo4j Desktop
                </OutlinedButton>
              </span>
            </Tooltip>
          ) : (
            <OutlinedButton
              isDisabled
              onClick={handleClose}
              style={{ marginTop: '10px', width: '100%' }}
              size='large'
              variant='neutral'
            >
              Connect to Neo4j Desktop
            </OutlinedButton>
          )}

          <Tooltip title='Show information about this application.' aria-label='' disableInteractive>
            <span>
              <OutlinedButton
                onClick={onAboutModalOpen}
                style={{ marginTop: '10px', width: '100%' }}
                size='large'
                variant='neutral'
              >
                {/**/}
                About
              </OutlinedButton>
            </span>
          </Tooltip>
        </Dialog.Content>
        <Dialog.Actions
          style={{
            background: '#555',
            marginLeft: '-3rem',
            marginRight: '-3rem',
            marginBottom: '-3rem',
            padding: '3rem',
          }}
        >
          <div style={{ color: 'white' }}>
            This version of NeoDash is not actively maintained. Visit the&nbsp;
            <TextLink
              href='https://github.com/neo4j-contrib/neodash'
              className='n-text-neutral-text-inverse'
              target='_blank'
              style={{ color: 'white' }}
            >
              repository
            </TextLink>
            &nbsp; to learn more.
          </div>
        </Dialog.Actions>
      </Dialog>

      {/* Prompt when creating new dashboard with existing cache */}
      <Dialog size='small' isOpen={promptOpen == true}>
        <Dialog.Header>
          Create New Dashboard
          {/* <ExclamationTriangleIconSolid className='icon-base' color='orange' style={{ float: 'right' }} /> */}
        </Dialog.Header>
        <Dialog.Content>
          Are you sure you want to create a new dashboard? This will remove your currently cached dashboard.
        </Dialog.Content>
        <Dialog.Actions>
          <OutlinedButton
            onClick={() => {
              handleOpen();
              handlePromptClose();
            }}
            style={{ marginTop: '10px', float: 'right' }}
          >
            <BackspaceIconOutline className='btn-icon-base-l' />
            No
          </OutlinedButton>
          <FilledButton
            onClick={() => {
              handleClose();
              handlePromptClose();
              resetDashboard();
              onConnectionModalOpen();
            }}
            style={{ marginTop: '10px', float: 'right', marginRight: '5px' }}
          >
            Yes
            <PlayIconSolid className='btn-icon-base-r' />
          </FilledButton>
        </Dialog.Actions>
      </Dialog>
    </div>
  );
};

export default NeoWelcomeScreenModal;

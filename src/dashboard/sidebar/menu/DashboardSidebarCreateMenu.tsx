import React from 'react';
import { Menu } from '@neo4j-ndl/react';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarCreateMenu = ({
  anchorEl,
  open,
  handleNewClicked,
  handleImportClicked,
  handleClose,
}) => {
  return (
    <Menu anchorRef={{ current: anchorEl }} isOpen={open} onClose={handleClose} placement='bottom-start-top-start'>
      <Menu.Items>
        <Menu.Item onClick={handleNewClicked} title='New' />
        <Menu.Item onClick={handleImportClicked} title='Import' />
      </Menu.Items>
    </Menu>
  );
};

export default NeoDashboardSidebarCreateMenu;

import React from 'react';
import { Menu } from '@neo4j-ndl/react';
import {
  ArrowUturnLeftIconOutline,
  CloudArrowUpIconOutline,
  CodeBracketIconOutline,
  DocumentTextIconOutline,
  InformationCircleIconOutline,
  ShareIconOutline,
  TrashIconOutline,
} from '@neo4j-ndl/react/icons';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarDashboardMenu = ({
  anchorEl,
  draft,
  open,
  handleInfoClicked,
  handleSaveClicked,
  handleDiscardClicked,
  handleEditJsonClicked,
  handleExportClicked,
  handleShareClicked,
  handleDeleteClicked,
  handleClose,
}) => {
  return (
    <Menu anchorRef={{ current: anchorEl }} isOpen={open} onClose={handleClose} placement='bottom-start-top-start'>
      {!draft ? (
        <Menu.Items>
          <Menu.Item onClick={handleInfoClicked} leadingVisual={<InformationCircleIconOutline />} title='Info' />
          {/* <Menu.Item onClick={() => {}} leadingVisual={<DocumentDuplicateIconOutline />} title='Clone' /> */}
          <Menu.Item onClick={handleEditJsonClicked} leadingVisual={<CodeBracketIconOutline />} title='Edit JSON' />
          <Menu.Item onClick={handleExportClicked} leadingVisual={<DocumentTextIconOutline />} title='Export' />
          <Menu.Item onClick={handleShareClicked} leadingVisual={<ShareIconOutline />} title='Share' />
          <Menu.Item onClick={handleDeleteClicked} leadingVisual={<TrashIconOutline />} title='Delete' />
        </Menu.Items>
      ) : (
        <Menu.Items>
          <Menu.Item onClick={handleSaveClicked} leadingVisual={<CloudArrowUpIconOutline />} title='Save' />
          <Menu.Item onClick={handleEditJsonClicked} leadingVisual={<CodeBracketIconOutline />} title='Edit JSON' />
          <Menu.Item
            onClick={handleDiscardClicked}
            leadingVisual={<ArrowUturnLeftIconOutline />}
            title='Discard Draft'
          />
        </Menu.Items>
      )}
    </Menu>
  );
};

export default NeoDashboardSidebarDashboardMenu;

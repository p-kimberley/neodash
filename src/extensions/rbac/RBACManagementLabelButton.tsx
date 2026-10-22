import React from 'react';
import { connect } from 'react-redux';
import { IconButton } from '@neo4j-ndl/react';
import { UserCircleIconOutline } from '@neo4j-ndl/react/icons';
import { RBACManagementMenu } from './RBACManagementMenu';

import { createNotificationThunk } from '../../page/PageThunks';

const RBACManagementLabelButton = ({ createNotification }) => {
  const [MenuOpen, setMenuOpen] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleButtonClick = (event) => {
    setMenuOpen(true);
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setMenuOpen(false);
  };

  const button = (
    <IconButton description='Access Control' className='n-mx-1' onClick={handleButtonClick}>
      <UserCircleIconOutline />
    </IconButton>
  );

  return (
    <div style={{ display: 'inline' }}>
      {button}
      <RBACManagementMenu
        anchorEl={anchorEl}
        MenuOpen={MenuOpen}
        handleClose={handleClose}
        createNotification={createNotification}
      />
    </div>
  );
};

const mapStateToProps = () => ({});

const mapDispatchToProps = (dispatch) => ({
  createNotification: (title: any, message: any) => {
    dispatch(createNotificationThunk(title, message));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(RBACManagementLabelButton);

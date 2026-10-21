import React from 'react';
import { IconButton } from '@neo4j-ndl/react';
import { Tooltip } from '@mui/material';

import { DASHBOARD_HEADER_BUTTON_COLOR } from '../../config/ApplicationConfig';
import StyleConfig from '../../config/StyleConfig';
import { ArrowRightOnRectangleIconOutline } from '@neo4j-ndl/react/icons';
import { api } from '../../api/client';

await StyleConfig.getInstance();

/** Ends the NeoDash session, then the identity provider's session. */
export async function signOut() {
  let target = '/';
  try {
    ({ logoutUrl: target } = await api.logout());
  } catch {
    // Already signed out; fall through to the start page, which sends us to sign in.
  }
  window.location.assign(target);
}

export const NeoLogoutButton = () => (
  <Tooltip title={'Sign out'} disableInteractive>
    <IconButton
      className='logo-btn n-p-1'
      aria-label={'Sign out'}
      style={DASHBOARD_HEADER_BUTTON_COLOR ? { color: DASHBOARD_HEADER_BUTTON_COLOR } : {}}
      onClick={() => {
        signOut();
      }}
      size='large'
      clean
    >
      <ArrowRightOnRectangleIconOutline className='header-icon' type='outline' />
    </IconButton>
  </Tooltip>
);

export default NeoLogoutButton;

import React from 'react';
import { CleanIconButton } from '@neo4j-ndl/react';

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
  <CleanIconButton
    description={'Sign out'}
    className='logo-btn n-p-1'
    style={DASHBOARD_HEADER_BUTTON_COLOR ? { color: DASHBOARD_HEADER_BUTTON_COLOR } : {}}
    onClick={() => {
      signOut();
    }}
    size='large'
  >
    <ArrowRightOnRectangleIconOutline className='header-icon' />
  </CleanIconButton>
);

export default NeoLogoutButton;

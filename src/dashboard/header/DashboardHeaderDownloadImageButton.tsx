import React from 'react';
import { CleanIconButton } from '@neo4j-ndl/react';

import { CameraIconSolid } from '@neo4j-ndl/react/icons';

import { DASHBOARD_HEADER_BUTTON_COLOR } from '../../config/ApplicationConfig';
import StyleConfig from '../../config/StyleConfig';

await StyleConfig.getInstance();

export const NeoDashboardHeaderDownloadImageButton = (onDownloadImage) => {
  const content = (
    <CleanIconButton
      description={'Download Dashboard as Image'}
      style={DASHBOARD_HEADER_BUTTON_COLOR ? { color: DASHBOARD_HEADER_BUTTON_COLOR } : {}}
      onClick={() => onDownloadImage()}
      size='large'
    >
      <CameraIconSolid aria-label={'camera icon'} />
    </CleanIconButton>
  );

  return content;
};

export default NeoDashboardHeaderDownloadImageButton;

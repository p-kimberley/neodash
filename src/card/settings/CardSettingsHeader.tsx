import React from 'react';
import { CardHeader } from '@mui/material';
import { IconButton, CleanIconButton } from '@neo4j-ndl/react';
import {
  ExpandIcon,
  ShrinkIcon,
  DragIcon,
  QuestionMarkCircleIconOutline,
  TrashIconOutline,
  DocumentDuplicateIconOutline,
  PlayCircleIconSolid,
} from '@neo4j-ndl/react/icons';

const NeoCardSettingsHeader = ({
  onRemovePressed,
  onToggleCardSettings,
  onToggleCardExpand,
  expanded,
  onReportHelpButtonPressed,
  onClonePressed,
}) => {
  const maximizeButton = (
    <IconButton description='Maximize' onClick={onToggleCardExpand}>
      <ExpandIcon />
    </IconButton>
  );

  const unMaximizeButton = (
    <IconButton description='Restore' onClick={onToggleCardExpand}>
      <ShrinkIcon />
    </IconButton>
  );

  return (
    <CardHeader
      avatar={
        <div style={{ marginTop: '-8px', paddingBottom: '1px' }}>
          <CleanIconButton description='Move report' size='medium' className='n-relative -n-left-3 drag-handle'>
            <DragIcon aria-label={'Move Report'} />
          </CleanIconButton>
          <CleanIconButton description='Help' onClick={onReportHelpButtonPressed} size='medium'>
            <QuestionMarkCircleIconOutline aria-label={'Help'} />
          </CleanIconButton>
          <CleanIconButton description='Delete' style={{ color: 'red' }} onClick={onRemovePressed} size='medium'>
            <TrashIconOutline aria-label={'Delete'} />
          </CleanIconButton>
          <CleanIconButton description='Clone' style={{ color: 'green' }} onClick={onClonePressed} size='medium'>
            <DocumentDuplicateIconOutline aria-label={'Clone'} />
          </CleanIconButton>
        </div>
      }
      action={
        <>
          {expanded ? unMaximizeButton : maximizeButton}
          <CleanIconButton
            description='Run'
            onClick={(e) => {
              e.preventDefault();
              onToggleCardSettings();
            }}
            size='medium'
          >
            <PlayCircleIconSolid />
          </CleanIconButton>
        </>
      }
      title=''
      subheader=''
    />
  );
};

export default NeoCardSettingsHeader;

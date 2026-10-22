import React from 'react';
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
    <div className='nd-card-bar'>
      <div className='nd-card-bar-lead'>
        <div style={{ marginTop: '-8px', paddingBottom: '1px' }}>
          <CleanIconButton description='Move report' size='medium' className='n-relative -n-left-3 drag-handle'>
            <DragIcon aria-label={'Move Report'} />
          </CleanIconButton>
          <CleanIconButton description='Help' onClick={onReportHelpButtonPressed} size='medium'>
            <QuestionMarkCircleIconOutline aria-label={'Help'} />
          </CleanIconButton>
          <CleanIconButton description='Delete' variant='danger' onClick={onRemovePressed} size='medium'>
            <TrashIconOutline aria-label={'Delete'} />
          </CleanIconButton>
          <CleanIconButton description='Clone' style={{ color: 'green' }} onClick={onClonePressed} size='medium'>
            <DocumentDuplicateIconOutline aria-label={'Clone'} />
          </CleanIconButton>
        </div>
      </div>
      <div className='nd-card-bar-title' />
      <div className='nd-card-bar-actions'>
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
      </div>
    </div>
  );
};

export default NeoCardSettingsHeader;

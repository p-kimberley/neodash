import React from 'react';
import { IconButton, CleanIconButton } from '@neo4j-ndl/react';
import { ExpandIcon, ShrinkIcon, DragIcon, PlayCircleIconSolid } from '@neo4j-ndl/react/icons';
import { ReportActionsMenu, reportEditItems } from '../ReportActionsMenu';

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
        <CleanIconButton description='Move report' size='medium' className='drag-handle'>
          <DragIcon aria-label={'Move Report'} />
        </CleanIconButton>
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
        {/* Duplicate, help and delete, as in the report's menu on its front. */}
        <ReportActionsMenu groups={[reportEditItems({ onClonePressed, onReportHelpButtonPressed, onRemovePressed })]} />
      </div>
    </div>
  );
};

export default NeoCardSettingsHeader;

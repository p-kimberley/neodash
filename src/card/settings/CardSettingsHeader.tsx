import React from 'react';
import { IconButton, CleanIconButton } from '@neo4j-ndl/react';
import { ExpandIcon, ShrinkIcon, DragIcon, CheckIconOutline, XMarkIconOutline } from '@neo4j-ndl/react/icons';
import { ReportActionsMenu, reportEditItems } from '../ReportActionsMenu';

const NeoCardSettingsHeader = ({
  onRemovePressed,
  onToggleCardSettings,
  onCancelSettings = () => {},
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
        {/* Save keeps the changes and runs the report; Cancel puts it back as it was. */}
        <CleanIconButton
          description='Save'
          onClick={(e) => {
            e.preventDefault();
            onToggleCardSettings();
          }}
          size='medium'
        >
          <CheckIconOutline />
        </CleanIconButton>
        <CleanIconButton
          description='Cancel'
          onClick={(e) => {
            e.preventDefault();
            onCancelSettings();
          }}
          size='medium'
        >
          <XMarkIconOutline />
        </CleanIconButton>
        {/* Duplicate, help and delete, as in the report's menu on its front. */}
        <ReportActionsMenu groups={[reportEditItems({ onClonePressed, onReportHelpButtonPressed, onRemovePressed })]} />
      </div>
    </div>
  );
};

export default NeoCardSettingsHeader;

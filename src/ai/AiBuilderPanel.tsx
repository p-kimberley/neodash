import React from 'react';
import { CleanIconButton } from '@neo4j-ndl/react';
import { ArrowLeftIconOutline, SparklesIconOutline } from '@neo4j-ndl/react/icons';
import { AiOptions } from './AiOptions';

/**
 * Build with AI inside an empty report: suggestions for the dashboard straight away, then options that
 * follow what is typed. Picking one builds the report (see AiOptions).
 */
export const AiBuilderPanel = ({ reportId, onClose }: { reportId: string; onClose: () => void }) => (
  <div className='nd-ai-panel' role='region' aria-label='Build with AI'>
    <div className='nd-ai-head'>
      <CleanIconButton description='Back' size='small' onClick={onClose}>
        <ArrowLeftIconOutline />
      </CleanIconButton>
      <SparklesIconOutline className='nd-ai-head-icon' aria-hidden />
      <span>Build with AI</span>
    </div>
    <AiOptions reportId={reportId} mode='build' onApplied={onClose} />
  </div>
);

export default AiBuilderPanel;

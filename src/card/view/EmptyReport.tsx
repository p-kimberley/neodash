import React from 'react';
import { Cog6ToothIconOutline, SparklesIconOutline } from '@neo4j-ndl/react/icons';

/**
 * Whether a report has not been set up yet: it has no query (or Markdown, or address). Parameter
 * selects and forms are set up through their settings, so those count instead.
 */
export const isUnconfigured = (report: { type?: string; query?: string; settings?: Record<string, any> }) => {
  if (report.query && report.query.trim() !== '') {
    return false;
  }
  const settings = report.settings || {};
  if (report.type === 'select') {
    return !settings.parameterName;
  }
  if (report.type === 'forms') {
    return !(settings.formFields && settings.formFields.length > 0);
  }
  return true;
};

/**
 * What a report shows before it is set up. Editors get buttons to set it up: Configure (its settings)
 * and, when the server has a language model, Build with AI. Viewers see a short note.
 */
export const EmptyReport = ({
  editable,
  onConfigure,
  onBuildWithAI,
}: {
  editable: boolean;
  onConfigure: () => void;
  /** Shown when given (the server offers Build with AI). */
  onBuildWithAI?: () => void;
}) => {
  if (!editable) {
    return <div className='nd-empty-report nd-empty-report-note'>No content yet</div>;
  }
  return (
    <div className='nd-empty-report'>
      <div className='nd-empty-report-actions'>
        <button type='button' className='nd-empty-action' onClick={onConfigure}>
          <Cog6ToothIconOutline className='nd-empty-action-icon' aria-hidden />
          <span>Configure</span>
        </button>
        {onBuildWithAI ? (
          <button type='button' className='nd-empty-action nd-empty-action-ai' onClick={onBuildWithAI}>
            <SparklesIconOutline className='nd-empty-action-icon' aria-hidden />
            <span>Build with AI</span>
          </button>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
};

export default EmptyReport;

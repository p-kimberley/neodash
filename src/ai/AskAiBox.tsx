import React from 'react';
import { AiOptions } from './AiOptions';

/**
 * Ask AI, in a report's settings (opened with "Change with AI"): describe a change to the whole report
 * ("horizontal bars with a legend", "show it as a table") and pick one of the options for it (see
 * AiOptions). Cancel in the settings discards it too. The query-only English editor stays below.
 */
export const AskAiBox = ({ reportId, onApplied = () => {} }: { reportId: string; onApplied?: () => void }) => (
  <div className='nd-ask-ai'>
    <AiOptions reportId={reportId} mode='change' onApplied={onApplied} />
  </div>
);

export default AskAiBox;

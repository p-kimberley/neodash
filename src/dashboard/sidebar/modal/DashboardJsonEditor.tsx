import React from 'react';
import { CheckCircleIconSolid, ExclamationCircleIconSolid } from '@neo4j-ndl/react/icons';
import NeoCodeEditorComponent from '../../../component/editor/CodeEditorComponent';

export type JsonVerification = { problems: string[]; summary?: string } | undefined;

/** A verification's result: every problem found, or what passed. */
const VerificationMessage = ({ verification }: { verification: JsonVerification }) => {
  if (!verification) {
    return <></>;
  }
  const { problems, summary } = verification;
  if (problems.length == 0) {
    return (
      <div className='nd-json-message n-text-success-text' role='status'>
        <CheckCircleIconSolid className='nd-json-message-icon' />
        <span>Valid dashboard JSON: {summary}.</span>
      </div>
    );
  }
  return (
    <div className='nd-json-message n-text-danger-text' role='alert'>
      <ExclamationCircleIconSolid className='nd-json-message-icon' />
      {problems.length == 1 ? (
        <span>{problems[0]}</span>
      ) : (
        <span>
          {problems.length} problems:
          <ul>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </span>
      )}
    </div>
  );
};

/**
 * Dashboard JSON in a code editor (highlighted, with line numbers), and the result of verifying it.
 * Read-only without `onChange`.
 */
export const DashboardJsonEditor = ({
  value,
  onChange,
  verification,
  placeholder = '',
  height = 440,
}: {
  value: string;
  onChange?: (value: string) => void;
  verification?: JsonVerification;
  placeholder?: string;
  height?: number;
}) => (
  <>
    <NeoCodeEditorComponent
      value={value}
      onChange={onChange}
      editable={onChange !== undefined}
      language='json'
      ariaLabel='Dashboard JSON'
      placeholder={placeholder}
      className={`nd-json-editor ${verification?.problems.length ? 'has-error' : ''}`}
      style={{ height }}
    />
    <VerificationMessage verification={verification} />
  </>
);

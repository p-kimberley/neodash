import React, { useEffect, useRef, useState } from 'react';
import {
  CheckIconOutline,
  DocumentArrowDownIconOutline,
  DocumentPlusIconOutline,
  ShieldCheckIconOutline,
} from '@neo4j-ndl/react/icons';
import { FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import { dashboardToJson, verifyDashboardJson } from './DashboardJson';
import { DashboardJsonEditor, JsonVerification } from './DashboardJsonEditor';

/**
 * Edits a dashboard as JSON, typed here or replaced from a file (e.g. after bulk changes made
 * elsewhere). Applying opens the result as a draft of the same dashboard, which Save then overwrites.
 * Verify checks the JSON on request; Apply checks it too, and refuses JSON that doesn't pass.
 */
export const NeoDashboardSidebarEditJsonModal = ({ open, dashboard, discardsDraft, onApply, handleClose }) => {
  const [text, setText] = useState('');
  const [verification, setVerification] = useState<JsonVerification>(undefined);
  const loadFromFile = useRef<HTMLInputElement>(null);

  // A saved dashboard arrives after the dialog opens; start (again) from it when it does.
  useEffect(() => {
    setText(open && dashboard ? dashboardToJson(dashboard) : '');
    setVerification(undefined);
  }, [open, dashboard]);

  const onSelectFileClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
    if (file) {
      setText(await file.text());
      setVerification(undefined);
    }
  };

  const downloadDashboard = () => {
    const element = document.createElement('a');
    element.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    element.download = 'dashboard.json';
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    element.remove();
  };

  const verify = () => {
    const result = verifyDashboardJson(text);
    setVerification(result);
    return result.problems.length == 0;
  };

  const apply = () => {
    if (verify()) {
      onApply(text);
    }
  };

  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>Edit Dashboard JSON</Dialog.Header>
      <Dialog.Content>
        Edit the dashboard here, or download it, change it elsewhere and replace it from the file. Applying opens your
        changes as unsaved changes to this dashboard: <b>Save</b> them to keep them.
        {discardsDraft ? (
          <>
            <br />
            <b>Applying will discard the unsaved changes to the open dashboard.</b>
          </>
        ) : (
          <></>
        )}
        <br /> <br />
        <DashboardJsonEditor
          value={text}
          onChange={(value) => {
            setText(value);
            setVerification(undefined);
          }}
          verification={verification}
          placeholder='Loading the dashboard...'
        />
      </Dialog.Content>
      <Dialog.Actions>
        <OutlinedButton onClick={() => loadFromFile.current?.click()} isFloating variant='neutral'>
          <input
            value=''
            type='file'
            accept='.json,application/json'
            ref={loadFromFile}
            onChange={onSelectFileClick}
            hidden
          />
          Replace from file
          <DocumentPlusIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
        <OutlinedButton onClick={downloadDashboard} isDisabled={text.length == 0} isFloating variant='neutral'>
          Download
          <DocumentArrowDownIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
        <OutlinedButton onClick={verify} isDisabled={text.length == 0} isFloating variant='neutral'>
          Verify
          <ShieldCheckIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
        <FilledButton onClick={apply} isDisabled={text.length == 0} isFloating>
          Apply
          <CheckIconOutline className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDashboardSidebarEditJsonModal;

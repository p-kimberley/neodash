import React, { useRef } from 'react';
import { PlayIconSolid, DocumentPlusIconOutline, ShieldCheckIconOutline } from '@neo4j-ndl/react/icons';
import { FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import { verifyDashboardJson } from './DashboardJson';
import { DashboardJsonEditor, JsonVerification } from './DashboardJsonEditor';

export const NeoDashboardSidebarImportModal = ({ open, onImport, handleClose }) => {
  const [text, setText] = React.useState('');
  const [verification, setVerification] = React.useState<JsonVerification>(undefined);
  const loadFromFile = useRef(null);

  const onSelectFileClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();

    if (e.target.files == null) {
      return;
    }

    const file = e.target.files[0];
    const text = await file.text();

    setText(text);
    setVerification(undefined);
  };

  const verify = () => {
    const result = verifyDashboardJson(text);
    setVerification(result);
    return result.problems.length == 0;
  };

  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>Import Dashboard</Dialog.Header>
      <Dialog.Content>
        Import your dashboard from a JSON file, or copy-paste the save file here.
        <br />
        <b>Importing will discard your current draft, if any.</b>
        <br /> <br />
        <DashboardJsonEditor
          value={text}
          onChange={(value) => {
            setText(value);
            setVerification(undefined);
          }}
          verification={verification}
          placeholder='Paste a dashboard JSON file here...'
          height={260}
        />
      </Dialog.Content>
      <Dialog.Actions>
        <OutlinedButton
          onClick={() => {
            loadFromFile.current.click();
          }}
          style={{ marginLeft: '10px' }}
          isFloating
          variant='neutral'
        >
          <input value='' type='file' ref={loadFromFile} onChange={onSelectFileClick} hidden />
          Select From File
          <DocumentPlusIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
        <OutlinedButton onClick={verify} isDisabled={text.length == 0} isFloating variant='neutral'>
          Verify
          <ShieldCheckIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
        <FilledButton
          onClick={() => {
            // Only a dashboard that verifies is imported.
            if (!verify()) {
              return;
            }
            onImport(text);
            setText('');
            setVerification(undefined);
            handleClose();
          }}
          isDisabled={text.length == 0}
          style={{ float: 'right', marginRight: '10px' }}
          isFloating
        >
          Import
          <PlayIconSolid className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default NeoDashboardSidebarImportModal;

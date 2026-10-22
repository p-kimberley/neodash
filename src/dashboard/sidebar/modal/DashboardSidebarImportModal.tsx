import React, { useRef } from 'react';
import { PlayIconSolid, DocumentPlusIconOutline } from '@neo4j-ndl/react/icons';
import { Dialog, FilledButton, OutlinedButton, TextArea } from '@neo4j-ndl/react';

export const NeoDashboardSidebarImportModal = ({ open, onImport, handleClose }) => {
  const [text, setText] = React.useState('');
  const loadFromFile = useRef(null);

  const onSelectFileClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();

    if (e.target.files == null) {
      return;
    }

    const file = e.target.files[0];
    const text = await file.text();

    setText(text);
  };

  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>Import Dashboard</Dialog.Header>
      <Dialog.Content>
        Import your dashboard from a JSON file, or copy-paste the save file here.
        <br />
        <b>Importing will discard your current draft, if any.</b>
        <br /> <br />
        <TextArea
          isFluid
          className='nd-json-text'
          ariaLabel='Dashboard JSON'
          value={text}
          placeholder='Paste a dashboard JSON file here...'
          htmlAttributes={{ rows: 10, spellCheck: false, onChange: (e) => setText(e.target.value) }}
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
        <FilledButton
          onClick={() => {
            onImport(text);
            setText('');
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

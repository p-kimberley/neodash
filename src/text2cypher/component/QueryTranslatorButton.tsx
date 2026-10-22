import React from 'react';
import { IconButton } from '@neo4j-ndl/react';
import QueryTranslatorSettingsModal from './QueryTranslatorSettingsModal';
import { LanguageIconSolid } from '@neo4j-ndl/react/icons';

/**
 * The dashboard's Text2Cypher button (the model in use and the dashboard's example questions). Shown
 * to editors when the server has a language model.
 */
const QueryTranslatorButton = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ display: 'inline' }}>
      <IconButton description='Text2Cypher' className='n-mx-1' onClick={() => setOpen(true)}>
        <LanguageIconSolid />
      </IconButton>
      {open ? <QueryTranslatorSettingsModal open={open} setOpen={setOpen} /> : <></>}
    </div>
  );
};

export default QueryTranslatorButton;

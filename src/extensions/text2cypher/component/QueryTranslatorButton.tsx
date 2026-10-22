import React from 'react';
import { IconButton } from '@neo4j-ndl/react';
import QueryTranslatorSettingsModal from './QueryTranslatorSettingsModal';
import { ExclamationTriangleIconSolid, LanguageIconSolid } from '@neo4j-ndl/react/icons';
import { text2cypherAvailable } from '../util/Util';

/** The dashboard's Text2Cypher button; warns when the server has no language model. */
const QueryTranslatorButton = () => {
  const [open, setOpen] = React.useState(false);
  const available = text2cypherAvailable();
  return (
    <div style={{ display: 'inline' }}>
      <IconButton
        description={available ? 'Text2Cypher' : 'Text2Cypher (no language model configured)'}
        className='n-mx-1'
        onClick={() => setOpen(true)}
      >
        <LanguageIconSolid />
        {available ? (
          <></>
        ) : (
          <ExclamationTriangleIconSolid
            style={{ color: 'var(--theme-color-danger-icon)' }}
            className='-n-mt-1 n-ml-3 n-w-4/5'
          />
        )}
      </IconButton>
      {open ? <QueryTranslatorSettingsModal open={open} setOpen={setOpen} /> : <></>}
    </div>
  );
};

export default QueryTranslatorButton;

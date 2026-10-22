import React from 'react';
import { connect } from 'react-redux';
import { Dialog, FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { PencilSquareIconOutline } from '@neo4j-ndl/react/icons';
import { deleteAllMessageHistory } from '../state/QueryTranslatorActions';
import { QUERY_TRANSLATOR_HISTORY_PREFIX } from '../state/QueryTranslatorSelector';
import { getSessionStorageValuesWithPrefix } from '../../../sessionStorage/SessionStorageSelectors';
import QueryTranslatorSettingsModelExamples from './model-examples/QueryTranslatorSettingsModelExamples';
import { text2cypherAvailable, text2cypherModel } from '../util/Util';

/**
 * About Text2Cypher on this server: which model writes the queries, what it receives, and the
 * dashboard's example questions for it. The model itself is configured on the server.
 */
const QueryTranslatorSettingsModal = ({ open, setOpen, messageHistory, clearHistory }) => {
  const [editDialogIsOpen, setEditDialogIsOpen] = React.useState(false);
  const close = () => setOpen(false);

  if (editDialogIsOpen) {
    return (
      <QueryTranslatorSettingsModelExamples
        handleCloseEditSolutions={() => setEditDialogIsOpen(false)}
        open={open}
        handleCloseWithoutSave={close}
      />
    );
  }
  const available = text2cypherAvailable();
  return (
    <Dialog size='large' isOpen={open} onClose={close}>
      <Dialog.Header>Text2Cypher</Dialog.Header>
      <Dialog.Content>
        <p>
          Write a report's query as a question in English: switch its query editor from Cypher to English. The question
          is turned into Cypher by a language model that runs for this server.
        </p>
        <br />
        {available ? (
          <>
            <p>
              Model: <b>{text2cypherModel() || 'configured on the server'}</b>
            </p>
            <br />
            <p>It receives:</p>
            <ul className='n-list-disc n-ml-6'>
              <li>the database schema: node labels, relationship types and property names;</li>
              <li>the question, the report's earlier questions, and this dashboard's example questions.</li>
            </ul>
            <p>Query results are not sent to it.</p>
          </>
        ) : (
          <p>
            <b>No language model is configured on this server.</b> An administrator can set one up (any
            OpenAI-compatible API, such as vLLM) with the Helm chart's <code>text2cypher</code> settings.
          </p>
        )}
      </Dialog.Content>
      <Dialog.Actions>
        {Object.keys(messageHistory).length > 0 ? (
          <OutlinedButton onClick={() => clearHistory()}>Forget earlier questions</OutlinedButton>
        ) : (
          <></>
        )}
        <OutlinedButton onClick={() => setEditDialogIsOpen(true)}>
          Example questions
          <PencilSquareIconOutline className='btn-icon-base-r' />
        </OutlinedButton>
        <FilledButton onClick={close}>Done</FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({
  messageHistory: getSessionStorageValuesWithPrefix(state, QUERY_TRANSLATOR_HISTORY_PREFIX),
});

const mapDispatchToProps = (dispatch) => ({
  clearHistory: () => dispatch(deleteAllMessageHistory()),
});

export default connect(mapStateToProps, mapDispatchToProps)(QueryTranslatorSettingsModal);

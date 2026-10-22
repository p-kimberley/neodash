import React, { useState } from 'react';
import { connect } from 'react-redux';
import { getModelExamples } from '../../state/QueryTranslatorSelector';
import { FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { Dialog } from '../../../../component/dialog/Dialog';
import ExampleEditorModal from './ExampleEditorModal';
import ExampleDisplayTable from './ExampleDisplayTable';

const QueryTranslatorSettingsModelExamples = ({ handleCloseEditSolutions, examples, open, handleCloseWithoutSave }) => {
  // States
  const [exampleEditorIsOpen, setExampleEditorIsOpen] = useState(false);
  const [index, setIndex] = useState<number | null>(0);

  // Function for edit button being pressed
  const handleEdit = (index: number) => {
    setIndex(index);
    setExampleEditorIsOpen(true);
  };

  // Function for AddQ&A button being pressed
  const handleAdd = () => {
    setIndex(null);
    setExampleEditorIsOpen(true);
  };

  // Returns viewer or editor depending on exampleEditorIsOpen state
  if (!exampleEditorIsOpen) {
    return (
      <Dialog size='large' isOpen={open} onClose={handleCloseWithoutSave}>
        <Dialog.Header>Example questions</Dialog.Header>
        <Dialog.Content>
          <p>
            Questions with the queries that answer them, sent to the language model with every question asked in this
            dashboard. Examples that use your data's labels and properties make its queries more accurate.
          </p>
          <br />
          <ExampleDisplayTable handleEdit={handleEdit} />
        </Dialog.Content>
        <Dialog.Actions>
          <OutlinedButton onClick={handleAdd}>Add example</OutlinedButton>
          <FilledButton onClick={handleCloseEditSolutions}>Done</FilledButton>
        </Dialog.Actions>
      </Dialog>
    );
  }
  return (
    <ExampleEditorModal
      index={index}
      // checks if index exists, and if it does, it passes the question and answer props over to the component, otherwise is empty
      question={index !== null && examples[index].question ? examples[index].question : ''}
      answer={index !== null && examples[index].answer ? examples[index].answer : ''}
      exampleEditorIsOpen={exampleEditorIsOpen}
      setExampleEditorIsOpen={setExampleEditorIsOpen}
    ></ExampleEditorModal>
  );
};

// Function to access the state and pass to the component some parameters
const mapStateToProps = (state) => ({
  examples: getModelExamples(state),
});

export default connect(mapStateToProps)(QueryTranslatorSettingsModelExamples);

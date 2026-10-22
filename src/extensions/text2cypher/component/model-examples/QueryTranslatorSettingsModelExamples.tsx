import React, { useState } from 'react';
import { connect } from 'react-redux';
import { getModelExamples } from '../../state/QueryTranslatorSelector';
import { Dialog, FilledButton } from '@neo4j-ndl/react';
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
      <Dialog
        className='dialog-xl n-bg-neutral-bg-default ndl-theme-light'
        isOpen={open}
        onClose={handleCloseWithoutSave}
      >
        <Dialog.Header className='n-ml-2'>LLM Examples</Dialog.Header>
        <Dialog.Content className='n-ml-2'>
          You can define custom English to Cypher translation examples here. <br /> Adding your own examples will
          improve the accuracy of translating English to Cypher in your dashboard.
          <br />
          <br />
          <ExampleDisplayTable handleEdit={handleEdit} />
          <div>
            <FilledButton className='n-float-left' onClick={handleAdd}>
              Create New
            </FilledButton>
            <FilledButton className='n-float-right' onClick={handleCloseEditSolutions}>
              Save
            </FilledButton>
          </div>
        </Dialog.Content>
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

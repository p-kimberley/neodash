// TODO: this file (in a way) belongs to chart/parameter/ParameterSelectionChart. It would make sense to move it there

import React from 'react';
import { FilledButton } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import ParameterSelectCardSettings from '../../../chart/parameter/ParameterSelectCardSettings';
import NeoCardSettingsFooter from '../../../card/settings/CardSettingsFooter';
import { objMerge } from '../../../utils/ObjectManipulation';

const NeoFormCardSettingsModal = ({ open, setOpen, index, formFields, setFormFields, database, extensions }) => {
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = React.useState(false);

  return (
    <Dialog
      className='dialog-l'
      isOpen={open}
      onClose={() => setOpen(false)}
      style={{ overflow: 'inherit', overflowY: 'auto' }}
    >
      <Dialog.Header>Editing Form Field #{index + 1}</Dialog.Header>
      <Dialog.Content style={{ overflow: 'inherit' }}>
        {formFields[index] ? (
          <>
            <ParameterSelectCardSettings
              query={formFields[index].query}
              type={'select'}
              database={database}
              settings={objMerge({ inputMode: 'cypher' }, formFields[index].settings)}
              extensions={extensions}
              onReportSettingUpdate={(key, value) => {
                const newFormFields = [...formFields];
                newFormFields[index].settings[key] = value;
                if (key == 'type') {
                  newFormFields[index].type = value;
                }
                setFormFields(newFormFields);
              }}
              onQueryUpdate={(query) => {
                const newFormFields = [...formFields];

                newFormFields[index].query = query;
                setFormFields(newFormFields);
              }}
            />

            <FilledButton
              onClick={() => {
                setOpen(false);
              }}
              size='medium'
              isFloating
              style={{ float: 'right' }}
            >
              Save
            </FilledButton>
            <br />
            <br />
            <NeoCardSettingsFooter
              type={'select'}
              reportSettings={formFields[index].settings}
              reportSettingsOpen={advancedSettingsOpen}
              onToggleReportSettings={() => setAdvancedSettingsOpen(!advancedSettingsOpen)}
              onReportSettingUpdate={(key, value) => {
                const newFormFields = [...formFields];
                newFormFields[index].settings[key] = value;
                setFormFields(newFormFields);
              }}
            />
          </>
        ) : (
          <></>
        )}
      </Dialog.Content>
    </Dialog>
  );
};

export default NeoFormCardSettingsModal;

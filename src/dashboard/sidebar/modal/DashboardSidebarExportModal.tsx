import React from 'react';
import { DocumentArrowDownIconOutline } from '@neo4j-ndl/react/icons';
import { OutlinedButton, TextArea } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import { valueIsArray, valueIsObject } from '../../../chart/ChartUtils';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarExportModal = ({ open, dashboard, handleClose }) => {
  /**
   * Removes the specified set of keys from the nested dictionary.
   */
  const filterNestedDict = (value: any, removedKeys: any[]) => {
    if (value == undefined) {
      return value;
    }

    if (valueIsArray(value)) {
      return value.map((v) => filterNestedDict(v, removedKeys));
    }

    if (valueIsObject(value)) {
      const newValue = {};
      Object.keys(value).forEach((k) => {
        if (removedKeys.indexOf(k) != -1) {
          newValue[k] = undefined;
        } else {
          newValue[k] = filterNestedDict(value[k], removedKeys);
        }
      });
      return newValue;
    }
    return value;
  };

  const filteredDashboard = filterNestedDict(dashboard, [
    'fields',
    'settingsOpen',
    'advancedSettingsOpen',
    'collapseTimeout',
    'apiKey', // Added for query-translator extension
  ]);

  const dashboardString = JSON.stringify(filteredDashboard, null, 2);
  const downloadDashboard = () => {
    const element = document.createElement('a');
    const file = new Blob([dashboardString], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'dashboard.json';
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>Export Dashboard</Dialog.Header>
      <Dialog.Content>
        Export your dashboard as a JSON file, or copy-paste the file from here.
        <br />
        <OutlinedButton onClick={downloadDashboard} isFloating variant='neutral'>
          Save to file
          <DocumentArrowDownIconOutline className='btn-icon-base-r' aria-label={'save arrow'} />
        </OutlinedButton>
        <br />
        <br />
        <TextArea
          isFluid
          isReadOnly
          className='nd-json-text'
          ariaLabel='Dashboard JSON'
          value={dashboardString}
          placeholder='Your dashboard JSON should be displayed here.'
          htmlAttributes={{ rows: 24, spellCheck: false }}
        />
      </Dialog.Content>
    </Dialog>
  );
};

export default NeoDashboardSidebarExportModal;

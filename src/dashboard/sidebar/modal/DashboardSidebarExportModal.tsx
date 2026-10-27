import React from 'react';
import { DocumentArrowDownIconOutline } from '@neo4j-ndl/react/icons';
import { OutlinedButton } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import { dashboardToJson } from './DashboardJson';
import { DashboardJsonEditor } from './DashboardJsonEditor';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarExportModal = ({ open, dashboard, handleClose }) => {
  const dashboardString = dashboardToJson(dashboard);
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
        <DashboardJsonEditor value={dashboardString} placeholder='Your dashboard JSON should be displayed here.' />
      </Dialog.Content>
    </Dialog>
  );
};

export default NeoDashboardSidebarExportModal;

import React from 'react';
import { Dialog } from '@neo4j-ndl/react';

/**
 * Shows a dashboard's details: ID, title, last modified, author and version.
 */
export const NeoDashboardSidebarInfoModal = ({ open, dashboard, handleClose }) => {
  const rows = dashboard
    ? [
        ['ID', dashboard.uuid],
        ['Title', dashboard.title],
        ['Last Modified', dashboard.date],
        ['Author', dashboard.author],
        ['Version', dashboard.version],
      ]
    : [];

  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>About '{dashboard && dashboard.title}'</Dialog.Header>
      <Dialog.Content>
        <table className='nd-props-table'>
          <tbody>
            {rows.map(([field, value]) => (
              <tr key={field}>
                <th scope='row'>{field}</th>
                <td>{value === undefined || value === null ? '' : `${value}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog.Content>
    </Dialog>
  );
};

export default NeoDashboardSidebarInfoModal;

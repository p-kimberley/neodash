import React from 'react';
import { Dialog, TextLink } from '@neo4j-ndl/react';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoReportHelpModal = ({ open, handleClose }) => {
  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>About Reports</Dialog.Header>
      <Dialog.Content>
        {' '}
        A report is the smallest building block of your dashboard. Each report runs a single Cypher query that loads
        data from your database. By changing the report type, different visualizations can be created for the data. See
        the{' '}
        <TextLink
          href='https://github.com/neo4j-contrib/neodash/tree/master/docs/modules/ROOT/pages/user-guide/reports/index.adoc'
          target='_blank'
          type='external'
        >
          Documentation
        </TextLink>
        for more on reports.
        <br></br>
        <br></br>
        <table>
          <tr>
            <td>
              <b>Moving Reports</b>
              <img src='movereport.gif' style={{ width: '100%' }}></img>
            </td>
            <td>
              <b>Resizing Reports</b>
              <img src='resizereport.gif' style={{ width: '100%' }}></img>
            </td>
          </tr>
        </table>
      </Dialog.Content>
    </Dialog>
  );
};

export default NeoReportHelpModal;

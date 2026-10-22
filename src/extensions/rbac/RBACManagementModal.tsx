import React, { useEffect, useState, useContext } from 'react';
import { Dialog, FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { Neo4jContext, Neo4jContextState } from '../../api/Neo4jContext';
import { docsUrl } from '../../utils/docs';
import { SelectField } from '../../component/field/SelectField';
import {
  Operation,
  retrieveAllowAndDenyLists,
  retrieveDatabaseList,
  retrieveLabelsList,
  retrieveNeo4jUsers,
  updatePrivileges,
  updateUsers,
} from './RBACUtils';
/**
 * Configures RBAC Access Control Management for a certain role on certain labels and attaches the roles to specific users.
 * @param open - Whether the modal is open or not.
 * @param currentRole - The currently selected role.
 * @param handleClose - The function to close the modal.
 */
export const RBACManagementModal = ({ open, handleClose, currentRole, createNotification }) => {
  const { driver } = useContext<Neo4jContextState>(Neo4jContext);
  const [neo4jUsers, setNeo4jUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [databases, setDatabases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [labels, setLabels] = useState([]);
  const [allowList, setAllowList] = useState([]);
  const [denyList, setDenyList] = useState([]);
  const [fixedAllowList, setFixedAllowList] = useState([]);
  const [fixedDenyList, setFixedDenyList] = useState([]);
  const [denyCompleted, setDenyCompleted] = useState(false);
  const [allowCompleted, setAllowCompleted] = useState(false);
  const [usersCompleted, setUsersCompleted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isDatabaseEmpty, setIsDatabaseEmpty] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedUsers([]);
      setAllowList([]);
      setDenyList([]);
      setSelectedDatabase('');
      return;
    }
    setDenyCompleted(false);
    setAllowCompleted(false);
    setUsersCompleted(false);
    setFailed(false);
    retrieveDatabaseList(driver, setDatabases);
    retrieveNeo4jUsers(driver, currentRole, setNeo4jUsers, setSelectedUsers);
  }, [open]);

  useEffect(() => {
    if (failed !== false) {
      createNotification('Unable to update privileges', `${failed}`);
    } else if (denyCompleted && allowCompleted && usersCompleted) {
      createNotification('Success', `Access for role '${currentRole}' updated.`);
    }
  }, [denyCompleted, allowCompleted, usersCompleted, failed]);

  const parseLabelsList = (database, records) => {
    const allLabels = records.map((record) => record._fields[0]).filter((l) => l !== '_Neodash_Dashboard');
    retrieveAllowAndDenyLists(
      driver,
      database,
      currentRole,
      allLabels,
      setLabels,
      setAllowList,
      setDenyList,
      setFixedAllowList,
      setFixedDenyList,
      setLoaded
    );
  };

  const handleDatabaseSelect = (selectedOption) => {
    setSelectedDatabase(selectedOption.value);
    setLabels([]);
    setAllowList([]);
    setDenyList([]);
    retrieveLabelsList(driver, selectedOption.value, (records) => {
      if (records.length === 0) {
        setIsDatabaseEmpty(true);
      } else {
        parseLabelsList(selectedOption.value, records);
        setIsDatabaseEmpty(false);
      }
    });
  };

  const handleSave = async () => {
    createNotification('Updating', `Access for role '${currentRole}' is being updated, please wait...`);
    try {
      await updateUsers(
        driver,
        currentRole,
        neo4jUsers,
        selectedUsers,
        () => setUsersCompleted(true),
        (failReason) => setFailed(`Operation 'ROLE-USER ASSIGNMENT' failed.\n Reason: ${failReason}`)
      );

      if (selectedDatabase && labels.length > 0) {
        // Check if there are labels to update
        const nonFixedDenyList = denyList.filter((n) => !fixedDenyList.includes(n));
        const nonFixedAllowList = allowList.filter((n) => !fixedDenyList.includes(n));

        await updatePrivileges(
          driver,
          selectedDatabase,
          currentRole,
          labels,
          nonFixedDenyList,
          Operation.DENY,
          () => setDenyCompleted(true),
          (failReason) => setFailed(`Operation 'DENY LABEL ACCESS' failed.\n Reason: ${failReason}`)
        );

        await updatePrivileges(
          driver,
          selectedDatabase,
          currentRole,
          labels,
          nonFixedAllowList,
          Operation.GRANT,
          () => setAllowCompleted(true),
          (failReason) => setFailed(`Operation 'ALLOW LABEL ACCESS' failed.\n Reason: ${failReason}`)
        );
      } else {
        // Since there is no database or labels selected, we don't run the DENY/ALLOW queries.
        // We just mark them as completed so the success message shows up.
        setDenyCompleted(true);
        setAllowCompleted(true);
      }
    } catch (error) {
      // Handle any errors that occur during the update process
      createNotification('error', `An error occurred: ${error.message}`);
    } finally {
      handleClose();
    }
  };

  return (
    <Dialog size='large' isOpen={open} onClose={handleClose}>
      <Dialog.Header>Access Control - '{currentRole}'</Dialog.Header>
      <Dialog.Content>
        This screen lets you handle user assignment and access control for a specific role.
        <br />
        For more information, please refer to the{' '}
        <a
          href={docsUrl('user-guide/extensions/access-control-management')}
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'blue', textDecoration: 'underline' }}
        >
          documentation
        </a>
        .
        <br />
        <div>
          <br />
          <h5>Manage Users</h5>
          <p>Select a list of users to assign to the current role.</p>
          <SelectField
            ariaLabel='Users'
            isMulti
            isFluid
            options={neo4jUsers.map((user) => ({ value: user, label: user }))}
            value={selectedUsers}
            onChange={(users) => setSelectedUsers(users)}
          />
        </div>
        <div>
          <br />
          <h5>Label Access</h5>
          <p>For a given database, control what labels the role is or is not allowed to see.</p>
          {/* errorText={!selectedDatabase && 'Please choose a database in order to proceed'} */}
          <SelectField
            label='Database'
            placeholder='Select a database'
            isFluid
            options={databases
              .filter((database) => database !== 'system')
              .map((database) => ({ value: database, label: database }))}
            value={selectedDatabase}
            onChange={(database) => database && handleDatabaseSelect({ value: database })}
          />
          {selectedDatabase && isDatabaseEmpty && (
            <p style={{ color: 'red' }}>
              This database is currently empty. Please select a different database or add labels to manage access.
            </p>
          )}
        </div>
        {selectedDatabase && !isDatabaseEmpty && loaded && (
          <>
            <br />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ width: '45%' }}>
                <SelectField
                  label='Allow List'
                  isMulti
                  isFluid
                  placeholder='Select labels'
                  helpText={
                    allowList.find((i) => i == '*') &&
                    'Selecting (*) grants access to all labels, overriding other selections.'
                  }
                  options={labels.map((nodelabel) => ({ value: nodelabel, label: nodelabel }))}
                  value={allowList}
                  onChange={(selected) => {
                    // Make sure that only database-specific label access rules can be changed from this UI.
                    if (fixedAllowList.every((v) => selected.includes(v))) {
                      setAllowList(selected);
                    } else {
                      createNotification(
                        'Label cannot be removed',
                        'The selected label is allowed access across all databases. You cannot remove this privilege using this interface.'
                      );
                    }
                  }}
                />
              </div>
              <div style={{ width: '45%' }}>
                <SelectField
                  label='Deny List'
                  isMulti
                  isFluid
                  placeholder='Select labels'
                  helpText={
                    denyList.find((i) => i == '*') &&
                    'Selecting (*) denies access to all labels, overriding other selections.'
                  }
                  options={labels.filter((l) => l !== '*').map((nodelabel) => ({ value: nodelabel, label: nodelabel }))}
                  value={denyList}
                  onChange={(selected) => {
                    // Make sure that only database-specific label access rules can be changed from this UI.
                    if (fixedDenyList.every((v) => selected.includes(v))) {
                      setDenyList(selected);
                    } else {
                      createNotification(
                        'Label cannot be removed',
                        'The selected label is denied access across all databases. You cannot remove this privilege using this interface.'
                      );
                    }
                  }}
                />
              </div>
            </div>
          </>
        )}
      </Dialog.Content>
      <Dialog.Actions>
        <OutlinedButton onClick={handleClose} style={{ float: 'right' }} isFloating>
          Cancel
        </OutlinedButton>
        <FilledButton onClick={handleSave} style={{ float: 'right', marginRight: '10px' }} isFloating>
          Save
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};

export default RBACManagementModal;

import React from 'react';
import { Menu } from '@neo4j-ndl/react';

/**
 * Configures setting the current Neo4j database connection for the dashboard.
 */
export const NeoDashboardSidebarDatabaseMenu = ({ anchorEl, open, handleClose, databases, selected, setSelected }) => {
  return (
    <Menu anchorRef={{ current: anchorEl }} isOpen={open} onClose={handleClose} placement='bottom-start-top-start'>
      <Menu.Items>
        {databases.map((d) => {
          return (
            <Menu.Item
              onClick={() => {
                setSelected(d);
              }}
              title={d}
              style={
                d == selected
                  ? {
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: 'var(--theme-color-primary-bg-strong)',
                      borderColor: 'var(--theme-color-primary-bg-strong)',
                      borderRadius: '8px',
                    }
                  : {}
              }
            />
          );
        })}
      </Menu.Items>
    </Menu>
  );
};

export default NeoDashboardSidebarDatabaseMenu;

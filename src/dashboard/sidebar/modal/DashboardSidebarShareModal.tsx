import React from 'react';
import { Checkbox, Dialog, TextLink } from '@neo4j-ndl/react';

/**
 * Shows a link to a saved dashboard on this NeoDash deployment. Links never carry credentials:
 * whoever opens one signs in, and their role decides what they can do.
 */
export const NeoDashboardSidebarShareModal = ({ uuid, open, handleClose }) => {
  const [includeView, setIncludeView] = React.useState(true);

  function getShareURL() {
    const base = `${window.location.origin}/dashboards/${encodeURIComponent(uuid)}`;
    // The address bar already holds the current page and filter values (see UrlState.ts).
    const current =
      window.location.pathname === `/dashboards/${encodeURIComponent(uuid)}` ? window.location.search : '';
    return includeView ? `${base}${current}` : base;
  }

  return (
    <Dialog size='small' isOpen={open == true} onClose={handleClose}>
      <Dialog.Header>Share Dashboard</Dialog.Header>
      <Dialog.Subtitle>
        Anyone with access to NeoDash can open this link after signing in. To share the dashboard as a file, use Export
        in the dashboard's menu.
      </Dialog.Subtitle>
      <Dialog.Content>
        <Checkbox
          label='Include the current page and filter values'
          style={{ fontSize: 'small' }}
          isChecked={includeView}
          onClick={() => setIncludeView(!includeView)}
          htmlAttributes={{ name: 'include-view' }}
        />
        <br />
        <span>Link:</span>
        <br />
        <span style={{ display: 'block', width: '100%', overflow: 'hidden' }}>
          <TextLink href={getShareURL()} type='external'>
            {getShareURL()}
          </TextLink>
        </span>
      </Dialog.Content>
    </Dialog>
  );
};

export default NeoDashboardSidebarShareModal;

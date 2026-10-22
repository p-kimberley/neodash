import React from 'react';
import NeoSetting from '../component/field/Setting';
import { DASHBOARD_SETTINGS } from '../config/DashboardConfig';
import { IconButton } from '@neo4j-ndl/react';
import { Dialog } from '../component/dialog/Dialog';
import { Cog6ToothIconOutline } from '@neo4j-ndl/react/icons';

export const NeoSettingsModal = ({ dashboardSettings, updateDashboardSetting }) => {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const settings = DASHBOARD_SETTINGS;
  // Else, build the advanced settings view.
  const advancedDashboardSettings = (
    <div style={{ marginLeft: '-10px' }}>
      {Object.keys(settings)
        .filter((setting) => !settings[setting].hidden)
        .map((setting) => (
          <div key={setting}>
            <NeoSetting
              key={setting}
              value={dashboardSettings[setting]}
              type={settings[setting].type}
              disabled={settings[setting].disabled}
              helperText={settings[setting].helperText}
              label={settings[setting].label}
              defaultValue={settings[setting].default}
              choices={settings[setting].values}
              onChange={(e) => updateDashboardSetting(setting, e)}
            />
            <br />
          </div>
        ))}
    </div>
  );

  return (
    <>
      <IconButton description='Settings' className='n-mx-1' onClick={handleClickOpen}>
        <Cog6ToothIconOutline />
      </IconButton>

      <Dialog size='large' isOpen={open} onClose={handleClose}>
        <Dialog.Header>
          <Cog6ToothIconOutline className='icon-base icon-inline text-r' />
          Dashboard Settings
        </Dialog.Header>
        <Dialog.Content>
          You can modify settings for your entire dashboard here.
          <br />
          <br />
          {advancedDashboardSettings}
          <br />
        </Dialog.Content>
      </Dialog>
    </>
  );
};

export default NeoSettingsModal;

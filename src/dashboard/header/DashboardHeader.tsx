import React, { useEffect } from 'react';
import { connect } from 'react-redux';
import { setDashboardTitle } from '../DashboardActions';
import { getDashboardSettings, getDashboardTheme, getDashboardTitle, getPages } from '../DashboardSelectors';
import { applicationGetStandaloneSettings, applicationGetCustomHeader } from '../../application/ApplicationSelectors';
import { getDashboardIsEditable, getPageNumber } from '../../settings/SettingsSelectors';
import { NeoDashboardHeaderLogo } from './DashboardHeaderLogo';
import NeoAboutButton from './DashboardHeaderAboutButton';
import { NeoLogoutButton } from './DashboardHeaderLogoutButton';
import { NeoDashboardHeaderDownloadImageButton } from './DashboardHeaderDownloadImageButton';
import { updateDashboardSetting } from '../../settings/SettingsActions';
import { DarkModeSwitch } from 'react-toggle-dark-mode';
import { DASHBOARD_HEADER_BUTTON_COLOR } from '../../config/ApplicationConfig';
import { Tooltip } from '@mui/material';
import { session } from '../../api/client';

const signedInAs = () => {
  const { me } = session;
  if (!me) {
    return '';
  }
  const role = me.role === 'editor' ? 'Editor' : 'Viewer';
  return `${me.user.name ?? me.user.username} · ${role}`;
};

export const NeoDashboardHeader = ({
  dashboardTitle,
  customHeader,
  connection,
  settings,
  onDownloadImage,
  onAboutModalOpen,
  resetApplication,
  themeMode,
  setTheme,
}) => {
  const downloadImageEnabled = settings ? settings.downloadImageEnabled : false;
  const [dashboardTitleText, setDashboardTitleText] = React.useState(dashboardTitle);

  const [isDarkMode, setDarkMode] = React.useState(themeMode !== 'light');

  const toggleDarkMode = (checked: boolean) => {
    setDarkMode(checked);
  };

  useEffect(() => {
    // Reset text to the dashboard state when the page gets reorganized.
    if (dashboardTitle !== dashboardTitleText) {
      setDashboardTitleText(dashboardTitle);
    }
  }, [dashboardTitle]);

  useEffect(() => {
    setTheme(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  const content = (
    <div className='n-relative n-bg-palette-neutral-bg-weak n-w-full'>
      <div className='n-min-w-full'>
        <div className='n-flex n-justify-between n-h-16 n-items-center n-py-6 md:n-justify-start md:n-space-x-10 n-mx-4'>
          <NeoDashboardHeaderLogo resetApplication={resetApplication} />
          <nav className='n-items-center n-justify-center n-flex n-flex-1 n-w-full n-font-semibold'>
            {customHeader && customHeader.length > 0 ? `${customHeader}` : signedInAs()}
          </nav>
          <div className='sm:n-flex n-items-center n-justify-end md:n-flex-1 lg:n-w-0 n-gap-6'>
            <div className='n-flex n-flex-row n-gap-x-2'>
              <Tooltip title={'Change Theme'} disableInteractive>
                <div>
                  <DarkModeSwitch
                    className={'ndl-icon-btn n-p-2 ndl-large ndl-clean'}
                    style={{}}
                    checked={isDarkMode}
                    onChange={toggleDarkMode}
                    size={24}
                    sunColor={DASHBOARD_HEADER_BUTTON_COLOR || '#000000'}
                    moonColor={'#ff0000'}
                  />
                </div>
              </Tooltip>

              {downloadImageEnabled && <NeoDashboardHeaderDownloadImageButton onDownloadImage={onDownloadImage} />}
              <NeoAboutButton connection={connection} onAboutModalOpen={onAboutModalOpen} />
              <NeoLogoutButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  return content;
};

const mapStateToProps = (state) => ({
  dashboardTitle: getDashboardTitle(state),
  standaloneSettings: applicationGetStandaloneSettings(state),
  customHeader: applicationGetCustomHeader(state),
  pages: getPages(state),
  settings: getDashboardSettings(state),
  editable: getDashboardIsEditable(state),
  pagenumber: getPageNumber(state),
  themeMode: getDashboardTheme(state),
});

const mapDispatchToProps = (dispatch) => ({
  setDashboardTitle: (title: any) => {
    dispatch(setDashboardTitle(title));
  },

  setTheme: (theme: string) => {
    dispatch(updateDashboardSetting('theme', theme));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(NeoDashboardHeader);

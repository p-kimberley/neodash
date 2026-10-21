import React, { useState } from 'react';
import { connect } from 'react-redux';
import { Button, IconButton, Label, Menu, MenuItem, MenuItems, Typography } from '@neo4j-ndl/react';
import {
  ArrowRightOnRectangleIconOutline,
  CheckIconOutline,
  ChevronRightIconOutline,
  ComputerDesktopIconOutline,
  MoonIconOutline,
  SunIconOutline,
} from '@neo4j-ndl/react/icons';
import { Tooltip } from '@mui/material';
import { isEditor, session } from '../api/client';
import { saveDashboardToNeo4jThunk } from '../dashboard/DashboardThunks';
import { signOut } from '../dashboard/header/DashboardHeaderLogoutButton';
import NeoAboutButton from '../dashboard/header/DashboardHeaderAboutButton';
import { NeoDashboardHeaderDownloadImageButton } from '../dashboard/header/DashboardHeaderDownloadImageButton';
import { getDashboardSettings, getDashboardTheme, getDashboardTitle } from '../dashboard/DashboardSelectors';
import { applicationGetConnection, applicationGetThemePreference, applicationIsHomeOpen } from './ApplicationSelectors';
import { setDraft, setThemePreference } from './ApplicationActions';
import { APP_NAME, IS_CUSTOM_LOGO, DASHBOARD_HEADER_BRAND_LOGO, markText } from '../config/ApplicationConfig';

const THEMES = [
  { value: 'light', title: 'Light', icon: <SunIconOutline className='n-w-5 n-h-5' /> },
  { value: 'dark', title: 'Dark', icon: <MoonIconOutline className='n-w-5 n-h-5' /> },
  { value: 'system', title: 'Match system', icon: <ComputerDesktopIconOutline className='n-w-5 n-h-5' /> },
] as const;

const initials = (name: string) =>
  name
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

/** The theme menu: light, dark or follow the operating system. */
const ThemeMenu = ({ preference, theme, onChange }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title='Appearance' disableInteractive>
        <IconButton aria-label='Appearance' clean size='large' onClick={(e) => setAnchor(e.currentTarget)}>
          {theme === 'dark' ? <MoonIconOutline /> : <SunIconOutline />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItems>
          {THEMES.map((t) => (
            <MenuItem
              key={t.value}
              icon={t.icon}
              title={
                <span className='n-flex n-items-center n-justify-between n-gap-6 n-w-full'>
                  {t.title}
                  {preference === t.value ? <CheckIconOutline className='n-w-4 n-h-4' /> : <span className='n-w-4' />}
                </span>
              }
              onClick={() => {
                onChange(t.value);
                setAnchor(null);
              }}
            />
          ))}
        </MenuItems>
      </Menu>
    </>
  );
};

/** Who is signed in, their role, and sign-out. */
const UserMenu = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const me = session.me;
  if (!me) {
    return <></>;
  }
  const name = me.user.name || me.user.username;
  return (
    <>
      <button
        type='button'
        aria-label={`Account: ${name}`}
        className='app-header-user'
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <span className='app-header-avatar' aria-hidden>
          {initials(name)}
        </span>
        <span className='app-header-user-name'>{name}</span>
      </button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <div className='n-px-4 n-py-3 n-flex n-flex-col n-gap-1' style={{ minWidth: 240 }}>
          <Typography variant='subheading-medium'>{name}</Typography>
          {me.user.email ? <Typography variant='body-small'>{me.user.email}</Typography> : <></>}
          <div className='n-mt-1'>
            <Label color={me.role === 'editor' ? 'info' : 'default'} fill='semi-filled'>
              {me.role === 'editor' ? 'Editor' : 'Viewer'}
            </Label>
          </div>
        </div>
        <MenuItems>
          <MenuItem
            icon={<ArrowRightOnRectangleIconOutline className='n-w-5 n-h-5' />}
            title='Sign out'
            onClick={() => {
              setAnchor(null);
              signOut();
            }}
          />
        </MenuItems>
      </Menu>
    </>
  );
};

/**
 * Header shared by the dashboard selector and dashboards: product name (back to the selector),
 * where you are, appearance, help and the account menu.
 */
/** Editors: save the open dashboard; shows whether there are unsaved changes. */
const SaveControl = ({ draft, onSave }) => {
  const [saving, setSaving] = useState(false);
  return (
    <div className='app-header-save'>
      {draft ? (
        <span className='app-header-unsaved'>
          <span className='selector-draft-dot' aria-hidden />
          Unsaved changes
        </span>
      ) : (
        <span className='app-header-saved'>All changes saved</span>
      )}
      <Button
        size='small'
        fill={draft ? 'filled' : 'outlined'}
        disabled={!draft || saving}
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave();
          } finally {
            setSaving(false);
          }
        }}
      >
        Save
      </Button>
    </div>
  );
};

export const AppHeader = ({
  homeOpen,
  draft,
  dashboard,
  onSave,
  dashboardTitle,
  settings,
  connection,
  themePreference,
  theme,
  onHome,
  onThemeChange,
  onDownloadImage,
  onAboutModalOpen,
}) => (
  <header className='app-header'>
    <nav className='app-header-crumbs' aria-label='Breadcrumb'>
      <button type='button' className='app-header-brand' onClick={onHome} title='All dashboards'>
        {IS_CUSTOM_LOGO ? (
          <img src={DASHBOARD_HEADER_BRAND_LOGO} alt='' className='n-h-6 n-w-auto' />
        ) : (
          <span className='app-header-mark' aria-hidden>
            {markText()}
          </span>
        )}
        <span>{APP_NAME}</span>
      </button>
      {!homeOpen && dashboardTitle ? (
        <>
          <ChevronRightIconOutline className='app-header-sep' aria-hidden />
          <span className='app-header-current' aria-current='page'>
            {dashboardTitle}
          </span>
        </>
      ) : (
        <></>
      )}
    </nav>
    <div className='app-header-actions'>
      {!homeOpen && isEditor() ? <SaveControl draft={draft} onSave={() => onSave(dashboard)} /> : <></>}
      {!homeOpen && settings?.downloadImageEnabled && onDownloadImage ? (
        <NeoDashboardHeaderDownloadImageButton onDownloadImage={onDownloadImage} />
      ) : (
        <></>
      )}
      <ThemeMenu preference={themePreference} theme={theme} onChange={onThemeChange} />
      <NeoAboutButton connection={connection} onAboutModalOpen={onAboutModalOpen} />
      <UserMenu />
    </div>
  </header>
);

const mapStateToProps = (state) => ({
  homeOpen: applicationIsHomeOpen(state),
  draft: state.application.draft,
  dashboard: state.dashboard,
  dashboardTitle: getDashboardTitle(state),
  settings: getDashboardSettings(state),
  connection: applicationGetConnection(state),
  themePreference: applicationGetThemePreference(state),
  theme: getDashboardTheme(state),
});

const mapDispatchToProps = (dispatch) => ({
  onThemeChange: (preference) => dispatch(setThemePreference(preference)),
  // Same save as the sidebar's; resolves once the backend has stored it.
  onSave: (dashboard) =>
    new Promise<void>((resolve) => {
      Promise.resolve(
        dispatch(
          saveDashboardToNeo4jThunk(undefined, undefined, dashboard, new Date().toISOString(), undefined, () => {
            dispatch(setDraft(false));
          })
        )
      ).finally(() => resolve());
    }),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppHeader);

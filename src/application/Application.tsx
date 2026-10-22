import React, { Suspense, useEffect, useRef } from 'react';
import { connect, useStore } from 'react-redux';
import { startUrlSync } from './UrlState';
import {
  applicationHasAboutModalOpen,
  applicationIsConnected,
  applicationIsHomeOpen,
  applicationGetDebugState,
  applicationHasReportHelpModalOpen,
} from '../application/ApplicationSelectors';
import { loadApplicationConfigThunk } from '../application/ApplicationThunks';
import {
  setAboutModalOpen,
  setHomeOpen,
  setReportHelpModalOpen,
  setSystemDark,
} from '../application/ApplicationActions';
import AppHeader from './AppHeader';
import { NeoDashboardPlaceholder } from '../dashboard/placeholder/DashboardPlaceholder';
import { downloadComponentAsImage } from '../chart/ChartUtils';
import '@neo4j-ndl/base/lib/neo4j-ds-styles.css';
import { NeedleThemeProvider, Toaster } from '@neo4j-ndl/react';
import { getDashboardTheme } from '../dashboard/DashboardSelectors';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../theme/muiTheme';
import { rememberThemeForDocs } from '../utils/docs';

const NeoReportHelpModal = React.lazy(() => import('../modal/ReportHelpModal'));
const NeoNotificationModal = React.lazy(() => import('../modal/NotificationModal'));
const NeoAboutModal = React.lazy(() => import('../modal/AboutModal'));
const Dashboard = React.lazy(() => import('../dashboard/Dashboard'));
const DashboardSelector = React.lazy(() => import('../dashboard/selector/DashboardSelector'));

/**
 * This is the main application component for NeoDash.
 *
 * Sign-in is handled by the backend before anything renders (see loadApplicationConfigThunk), so
 * there are no connection or welcome screens: once the user is known, the dashboard is shown.
 * See `ApplicationThunks.tsx`, `ApplicationActions.tsx` and `ApplicationSelectors.tsx` for more info.
 */
const Application = ({
  connected,
  homeOpen,
  onHome,
  onSystemThemeChange,
  reportHelpModalOpen,
  aboutModalOpen,
  initializeApplication,
  onAboutModalOpen,
  onAboutModalClose,
  getDebugState,
  onReportHelpModalClose,
  themeMode,
}) => {
  const store = useStore();
  // Start-up runs once per page load. A ref (not state) guards it: React 18's StrictMode runs effects
  // twice in development, and a second start-up installed a second URL sync, which pushed every
  // history entry twice (so Back seemed to do nothing).
  const startup = useRef<Promise<unknown> | undefined>(undefined);

  useEffect(() => {
    startup.current ??= Promise.resolve(initializeApplication());
    // Once signed in and the first dashboard is open, keep the URL and title in step with it.
    let cancelled = false;
    let stopUrlSync: (() => void) | undefined;
    startup.current.then(() => {
      if (!cancelled) {
        stopUrlSync = startUrlSync(store as any);
      }
    });
    return () => {
      cancelled = true;
      stopUrlSync && stopUrlSync();
    };
  }, []);

  // Follow the operating system's light/dark setting for the "Match system" appearance.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => onSystemThemeChange(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // One Material UI theme for the whole app, matching the current appearance.
  const muiTheme = React.useMemo(() => createAppTheme(themeMode === 'dark' ? 'dark' : 'light'), [themeMode]);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (themeMode === 'dark') {
      document.body.classList.add('ndl-theme-dark');
    } else {
      document.body.classList.remove('ndl-theme-dark');
    }
    rememberThemeForDocs(themeMode === 'dark' ? 'dark' : 'light');
  }, [themeMode]);

  return (
    // The design system's theme also scopes its portalled menus, popovers and dialogs.
    <NeedleThemeProvider theme={themeMode === 'dark' ? 'dark' : 'light'} wrapperProps={{ isWrappingChildren: false }}>
      <ThemeProvider theme={muiTheme}>
        <div ref={ref} className={`n-bg-neutral-bg-default n-h-screen n-w-screen n-flex n-flex-col n-overflow-hidden`}>
          {connected ? (
            <>
              <AppHeader
                onHome={onHome}
                onDownloadImage={() => downloadComponentAsImage(ref)}
                onAboutModalOpen={onAboutModalOpen}
              />
              <Suspense fallback=''>{homeOpen ? <DashboardSelector /> : <Dashboard />}</Suspense>
            </>
          ) : (
            <NeoDashboardPlaceholder></NeoDashboardPlaceholder>
          )}
          {/* TODO - move all models into a pop-ups (or modals) component. */}
          <Suspense fallback=''>
            <NeoAboutModal open={aboutModalOpen} handleClose={onAboutModalClose} getDebugState={getDebugState} />
          </Suspense>
          <Suspense fallback=''>
            <NeoReportHelpModal open={reportHelpModalOpen} handleClose={onReportHelpModalClose} />
          </Suspense>
          <Suspense fallback=''>
            <NeoNotificationModal></NeoNotificationModal>
          </Suspense>
          {/* Short confirmations (e.g. a table value copied), shown by toast() anywhere in the app. */}
          <Toaster />
        </div>
      </ThemeProvider>
    </NeedleThemeProvider>
  );
};

const mapStateToProps = (state) => ({
  connected: applicationIsConnected(state),
  homeOpen: applicationIsHomeOpen(state),
  aboutModalOpen: applicationHasAboutModalOpen(state),
  reportHelpModalOpen: applicationHasReportHelpModalOpen(state),
  getDebugState: () => {
    return applicationGetDebugState(state);
  }, // TODO - change this to be variable instead of a function?
  themeMode: getDashboardTheme(state),
});

const mapDispatchToProps = (dispatch) => ({
  initializeApplication: () => dispatch(loadApplicationConfigThunk()),
  onHome: () => dispatch(setHomeOpen(true)),
  onSystemThemeChange: (dark: boolean) => dispatch(setSystemDark(dark)),
  onReportHelpModalClose: (_) => dispatch(setReportHelpModalOpen(false)),
  onAboutModalOpen: (_) => dispatch(setAboutModalOpen(true)),
  onAboutModalClose: (_) => dispatch(setAboutModalOpen(false)),
});

Application.displayName = 'Application';

export default connect(mapStateToProps, mapDispatchToProps)(Application);

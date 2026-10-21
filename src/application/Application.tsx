import React, { Suspense, useEffect } from 'react';
import { connect, useStore } from 'react-redux';
import { startUrlSync } from './UrlState';
import {
  applicationHasAboutModalOpen,
  applicationIsConnected,
  applicationGetDebugState,
  applicationHasReportHelpModalOpen,
} from '../application/ApplicationSelectors';
import { loadApplicationConfigThunk } from '../application/ApplicationThunks';
import { setAboutModalOpen, setReportHelpModalOpen } from '../application/ApplicationActions';
import { NeoDashboardPlaceholder } from '../dashboard/placeholder/DashboardPlaceholder';
import { downloadComponentAsImage } from '../chart/ChartUtils';
import '@neo4j-ndl/base/lib/neo4j-ds-styles.css';
import { getDashboardTheme } from '../dashboard/DashboardSelectors';

const NeoReportHelpModal = React.lazy(() => import('../modal/ReportHelpModal'));
const NeoNotificationModal = React.lazy(() => import('../modal/NotificationModal'));
const NeoAboutModal = React.lazy(() => import('../modal/AboutModal'));
const Dashboard = React.lazy(() => import('../dashboard/Dashboard'));

/**
 * This is the main application component for NeoDash.
 *
 * Sign-in is handled by the backend before anything renders (see loadApplicationConfigThunk), so
 * there are no connection or welcome screens: once the user is known, the dashboard is shown.
 * See `ApplicationThunks.tsx`, `ApplicationActions.tsx` and `ApplicationSelectors.tsx` for more info.
 */
const Application = ({
  connected,
  reportHelpModalOpen,
  aboutModalOpen,
  initializeApplication,
  onAboutModalOpen,
  onAboutModalClose,
  getDebugState,
  onReportHelpModalClose,
  themeMode,
}) => {
  const [initialized, setInitialized] = React.useState(false);
  const store = useStore();

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      // Once signed in and the first dashboard is open, keep the URL and title in step with it.
      let stopUrlSync;
      Promise.resolve(initializeApplication()).then(() => {
        stopUrlSync = startUrlSync(store as any);
      });
      return () => stopUrlSync && stopUrlSync();
    }
  }, []);

  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (themeMode === 'dark') {
      document.body.classList.add('ndl-theme-dark');
    } else {
      document.body.classList.remove('ndl-theme-dark');
    }
  }, [themeMode]);

  return (
    <div
      ref={ref}
      className={`n-bg-palette-neutral-bg-default n-h-screen n-w-screen n-flex n-flex-col n-overflow-hidden`}
    >
      {connected ? (
        <Suspense fallback=''>
          <Dashboard
            onDownloadDashboardAsImage={(_) => downloadComponentAsImage(ref)}
            onAboutModalOpen={onAboutModalOpen}
            resetApplication={() => {}}
          ></Dashboard>
        </Suspense>
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
    </div>
  );
};

const mapStateToProps = (state) => ({
  connected: applicationIsConnected(state),
  aboutModalOpen: applicationHasAboutModalOpen(state),
  reportHelpModalOpen: applicationHasReportHelpModalOpen(state),
  getDebugState: () => {
    return applicationGetDebugState(state);
  }, // TODO - change this to be variable instead of a function?
  themeMode: getDashboardTheme(state),
});

const mapDispatchToProps = (dispatch) => ({
  initializeApplication: () => dispatch(loadApplicationConfigThunk()),
  onReportHelpModalClose: (_) => dispatch(setReportHelpModalOpen(false)),
  onAboutModalOpen: (_) => dispatch(setAboutModalOpen(true)),
  onAboutModalClose: (_) => dispatch(setAboutModalOpen(false)),
});

Application.displayName = 'Application';

export default connect(mapStateToProps, mapDispatchToProps)(Application);

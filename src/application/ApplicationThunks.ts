import { setDashboard } from '../dashboard/DashboardActions';
import { NEODASH_VERSION, VERSION_TO_MIGRATE } from '../dashboard/DashboardReducer';
import { assignDashboardUuidIfNotPresentThunk, upgradeDashboardVersion } from '../dashboard/DashboardThunks';
import { createNotificationThunk } from '../page/PageThunks';
import { updateSessionParameterThunk } from '../settings/SettingsThunks';
import {
  setConnected,
  setConnectionModalOpen,
  setConnectionProperties,
  setWelcomeScreenOpen,
  clearNotification,
  setSSOEnabled,
  setSSOProviders,
  setStandaloneEnabled,
  setAboutModalOpen,
  setStandaloneDashboardDatabase,
  setReportHelpModalOpen,
  setDraft,
  setCustomHeader,
  setDeprecationNotice,
} from './ApplicationActions';
import { setLoggingMode } from './logging/LoggingActions';
import { api, session as apiSession } from '../api/client';
import { applyUrlStateThunk, parseUrl } from './UrlState';

/**
 * Initializes the NeoDash application against the NeoDash backend.
 *
 * There is no Neo4j connection to configure any more: the backend decides who the user is (via
 * OIDC) and what they may do. Viewers get NeoDash's read-only "standalone" mode; editors get the
 * editor. The dashboard, page and parameters to show come from the URL (see UrlState.ts).
 */
export const loadApplicationConfigThunk = () => async (dispatch: any, getState: any) => {
  let me;
  let config;
  try {
    [me, config] = await Promise.all([api.me(), api.config()]);
  } catch (e: any) {
    // 401 means we are already being redirected to sign in.
    if (e?.status !== 401) {
      dispatch(createNotificationThunk('Unable to reach the NeoDash server', e?.message ?? String(e)));
    }
    return;
  }
  apiSession.me = me;
  apiSession.config = config;
  const viewer = me.role !== 'editor';

  try {
    dispatch(setSSOEnabled(false, ''));
    dispatch(setSSOProviders([]));
    dispatch(
      setStandaloneEnabled(
        viewer,
        window.location.protocol.replace(':', ''),
        window.location.host,
        '',
        config.defaultDatabase,
        '',
        config.dashboardDatabase,
        '',
        undefined,
        undefined,
        true,
        // Viewers may browse all dashboards; database switching follows the backend's list.
        true,
        config.databases.length > 1,
        config.databases.length > 1,
        config.databases.join(',')
      )
    );
    dispatch(setStandaloneDashboardDatabase(config.dashboardDatabase));
    // Audit logging happens on the backend; the browser no longer writes _Neodash_Log nodes.
    dispatch(setLoggingMode('0'));
    dispatch(setDeprecationNotice(false));
    dispatch(setCustomHeader(''));
    dispatch(
      setConnectionProperties(
        window.location.protocol.replace(':', ''),
        window.location.host,
        '',
        config.defaultDatabase,
        me.user.username,
        ''
      )
    );
    dispatch(updateSessionParameterThunk('session_uri', window.location.origin));
    dispatch(updateSessionParameterThunk('session_database', config.defaultDatabase));
    dispatch(updateSessionParameterThunk('session_username', me.user.username));

    // Auto-upgrade the dashboard version if an old version is cached.
    const state = getState();
    if (state.dashboard && state.dashboard.version !== NEODASH_VERSION) {
      while (VERSION_TO_MIGRATE[state.dashboard.version]) {
        const upgradedDashboard = upgradeDashboardVersion(
          state.dashboard,
          state.dashboard.version,
          VERSION_TO_MIGRATE[state.dashboard.version]
        );
        dispatch(setDashboard(upgradedDashboard));
        dispatch(setDraft(true));
      }
    }

    dispatch(setWelcomeScreenOpen(false));
    dispatch(setConnectionModalOpen(false));
    dispatch(setAboutModalOpen(false));
    dispatch(setReportHelpModalOpen(false));
    dispatch(clearNotification());
    dispatch(assignDashboardUuidIfNotPresentThunk());

    // Without a dashboard in the URL, users start on the dashboard selector.
    const target = parseUrl(window.location);
    await dispatch(applyUrlStateThunk(target, { fresh: true, keepDraft: !viewer }));
    dispatch(setConnected(true));
  } catch (e) {
    console.log(e);
    dispatch(createNotificationThunk('Unable to start NeoDash', String(e)));
  }
};

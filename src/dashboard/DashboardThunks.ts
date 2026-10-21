import { createNotificationThunk } from '../page/PageThunks';
import { updateDashboardSetting } from '../settings/SettingsActions';
import { addPage, movePage, removePage, resetDashboardState, setDashboard, setDashboardUuid } from './DashboardActions';
import { setDraft, setParametersToLoadAfterConnecting, setWelcomeScreenOpen } from '../application/ApplicationActions';
import { updateGlobalParametersThunk, setPageNumberThunk } from '../settings/SettingsThunks';
import { createUUID } from '../utils/uuid';
import { api, isEditor, session as apiSession } from '../api/client';
import { NEODASH_VERSION, VERSION_TO_MIGRATE } from './DashboardReducer';

export const removePageThunk = (number) => (dispatch: any, getState: any) => {
  try {
    const numberOfPages = getState().dashboard.pages.length;
    const pageIndex = getState().dashboard.settings.pagenumber;
    if (numberOfPages == 1) {
      dispatch(createNotificationThunk('Cannot remove page', "You can't remove the only page of a dashboard."));
      return;
    }

    dispatch(removePage(number));

    if (number <= pageIndex) {
      dispatch(updateDashboardSetting('pagenumber', Math.max(pageIndex - 1)));
    }
  } catch (e) {
    dispatch(createNotificationThunk('Unable to remove page', e));
  }
};

export const addPageThunk = () => (dispatch: any, getState: any) => {
  try {
    const numberOfPages = getState().dashboard.pages.length;
    dispatch(addPage());
    dispatch(updateDashboardSetting('pagenumber', numberOfPages));
  } catch (e) {
    dispatch(createNotificationThunk('Unable to create page', e));
  }
};

export const movePageThunk = (oldIndex: number, newIndex: number) => (dispatch: any, getState: any) => {
  try {
    const pageIndex = getState().dashboard.settings.pagenumber;
    if (pageIndex == oldIndex) {
      dispatch(updateDashboardSetting('pagenumber', newIndex));
    } else if (oldIndex > pageIndex && pageIndex >= newIndex) {
      dispatch(updateDashboardSetting('pagenumber', pageIndex + 1));
    } else if (oldIndex < pageIndex && pageIndex <= newIndex) {
      dispatch(updateDashboardSetting('pagenumber', pageIndex - 1));
    }
    dispatch(movePage(oldIndex, newIndex));
  } catch (e) {
    dispatch(createNotificationThunk('Unable to move page', e));
  }
};

export const loadDashboardThunk = (uuid, text) => (dispatch: any, getState: any) => {
  try {
    if (text.length == 0) {
      throw 'No dashboard file specified. Did you select a file?';
    }
    if (text.trim() == '{}') {
      dispatch(resetDashboardState());
      return;
    }
    let dashboard = JSON.parse(text);

    // If we load a debug report, take out the 'dashboard' value and set it to safe values.
    if (dashboard._persist && dashboard.application && dashboard.dashboard) {
      dispatch(
        createNotificationThunk('Loaded a Debug Report', "Recovery-mode active. All report types were set to 'table'.")
      );
      dashboard.dashboard.pages.map((p) => {
        p.reports.map((r) => {
          r.type = 'table';
        });
      });
      dashboard = dashboard.dashboard;
    }

    let patched;
    [dashboard, patched] = patchDashboardVersion(dashboard, dashboard.version);
    if (patched) {
      dispatch(
        createNotificationThunk(
          'Successfully patched dashboard',
          `Your old dashboard has been patched. You might need to refresh this page and reactivate extensions.`
        )
      );
    }

    // Attempt upgrade if dashboard version is outdated. All steps run before anything is rendered:
    // intermediate versions (e.g. 2.2, whose reports have no ids yet) would crash the cards.
    const originalVersion = dashboard.version;
    while (VERSION_TO_MIGRATE[dashboard.version]) {
      dashboard = upgradeDashboardVersion(dashboard, dashboard.version, VERSION_TO_MIGRATE[dashboard.version]);
    }
    if (dashboard.version !== originalVersion) {
      dispatch(setWelcomeScreenOpen(false));
      dispatch(setDraft(true));
      // Viewers can't save, so the upgrade notice is only useful to editors.
      if (isEditor()) {
        dispatch(
          createNotificationThunk(
            'Dashboard upgraded',
            `This dashboard was saved by an older NeoDash (${originalVersion}) and has been upgraded to ${dashboard.version}. Save it to keep the upgrade.`
          )
        );
      }
    }

    if (dashboard.version !== NEODASH_VERSION) {
      throw `Invalid dashboard version: ${dashboard.version}. Try restarting the application, or retrieve your cached dashboard using a debug report.`;
    }

    // Reverse engineer the minimal set of fields from the selection loaded.
    dashboard.pages.forEach((p) => {
      p.reports.forEach((r) => {
        if (r.selection) {
          r.fields = [];
          Object.keys(r.selection).forEach((f) => {
            r.fields.push([f, r.selection[f]]);
          });
        }
      });
    });

    dispatch(setDashboard(dashboard));

    // Check if we have to navigate to a page
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const pageToSet = urlParams.get('page');
    if (pageToSet !== '' && pageToSet !== null) {
      if (!isNaN(pageToSet)) {
        dispatch(setPageNumberThunk(pageToSet));
      }
    }

    const { application } = getState();

    dispatch(updateGlobalParametersThunk(application.parametersToLoadAfterConnecting));
    dispatch(updateGlobalParametersThunk(dashboard.settings.parameters));
    dispatch(setParametersToLoadAfterConnecting(null));
    // Pre-2.3.4 dashboards might now always have a UUID. Set it if not present.
    if (!dashboard.uuid) {
      dispatch(setDashboardUuid(uuid));
    }
  } catch (e) {
    console.log(e);
    dispatch(createNotificationThunk('Unable to load dashboard', e));
  }
};

// Dashboard storage goes through the backend (server/src/dashboards.ts), which keeps the NeoDash 2.4
// format. The driver/database arguments are kept so existing callers don't change; they are unused.

export const saveDashboardToNeo4jThunk =
  (_driver, _database, dashboard, _date, _user, onSuccess) => async (dispatch: any) => {
    try {
      let { uuid } = dashboard;
      // Dashboards pre-2.3.4 may not always have a UUID. If this is the case, generate one just before we save.
      if (!uuid) {
        uuid = createUUID();
        dashboard.uuid = uuid;
        dispatch(setDashboardUuid(uuid));
      }
      await api.saveDashboard(uuid, dashboard);
      onSuccess(uuid);
    } catch (e: any) {
      dispatch(createNotificationThunk('Unable to save dashboard', e?.message ?? String(e)));
    }
  };

export const deleteDashboardFromNeo4jThunk = (_driver, _database, uuid, onSuccess) => async (dispatch: any) => {
  try {
    await api.deleteDashboard(uuid);
    onSuccess(uuid);
  } catch (e: any) {
    dispatch(createNotificationThunk('Unable to delete dashboard', e?.message ?? String(e)));
  }
};

/** Loads a stored dashboard and passes its JSON text to the callback (as the old Cypher version did). */
export const loadDashboardFromNeo4jThunk = (_driver, _database, uuid, callback) => async (dispatch: any) => {
  try {
    const stored = await api.getDashboard(uuid);
    // The node's uuid is authoritative: viewer queries and saves are addressed by it.
    callback(JSON.stringify({ ...stored.content, uuid: stored.uuid }));
  } catch (e: any) {
    dispatch(
      createNotificationThunk(
        'Unable to load dashboard',
        e?.status === 404 ? `A dashboard with UUID '${uuid}' does not exist.` : e?.message ?? String(e)
      )
    );
  }
};

export const loadDashboardFromNeo4jByNameThunk = (_driver, _database, name, callback) => async (dispatch: any) => {
  try {
    const [match] = (await api.listDashboards())
      .filter((d) => d.title === name)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!match) {
      dispatch(
        createNotificationThunk(
          `Unable to load dashboard "${name}".`,
          'A dashboard with the provided name could not be found.'
        )
      );
      return;
    }
    dispatch(loadDashboardFromNeo4jThunk(undefined, undefined, match.uuid, callback));
  } catch (e: any) {
    dispatch(createNotificationThunk('Unable to load dashboard', e?.message ?? String(e)));
  }
};

export const loadDashboardListFromNeo4jThunk = (_driver, _database, callback) => async (dispatch: any) => {
  try {
    const dashboards = await api.listDashboards();
    callback(dashboards.map((d, index) => ({ ...d, index })));
  } catch (e: any) {
    callback([]);
    dispatch(createNotificationThunk('Unable to load dashboard list', e?.message ?? String(e)));
  }
};

/** The databases reports may use, as configured on the backend. */
export const loadDatabaseListFromNeo4jThunk = (_driver, callback) => async (dispatch: any) => {
  try {
    callback((apiSession.config ?? (await api.config())).databases);
  } catch (e: any) {
    dispatch(createNotificationThunk('Unable to list databases', e?.message ?? String(e)));
  }
};

export const assignDashboardUuidIfNotPresentThunk = () => (dispatch: any, getState: any) => {
  const { uuid } = getState().dashboard;
  if (!uuid) {
    dispatch(setDashboardUuid(createUUID()));
  }
};
export function patchDashboardVersion(dashboard: any, version: any) {
  let patched = false;
  if (version == '2.4') {
    dashboard.pages.forEach((p) => {
      p.reports.forEach((r) => {
        if (r.type == 'graph' || r.type == 'map' || r.type == 'graph3d') {
          r.settings?.actionsRules?.forEach((rule) => {
            if (
              rule?.field &&
              (rule?.condition === 'onNodeClick' || rule?.condition == 'Click') &&
              rule.value.includes('.')
            ) {
              let val = rule.value.split('.');
              rule.value = val[val.length - 1] || rule.value;
              patched = true;
            }
          });
        }
      });
    });
  }
  return [dashboard, patched];
}

export function upgradeDashboardVersion(dashboard: any, origin: string, target: string) {
  if (origin == '2.3' && target == '2.4') {
    dashboard.pages.forEach((p) => {
      p.reports.forEach((r) => {
        r.x *= 2;
        r.y *= 2;
        r.width *= 2;
        r.height *= 2;

        if (r.type == 'graph' || r.type == 'map' || r.type == 'graph3d') {
          r.settings?.actionsRules?.forEach((rule) => {
            if (
              rule?.field &&
              (rule?.condition === 'onNodeClick' || rule?.condition == 'Click') &&
              rule.value.includes('.')
            ) {
              let val = rule.value.split('.');
              rule.value = val[val.length - 1] || rule.value;
            }
          });
        }
      });
    });
    dashboard.version = '2.4';
    return dashboard;
  }
  // In 2.3 uuids were created, as well as a new format for specificing extensions.
  if (origin == '2.2' && target == '2.3') {
    dashboard.pages.forEach((p) => {
      p.reports.forEach((r) => {
        r.id = createUUID();
      });
    });

    dashboard.extensions = {
      'advanced-charts': {
        active: true,
      },
      styling: {
        active: true,
      },
      active: true,
      activeReducers: [],
    };
    dashboard.version = '2.3';
    return dashboard;
  }
  if (origin == '2.1' && target == '2.2') {
    // In 2.1, extensions were enabled by default. Therefore if we migrate, enable them.
    dashboard.extensions = {
      'advanced-charts': true,
      styling: true,
    };
    dashboard.version = '2.2';
    return dashboard;
  }
  if (origin == '2.0' && target == '2.1') {
    dashboard.pages.forEach((p, i) => {
      // From v2.1 onwards, reports will have their x,y positions explicitly specified.
      // v2.0 dashboards do not have this, therefore we must assign them.
      // Additionally we divide the old report height by 1.5 (adjusted vertical scaling factor).

      let xPos = 0;
      let yPos = 0;
      let rowHeight = 1;
      p.reports.forEach((r, j) => {
        const reportWidth = parseInt(r.width);
        const reportHeight = parseInt(r.height);
        dashboard.pages[i].reports[j] = { x: xPos, y: yPos, ...dashboard.pages[i].reports[j] };
        dashboard.pages[i].reports[j].height = reportHeight / 1.5;
        xPos += reportWidth;
        rowHeight = Math.max(reportHeight / 1.5, rowHeight);
        if (xPos >= 12) {
          xPos = 0;
          yPos += rowHeight;
          rowHeight = 1;
        }
      });
    });
    dashboard.version = '2.1';
    return dashboard;
  }
  if (origin == '1.1' && target == '2.0') {
    const upgradedDashboard = {};
    upgradedDashboard.title = dashboard.title;
    upgradedDashboard.version = '2.0';
    upgradedDashboard.settings = {
      pagenumber: dashboard.pagenumber,
      editable: dashboard.editable,
    };
    const upgradedDashboardPages = [];
    dashboard.pages.forEach((p) => {
      const newPage = {};
      newPage.title = p.title;
      const newPageReports = [];
      p.reports.forEach((r) => {
        // only migrate value report types.
        if (
          ['table', 'graph', 'bar', 'line', 'map', 'value', 'json', 'select', 'iframe', 'text'].indexOf(r.type) == -1
        ) {
          return;
        }
        if (r.type == 'select') {
          r.query = '';
        }
        const newPageReport = {
          title: r.title,
          width: r.width,
          height: r.height * 0.75,
          type: r.type,
          parameters: r.parameters,
          query: r.query,
          selection: {},
          settings: {},
        };

        newPageReports.push(newPageReport);
      });
      newPage.reports = newPageReports;
      upgradedDashboardPages.push(newPage);
    });
    upgradedDashboard.pages = upgradedDashboardPages;
    return upgradedDashboard;
  }
  throw new Error(`Invalid upgrade path: ${origin} --> ${target}`);
}

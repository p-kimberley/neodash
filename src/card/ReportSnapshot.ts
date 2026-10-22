import {
  updateAllSelections,
  updateFields,
  updateReportDatabase,
  updateReportQuery,
  updateReportSetting,
  updateReportTitle,
  updateReportType,
} from './CardActions';

/** What a report is (its query, type, fields and settings), to put it back later: Cancel, Undo. */
export interface ReportSnapshot {
  type: string;
  title: string;
  query: string;
  database?: string;
  selection: Record<string, any>;
  settings: Record<string, any>;
  fields: any[];
}

export const snapshotReport = (report: any): ReportSnapshot => ({
  type: report.type,
  title: report.title ?? '',
  query: report.query ?? '',
  database: report.database,
  selection: JSON.parse(JSON.stringify(report.selection ?? {})),
  settings: JSON.parse(JSON.stringify(report.settings ?? {})),
  fields: JSON.parse(JSON.stringify(report.fields ?? [])),
});

/** Puts a report on the current page back as a snapshot has it. */
export const restoreReportThunk = (reportId: string, snapshot: ReportSnapshot) => (dispatch: any, getState: any) => {
  // Report ids are strings, though the card actions are typed with numbers.
  const id: any = reportId;
  const state = getState();
  const { pagenumber } = state.dashboard.settings;
  const report = state.dashboard.pages[pagenumber]?.reports.find((r) => r.id === id);
  if (!report) {
    return;
  }
  dispatch(updateReportType(pagenumber, id, snapshot.type));
  dispatch(updateReportQuery(pagenumber, id, snapshot.query));
  dispatch(updateReportTitle(pagenumber, id, snapshot.title));
  if (snapshot.database !== report.database) {
    dispatch(updateReportDatabase(pagenumber, id, snapshot.database));
  }
  dispatch(updateFields(pagenumber, id, snapshot.fields));
  dispatch(updateAllSelections(pagenumber, id, snapshot.selection));
  Object.keys(report.settings ?? {})
    .filter((setting) => !(setting in snapshot.settings))
    .forEach((setting) => dispatch(updateReportSetting(pagenumber, id, setting, undefined)));
  Object.entries(snapshot.settings).forEach(([setting, value]) =>
    dispatch(updateReportSetting(pagenumber, id, setting, value))
  );
};

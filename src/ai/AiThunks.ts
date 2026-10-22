import type { AiReport } from '../api/client';
import {
  updateAllSelections,
  updateFields,
  updateReportQuery,
  updateReportSetting,
  updateReportTitle,
  updateReportType,
} from '../card/CardActions';
import { updateReportSettingThunk, updateReportTypeThunk } from '../card/CardThunks';

/** What a report was before Build with AI changed it, so the change can be undone. */
export interface ReportSnapshot {
  type: string;
  title: string;
  query: string;
  selection: Record<string, any>;
  settings: Record<string, any>;
  fields: any[];
}

const findReport = (state: any, id: string) => {
  const { pagenumber } = state.dashboard.settings;
  return { pagenumber, report: state.dashboard.pages[pagenumber].reports.find((r) => r.id === id) };
};

/**
 * Applies a report Build with AI built: its type, query, title (when the report has none yet), fields
 * and settings. The report runs when it next shows. Returns what the report was, for Undo.
 */
export const applyAiReportThunk = (reportId: string, built: AiReport) => (dispatch: any, getState: any) => {
  // Report ids are strings, though the card actions are typed with numbers.
  const id: any = reportId;
  const { pagenumber, report } = findReport(getState(), id);
  const snapshot: ReportSnapshot = {
    type: report.type,
    title: report.title ?? '',
    query: report.query ?? '',
    selection: { ...(report.selection ?? {}) },
    settings: { ...(report.settings ?? {}) },
    fields: [...(report.fields ?? [])],
  };
  if (built.type !== report.type) {
    dispatch(updateReportTypeThunk(id, built.type));
  }
  dispatch(updateReportQuery(pagenumber, id, built.query));
  if (built.title && !(report.title ?? '').trim()) {
    dispatch(updateReportTitle(pagenumber, id, built.title));
  }
  // The fields name the query's columns; they are kept when the query's results arrive.
  dispatch(updateAllSelections(pagenumber, id, { ...built.selection }));
  Object.entries(built.settings ?? {}).forEach(([setting, value]) =>
    dispatch(updateReportSettingThunk(id, setting, value))
  );
  return snapshot;
};

/** Puts a report back as it was before Build with AI changed it. */
export const restoreReportThunk = (reportId: string, snapshot: ReportSnapshot) => (dispatch: any, getState: any) => {
  const id: any = reportId;
  const { pagenumber, report } = findReport(getState(), id);
  if (!report) {
    return;
  }
  dispatch(updateReportType(pagenumber, id, snapshot.type));
  dispatch(updateReportQuery(pagenumber, id, snapshot.query));
  dispatch(updateReportTitle(pagenumber, id, snapshot.title));
  dispatch(updateFields(pagenumber, id, snapshot.fields));
  dispatch(updateAllSelections(pagenumber, id, snapshot.selection));
  Object.keys(report.settings ?? {})
    .filter((setting) => !(setting in snapshot.settings))
    .forEach((setting) => dispatch(updateReportSetting(pagenumber, id, setting, undefined)));
  Object.entries(snapshot.settings).forEach(([setting, value]) =>
    dispatch(updateReportSetting(pagenumber, id, setting, value))
  );
};

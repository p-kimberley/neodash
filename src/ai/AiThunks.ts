import type { AiReport } from '../api/client';
import { updateAllSelections, updateReportQuery, updateReportTitle } from '../card/CardActions';
import { updateReportSettingThunk, updateReportTypeThunk } from '../card/CardThunks';
import { restoreReportThunk, snapshotReport, type ReportSnapshot } from '../card/ReportSnapshot';

export { restoreReportThunk, type ReportSnapshot };

/**
 * Applies a report Build with AI built: its type, query, title (when the report has none yet), fields
 * and settings. The report runs when it next shows. Returns what the report was, for Undo.
 */
export const applyAiReportThunk = (reportId: string, built: AiReport) => (dispatch: any, getState: any) => {
  // Report ids are strings, though the card actions are typed with numbers.
  const id: any = reportId;
  const state = getState();
  const { pagenumber } = state.dashboard.settings;
  const report = state.dashboard.pages[pagenumber].reports.find((r) => r.id === id);
  const snapshot: ReportSnapshot = snapshotReport(report);
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

import { valueIsArray, valueIsObject } from '../../../chart/ChartUtils';
import { REPORT_TYPES } from '../../../config/ReportConfig';
import { ADVANCED_REPORT_TYPES } from '../../../extensions/advancedcharts/AdvancedChartsReportConfig';
import { getReportTypes } from '../../../extensions/ExtensionUtils';
import { FORMS } from '../../../extensions/forms/FormsReportConfig';
import { NEODASH_VERSION, VERSION_TO_MIGRATE } from '../../DashboardReducer';

// Editor state that is rebuilt on load, and secrets that never leave the browser.
const OMITTED_KEYS = [
  'fields',
  'settingsOpen',
  'advancedSettingsOpen',
  'collapseTimeout',
  'apiKey', // Added for query-translator extension
];

/**
 * Removes the specified set of keys from the nested dictionary.
 */
const filterNestedDict = (value: any, removedKeys: any[]) => {
  if (value == undefined) {
    return value;
  }

  if (valueIsArray(value)) {
    return value.map((v) => filterNestedDict(v, removedKeys));
  }

  if (valueIsObject(value)) {
    const newValue = {};
    Object.keys(value).forEach((k) => {
      if (removedKeys.indexOf(k) != -1) {
        newValue[k] = undefined;
      } else {
        newValue[k] = filterNestedDict(value[k], removedKeys);
      }
    });
    return newValue;
  }
  return value;
};

/** A dashboard as the JSON shown by Export and Edit JSON. */
export const dashboardToJson = (dashboard: any) => JSON.stringify(filterNestedDict(dashboard, OMITTED_KEYS), null, 2);

const isObject = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Dashboard JSON with its uuid set to `uuid`, which decides the dashboard that saving it writes to.
 * Text that isn't a JSON object comes back unchanged, for loading to report the problem.
 */
export const withDashboardUuid = (text: string, uuid: string) => {
  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed)) {
      return text;
    }
    // A debug report wraps the dashboard (see loadDashboardThunk).
    const dashboard = parsed._persist && isObject(parsed.dashboard) ? parsed.dashboard : parsed;
    dashboard.uuid = uuid;
    return JSON.stringify(parsed);
  } catch (e) {
    return text;
  }
};

// Report types an extension adds, by the extension's key in `dashboard.extensions`.
const EXTENSION_REPORT_TYPES = {
  'advanced-charts': { name: 'Advanced Charts', types: ADVANCED_REPORT_TYPES },
  forms: { name: 'Forms', types: FORMS },
};
const MAX_PROBLEMS = 20;

const isNumber = (value: any) => typeof value === 'number' && Number.isFinite(value);

/**
 * Checks dashboard JSON before it replaces a dashboard: everything loading it relies on, so a
 * dashboard that passes opens without errors. Returns the problems found (none when it's valid),
 * and a summary of what it holds.
 */
export const verifyDashboardJson = (text: string): { problems: string[]; summary?: string } => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    return { problems: [`This isn't valid JSON: ${e.message}`] };
  }
  if (!isObject(parsed)) {
    return { problems: ['This JSON is not a dashboard: it should be an object with "pages".'] };
  }
  // A debug report wraps the dashboard (see loadDashboardThunk).
  const dashboard = parsed._persist && isObject(parsed.dashboard) ? parsed.dashboard : parsed;
  const problems: string[] = [];

  const { version } = dashboard;
  if (version !== NEODASH_VERSION && !VERSION_TO_MIGRATE[version]) {
    const supported = [...Object.keys(VERSION_TO_MIGRATE), NEODASH_VERSION].join(', ');
    problems.push(`"version" is ${JSON.stringify(version)}: it should be one of ${supported}.`);
  }
  if (dashboard.title !== undefined && typeof dashboard.title !== 'string') {
    problems.push('"title" should be text.');
  }
  if (!isObject(dashboard.settings)) {
    problems.push('"settings" should be an object.');
  } else if (dashboard.settings.parameters !== undefined && !isObject(dashboard.settings.parameters)) {
    problems.push('"settings.parameters" should be an object.');
  }
  // Older versions are upgraded with their own extension format; only the current one is checked.
  const { extensions } = dashboard;
  const checkExtensions = version === NEODASH_VERSION;
  if (checkExtensions && extensions !== undefined && !isObject(extensions)) {
    problems.push('"extensions" should be an object.');
  }
  if (!Array.isArray(dashboard.pages) || dashboard.pages.length == 0) {
    problems.push('"pages" should be a list with at least one page.');
    return { problems };
  }

  const allTypes = { ...REPORT_TYPES, ...ADVANCED_REPORT_TYPES, ...FORMS };
  const enabledTypes = checkExtensions && isObject(extensions) ? getReportTypes(extensions) : allTypes;
  const needsIds = version !== '1.1' && version !== '2.0' && version !== '2.1' && version !== '2.2';
  const ids = new Set();
  let reportCount = 0;
  dashboard.pages.forEach((page, p) => {
    const pageName = `Page ${p + 1}${isObject(page) && typeof page.title === 'string' ? ` ("${page.title}")` : ''}`;
    if (!isObject(page)) {
      problems.push(`${pageName} should be an object.`);
      return;
    }
    if (page.title !== undefined && typeof page.title !== 'string') {
      problems.push(`${pageName}: "title" should be text.`);
    }
    if (!Array.isArray(page.reports)) {
      problems.push(`${pageName}: "reports" should be a list.`);
      return;
    }
    page.reports.forEach((report, r) => {
      reportCount += 1;
      const reportName = `${pageName}, report ${r + 1}${
        isObject(report) && typeof report.title === 'string' && report.title ? ` ("${report.title}")` : ''
      }`;
      if (!isObject(report)) {
        problems.push(`${reportName} should be an object.`);
        return;
      }
      if (typeof report.type !== 'string' || !allTypes[report.type]) {
        problems.push(`${reportName}: ${JSON.stringify(report.type)} is not a report type.`);
      } else if (!enabledTypes[report.type]) {
        const extension = Object.entries(EXTENSION_REPORT_TYPES).find(([, e]) => e.types[report.type]);
        problems.push(
          `${reportName}: "${report.type}" needs the ${extension?.[1].name} extension, which "extensions" doesn't enable.`
        );
      }
      if (needsIds) {
        if (typeof report.id !== 'string' || report.id.length == 0) {
          problems.push(`${reportName}: "id" should be text.`);
        } else if (ids.has(report.id)) {
          problems.push(`${reportName}: "id" ${report.id} is used by another report too.`);
        } else {
          ids.add(report.id);
        }
      }
      ['x', 'y', 'width', 'height'].forEach((key) => {
        if (report[key] !== undefined && (!isNumber(report[key]) || report[key] < 0)) {
          problems.push(`${reportName}: "${key}" should be a number, 0 or more.`);
        }
      });
      if (report.query !== undefined && typeof report.query !== 'string') {
        problems.push(`${reportName}: "query" should be text.`);
      }
      if (report.settings !== undefined && !isObject(report.settings)) {
        problems.push(`${reportName}: "settings" should be an object.`);
      } else if (
        report.settings?.actionsRules !== undefined &&
        (!Array.isArray(report.settings.actionsRules) || !report.settings.actionsRules.every(isObject))
      ) {
        problems.push(`${reportName}: "settings.actionsRules" should be a list of rules.`);
      }
    });
  });

  if (problems.length > MAX_PROBLEMS) {
    const more = problems.length - MAX_PROBLEMS;
    return { problems: [...problems.slice(0, MAX_PROBLEMS), `...and ${more} more.`] };
  }
  const pages = dashboard.pages.length;
  return {
    problems,
    summary: `${pages} page${pages == 1 ? '' : 's'}, ${reportCount} report${reportCount == 1 ? '' : 's'}`,
  };
};

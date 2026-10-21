// A stand-in for the neo4j-driver Driver that runs every query through the NeoDash backend.
//
// Components keep using the familiar driver.session().run(...) / beginTransaction() calls, so
// charts, parameter selects and extensions work unchanged. What gets sent depends on the role:
// - editors send the Cypher itself (plus where it came from, for the audit log);
// - viewers send only a reference to the report in the saved dashboard, and the backend runs the
//   Cypher it has stored. A query that is not part of the dashboard is refused for viewers.

import { api, ApiError, isEditor, session as apiSession } from './client';

export interface DashboardLookup {
  /** The dashboard currently open in the UI (Redux state). */
  getDashboard: () => any;
}

export interface RunOptions {
  database?: string;
  rowLimit?: number;
  timeoutSeconds?: number;
}

interface ReportMatch {
  id?: string;
  page: number;
  index: number;
}

/** Finds the report whose saved query is exactly this one, preferring the current page. */
function findReportByQuery(dashboard: any, query: string): ReportMatch | null {
  const pages: any[] = dashboard?.pages ?? [];
  const current = dashboard?.settings?.pagenumber ?? 0;
  const order = [current, ...pages.keys()].filter((p, i, all) => p < pages.length && all.indexOf(p) === i);
  for (const page of order) {
    const index = (pages[page]?.reports ?? []).findIndex((r: any) => r?.query === query);
    if (index >= 0) {
      return { id: pages[page].reports[index].id, page, index };
    }
  }
  return null;
}

export class ApiDriver {
  /** Lets callers tell this apart from a real driver. */
  readonly isApiDriver = true;

  constructor(private lookup: DashboardLookup) {}

  /** Runs one query; returns driver Records plus whether the backend truncated the result. */
  run(query: string, parameters: Record<string, unknown> = {}, options: RunOptions = {}) {
    const dashboard = this.lookup.getDashboard();
    const match = findReportByQuery(dashboard, query);
    const database = options.database || undefined;
    const common = {
      parameters,
      rowLimit: options.rowLimit,
      timeoutSeconds: options.timeoutSeconds,
    };
    if (!isEditor()) {
      if (match && dashboard?.uuid) {
        return api.query({ ...common, dashboard: dashboard.uuid, report: match });
      }
      // The backend would refuse it anyway. This happens e.g. when a report from the previous
      // dashboard runs once more while another dashboard opens, so don't send it at all.
      return Promise.reject(
        new ApiError(
          403,
          'forbidden',
          'This query is not part of the saved dashboard, so it can only be run by an editor.'
        )
      );
    }
    return api.query({
      ...common,
      query,
      database,
      context: match && dashboard?.uuid ? { dashboard: dashboard.uuid, page: match.page, report: match.id } : undefined,
    });
  }

  session(config: { database?: string } = {}) {
    return new ApiSession(this, config.database);
  }

  // The rest of the driver interface, for code that calls it.
  verifyConnectivity() {
    return Promise.resolve({ address: window.location.host, version: 'NeoDash backend' });
  }

  supportsMultiDb() {
    return Promise.resolve((apiSession.config?.databases.length ?? 1) > 1);
  }

  close() {
    return Promise.resolve();
  }
}

/** Mimics neo4j-driver's Result: awaitable, resolving to { records, summary }. */
function result(promise: Promise<{ keys: string[]; records: any[] }>) {
  const settled = promise.then(({ keys, records }) => ({ keys, records, summary: { query: {} } }));
  return Object.assign(settled, {
    keys: () => settled.then((r) => r.keys),
    summary: () => settled.then((r) => r.summary),
    subscribe(observer: {
      onKeys?: (k: string[]) => void;
      onNext?: (r: any) => void;
      onCompleted?: (s: any) => void;
      onError?: (e: any) => void;
    }) {
      settled.then(
        (r) => {
          observer.onKeys?.(r.keys);
          r.records.forEach((rec) => observer.onNext?.(rec));
          observer.onCompleted?.(r.summary);
        },
        (e) => observer.onError?.(e)
      );
    },
  });
}

class ApiTransaction {
  private open = true;

  constructor(
    private driver: ApiDriver,
    private database?: string,
    private timeoutSeconds?: number
  ) {}

  run(query: string, parameters: Record<string, unknown> = {}) {
    return result(this.driver.run(query, parameters, { database: this.database, timeoutSeconds: this.timeoutSeconds }));
  }

  commit() {
    this.open = false;
    return Promise.resolve();
  }

  rollback() {
    this.open = false;
    return Promise.resolve();
  }

  close() {
    this.open = false;
    return Promise.resolve();
  }

  isOpen() {
    return this.open;
  }
}

class ApiSession {
  constructor(
    private driver: ApiDriver,
    private database?: string
  ) {}

  run(query: string, parameters: Record<string, unknown> = {}, config?: { timeout?: number }) {
    return result(
      this.driver.run(query, parameters, { database: this.database, timeoutSeconds: toSeconds(config?.timeout) })
    );
  }

  beginTransaction(config?: { timeout?: number }) {
    return new ApiTransaction(this.driver, this.database, toSeconds(config?.timeout));
  }

  readTransaction<T>(work: (tx: ApiTransaction) => T) {
    return Promise.resolve(work(this.beginTransaction()));
  }

  writeTransaction<T>(work: (tx: ApiTransaction) => T) {
    return Promise.resolve(work(this.beginTransaction()));
  }

  executeRead<T>(work: (tx: ApiTransaction) => T) {
    return this.readTransaction(work);
  }

  executeWrite<T>(work: (tx: ApiTransaction) => T) {
    return this.writeTransaction(work);
  }

  lastBookmark() {
    return [];
  }

  close() {
    return Promise.resolve();
  }
}

const toSeconds = (ms?: number) => (typeof ms === 'number' && ms > 0 ? ms / 1000 : undefined);

export const isApiDriver = (driver: any): driver is ApiDriver => Boolean(driver?.isApiDriver);

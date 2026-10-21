import neo4j, { type Driver } from 'neo4j-driver';

// Dashboards are stored exactly as NeoDash 2.4 stores them, so the legacy UI and this backend can
// share a database: (:_Neodash_Dashboard {uuid, title, version, user, content: <JSON string>, date}).

export interface DashboardSummary {
  uuid: string;
  title: string;
  date: string | null;
  author: string | null;
  version: string | null;
}

export interface StoredDashboard extends DashboardSummary {
  content: any;
}

export interface ReportRef {
  /** Report id. Dashboards saved before ids existed have none, so page/index is the fallback. */
  id?: string;
  page?: number;
  index?: number;
}

export interface ResolvedReport {
  query: string;
  type: string;
  title: string;
  database?: string;
  page: number;
  index: number;
  id?: string;
}

export class DashboardStore {
  private cache = new Map<string, { at: number; dashboard: StoredDashboard | null }>();

  constructor(
    private driver: Driver,
    private database: string,
    private cacheTtlMs = 5000
  ) {}

  private async run(query: string, params: Record<string, unknown>, write = false) {
    return this.driver.executeQuery(query, params, {
      database: this.database,
      routing: write ? neo4j.routing.WRITE : neo4j.routing.READ,
    });
  }

  async list(): Promise<DashboardSummary[]> {
    const { records } = await this.run(
      `MATCH (n:_Neodash_Dashboard)
       RETURN n.uuid AS uuid, n.title AS title, toString(n.date) AS date, n.user AS author, n.version AS version
       ORDER BY toLower(n.title) ASC`,
      {}
    );
    return records.map((r) => ({
      uuid: r.get('uuid'),
      title: r.get('title'),
      date: r.get('date'),
      author: r.get('author'),
      version: r.get('version'),
    }));
  }

  async get(uuid: string): Promise<StoredDashboard | null> {
    const cached = this.cache.get(uuid);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) return cached.dashboard;

    const { records } = await this.run(
      `MATCH (n:_Neodash_Dashboard {uuid: $uuid})
       RETURN n.uuid AS uuid, n.title AS title, toString(n.date) AS date, n.user AS author, n.version AS version,
              n.content AS content
       ORDER BY n.date DESC LIMIT 1`,
      { uuid }
    );
    const r = records[0];
    const dashboard = r
      ? {
          uuid: r.get('uuid'),
          title: r.get('title'),
          date: r.get('date'),
          author: r.get('author'),
          version: r.get('version'),
          content: JSON.parse(r.get('content')),
        }
      : null;
    this.cache.set(uuid, { at: Date.now(), dashboard });
    return dashboard;
  }

  /** Same MERGE as NeoDash's saveDashboardToNeo4jThunk, so either UI can overwrite the other's saves. */
  async save(uuid: string, dashboard: any, user: string): Promise<void> {
    await this.run(
      `MERGE (n:_Neodash_Dashboard {uuid: $uuid})
       SET n.title = $title, n.version = $version, n.user = $user, n.content = $content, n.date = datetime()`,
      {
        uuid,
        title: dashboard.title ?? 'Untitled dashboard',
        version: dashboard.version ?? null,
        user,
        content: JSON.stringify({ ...dashboard, uuid }, null, 2),
      },
      true
    );
    this.cache.delete(uuid);
  }

  async delete(uuid: string): Promise<boolean> {
    const { records } = await this.run(
      'MATCH (n:_Neodash_Dashboard {uuid: $uuid}) DETACH DELETE n RETURN count(*) AS deleted',
      { uuid },
      true
    );
    this.cache.delete(uuid);
    return Number(records[0]?.get('deleted') ?? 0) > 0;
  }
}

/** Finds a report in dashboard JSON by id, falling back to its position. */
export function findReport(content: any, ref: ReportRef): ResolvedReport | null {
  const pages: any[] = Array.isArray(content?.pages) ? content.pages : [];
  const describe = (report: any, page: number, index: number): ResolvedReport | null =>
    report && typeof report.query === 'string'
      ? {
          query: report.query,
          type: report.type,
          title: report.title ?? '',
          database: typeof report.database === 'string' && report.database ? report.database : undefined,
          page,
          index,
          id: report.id,
        }
      : null;

  if (ref.id) {
    for (const [p, page] of pages.entries()) {
      const reports: any[] = Array.isArray(page?.reports) ? page.reports : [];
      const index = reports.findIndex((r) => r?.id === ref.id);
      if (index >= 0) return describe(reports[index], p, index);
    }
  }
  if (ref.page !== undefined && ref.index !== undefined) {
    const report = pages[ref.page]?.reports?.[ref.index];
    // Never fall back to a different report that happens to sit at that position.
    if (report && (!ref.id || !report.id || report.id === ref.id)) return describe(report, ref.page, ref.index);
  }
  return null;
}

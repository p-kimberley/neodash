// Client for the NeoDash backend (see server/README.md). The browser never talks to Neo4j directly:
// queries, dashboard storage and sign-in all go through these calls.

import neo4j from 'neo4j-driver';
import { decode, encodeParameters } from '../../server/src/codec';

export type Role = 'viewer' | 'editor';

export interface Me {
  user: { sub: string; username: string; name?: string; email?: string };
  role: Role;
  can: { edit: boolean; runAdHocQueries: boolean };
  sessionExpiresAt: number | null;
}

export interface BackendConfig {
  loginUrl: string;
  logoutUrl: string;
  databases: string[];
  defaultDatabase: string;
  dashboardDatabase: string;
  limits: { maxRowLimit: number; defaultTimeoutSeconds: number; maxTimeoutSeconds: number };
}

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

export interface QueryRequest {
  query?: string;
  dashboard?: string;
  report?: { id?: string; page?: number; index?: number };
  database?: string;
  parameters?: Record<string, unknown>;
  rowLimit?: number;
  timeoutSeconds?: number;
  context?: { dashboard?: string; page?: number; report?: string };
}

export interface QueryResponse {
  keys: string[];
  records: any[];
  truncated: boolean;
  durationMs: number;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public neo4jCode?: string) {
    super(message);
  }
}

/** Where the backend lives. Same origin in production; the dev server proxies /api and /auth. */
const BASE = '';

/** Sends the browser to sign in, coming back to the current page afterwards. */
export function redirectToLogin() {
  window.location.assign(`${BASE}/auth/login?returnTo=${encodeURIComponent(window.location.href)}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'unauthenticated', 'Your session has expired. Redirecting to sign in…');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'error', error.message ?? response.statusText, error.neo4jCode);
  }
  return body as T;
}

export const api = {
  me: () => request<Me>('/api/me'),
  config: () => request<BackendConfig>('/api/config'),
  listDashboards: async () => (await request<{ dashboards: DashboardSummary[] }>('/api/dashboards')).dashboards,
  getDashboard: (uuid: string) => request<StoredDashboard>(`/api/dashboards/${encodeURIComponent(uuid)}`),
  saveDashboard: (uuid: string, dashboard: any) =>
    request<{ uuid: string }>(`/api/dashboards/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      body: JSON.stringify(dashboard),
    }),
  deleteDashboard: (uuid: string) =>
    request<{ uuid: string }>(`/api/dashboards/${encodeURIComponent(uuid)}`, { method: 'DELETE' }),
  logout: () => request<{ logoutUrl: string }>('/auth/logout', { method: 'POST', body: '{}' }),

  /** Runs a query and returns neo4j-driver Records, so existing chart code works unchanged. */
  async query(req: QueryRequest) {
    const response = await request<QueryResponse>('/api/query', {
      method: 'POST',
      body: JSON.stringify({ ...req, parameters: encodeParameters(req.parameters ?? {}) }),
    });
    const records = response.records.map(
      (row) =>
        new neo4j.types.Record(
          response.keys,
          row.map((v) => decode(v, neo4j as any))
        )
    );
    return { keys: response.keys, records, truncated: response.truncated, durationMs: response.durationMs };
  },
};

/** Who is signed in. Set once at start-up, before the dashboard renders. */
export const session: { me?: Me; config?: BackendConfig } = {};

export const isEditor = () => session.me?.role === 'editor';

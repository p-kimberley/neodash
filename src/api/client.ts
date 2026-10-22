// Client for the NeoDash backend (see server/README.md). The browser never talks to Neo4j directly:
// queries, dashboard storage and sign-in all go through these calls.

import { Record as Neo4jRecord } from 'neo4j-driver-core';
import { decode, encodeParameters } from '../../server/src/codec';
import { neo4jValues } from './neo4jValues';

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
  maps?: { tileUrl: string; tileAttribution: string; dataUrl: string };
  /** Build with AI: whether the server has a language model configured (and switched on), and which. */
  ai?: { enabled: boolean; model?: string };
}

export interface Text2CypherRequest {
  question: string;
  database?: string;
  reportType?: string;
  /** Earlier questions for the same report and the queries they produced. */
  history?: { question: string; query: string }[];
  examples?: { question: string; answer: string }[];
  context?: { dashboard?: string; page?: number; report?: string };
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
  constructor(
    public status: number,
    public code: string,
    message: string,
    public neo4jCode?: string,
    /** The rest of the server's error (e.g. a failed build's problems). */
    public details?: Record<string, any>
  ) {
    super(message);
  }
}

/** A report as Build with AI builds or suggests it. */
export interface AiReport {
  type: string;
  title: string;
  query: string;
  selection: Record<string, string | string[]>;
  settings: Record<string, unknown>;
  why?: string;
}

export interface AiRequest {
  prompt: string;
  database?: string;
  catalogue: { types: any[] };
  context: any;
  /** A suggestion the user picked, to build. */
  suggestion?: AiReport;
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
    throw new ApiError(response.status, error.code ?? 'error', error.message ?? response.statusText, error.neo4jCode, error);
  }
  return body as T;
}

// Start-up requests give up rather than leave the app on its loading spinner if the server never answers.
const STARTUP_TIMEOUT_MS = 20_000;

/**
 * How long to wait for a query's answer. The server stops a query at its time limit (the report's,
 * at most the server's maximum), so an answer later than that, plus time to send a large result,
 * was lost on the way: the report then shows an error instead of loading forever.
 */
const ANSWER_MARGIN_SECONDS = 30;
const answerDeadlineSeconds = (timeoutSeconds?: number) => {
  const limits = session.config?.limits;
  const requested = timeoutSeconds ?? limits?.defaultTimeoutSeconds ?? 20;
  return Math.min(requested, limits?.maxTimeoutSeconds ?? requested) + ANSWER_MARGIN_SECONDS;
};

export const api = {
  me: () => request<Me>('/api/me', { signal: AbortSignal.timeout(STARTUP_TIMEOUT_MS) }),
  config: () => request<BackendConfig>('/api/config', { signal: AbortSignal.timeout(STARTUP_TIMEOUT_MS) }),
  listDashboards: async () => (await request<{ dashboards: DashboardSummary[] }>('/api/dashboards')).dashboards,
  getDashboard: (uuid: string) => request<StoredDashboard>(`/api/dashboards/${encodeURIComponent(uuid)}`),
  saveDashboard: (uuid: string, dashboard: any) =>
    request<{ uuid: string }>(`/api/dashboards/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      body: JSON.stringify(dashboard),
    }),
  deleteDashboard: (uuid: string) =>
    request<{ uuid: string }>(`/api/dashboards/${encodeURIComponent(uuid)}`, { method: 'DELETE' }),
  /** Asks the server's language model for a query answering the question (editors only). */
  text2cypher: (req: Text2CypherRequest) =>
    request<{ query: string; attempts: number; model: string; durationMs: number }>('/api/ai/query', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  /** Build with AI: up to three checked report suggestions for a dashboard (editors only). */
  aiSuggest: (req: AiRequest, signal?: AbortSignal) =>
    request<{ suggestions: AiReport[]; model: string; durationMs: number }>('/api/ai/suggest', {
      method: 'POST',
      body: JSON.stringify(req),
      signal,
    }),
  /** Build with AI: one checked report from a description or a picked suggestion (editors only). */
  aiBuild: (req: AiRequest, signal?: AbortSignal) =>
    request<{ report: AiReport; attempts: number; warnings: string[]; model: string; durationMs: number }>(
      '/api/ai/build',
      { method: 'POST', body: JSON.stringify(req), signal }
    ),
  logout: () => request<{ logoutUrl: string }>('/auth/logout', { method: 'POST', body: '{}' }),

  /** Runs a query and returns Neo4j driver Records, so existing chart code works unchanged. */
  async query(req: QueryRequest) {
    const seconds = answerDeadlineSeconds(req.timeoutSeconds);
    let response: QueryResponse;
    try {
      response = await request<QueryResponse>('/api/query', {
        method: 'POST',
        body: JSON.stringify({ ...req, parameters: encodeParameters(req.parameters ?? {}) }),
        signal: AbortSignal.timeout(seconds * 1000),
      });
    } catch (e: any) {
      if (e?.name === 'TimeoutError') {
        throw new ApiError(
          0,
          'no_answer',
          `No answer from the server after ${seconds} seconds: the connection may have dropped. Refresh the report to try again.`
        );
      }
      throw e;
    }
    const records = response.records.map(
      (row) =>
        new Neo4jRecord(
          response.keys,
          row.map((v) => decode(v, neo4jValues))
        )
    );
    return { keys: response.keys, records, truncated: response.truncated, durationMs: response.durationMs };
  },
};

/** Who is signed in. Set once at start-up, before the dashboard renders. */
export const session: { me?: Me; config?: BackendConfig } = {};

export const isEditor = () => session.me?.role === 'editor';

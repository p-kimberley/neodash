import { getAllParameters, getPageNumber } from '../settings/SettingsSelectors';

// The dashboard as Build with AI sees it: its pages, parameters, the report being built and the
// other reports (so suggestions don't repeat them).

/** A parameter value as plain JSON (Neo4j integers and temporal values as numbers or text). */
const plain = (value: any) => {
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.toString === 'function') {
    return value.toString();
  }
  return value;
};

const isBlank = (query?: string) => !query || query.trim() === '';

export const buildContext = (state: any, reportId: string) => {
  const pages: any[] = state.dashboard?.pages ?? [];
  const pagenumber = getPageNumber(state) ?? 0;
  const parameters = Object.fromEntries(
    Object.entries(getAllParameters(state) ?? {}).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map(plain) : plain(value),
    ])
  );
  const report = pages[pagenumber]?.reports?.find((r) => r.id === reportId) ?? {};
  const others = pages
    .flatMap((p) => p.reports ?? [])
    .filter((r) => r.id !== reportId && !isBlank(r.query))
    .slice(0, 60)
    .map((r) => ({ title: `${r.title ?? ''}`.slice(0, 200), type: r.type, query: `${r.query}`.slice(0, 2000) }));
  return {
    dashboard: {
      title: `${state.dashboard?.title ?? ''}`.slice(0, 200),
      pages: pages.map((p) => `${p.title ?? ''}`.slice(0, 200)).slice(0, 50),
      page: `${pages[pagenumber]?.title ?? ''}`.slice(0, 200),
    },
    parameters,
    report: {
      title: `${report.title ?? ''}`.slice(0, 200),
      type: report.type,
      query: isBlank(report.query) ? undefined : `${report.query}`.slice(0, 10_000),
      width: Number(report.width) || undefined,
      height: Number(report.height) || undefined,
    },
    others,
  };
};

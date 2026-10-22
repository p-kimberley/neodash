import React from 'react';
import type { AiReport } from '../api/client';
import { schemeColors, useChartMode } from '../chart/echarts/theme';

// A small picture (about 60px) of what a Build with AI option would show, drawn from the first rows of
// its query's trial run: bars, lines, slices, a number, a table, nodes... Not the real chart, but its
// shape, layout and colours.

const SIZE = 60;
const PAD = 6;
const INNER = SIZE - 2 * PAD;
const MUTED = 'var(--theme-color-neutral-border-strong)';
const INK = 'var(--theme-color-neutral-text-weak)';

const num = (v: any) => (typeof v === 'number' ? v : Number(v));
const finite = (v: any) => Number.isFinite(num(v));

/** The values of a report field's column(s) in the preview rows. */
const columnOf = (option: AiReport, field: string): number => {
  const name = option.selection?.[field];
  const column = Array.isArray(name) ? name[0] : name;
  return column ? (option.preview?.columns ?? []).indexOf(column) : -1;
};

const compact = (v: number) =>
  Math.abs(v) >= 1000
    ? new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      } as Intl.NumberFormatOptions).format(v)
    : `${Math.round(v * 100) / 100}`;

function Bars({ option, colors }: { option: AiReport; colors: string[] }) {
  const rows = option.preview?.rows ?? [];
  const index = columnOf(option, 'index');
  const value = columnOf(option, 'value');
  const key = columnOf(option, 'key');
  if (index < 0 || value < 0) {
    return null;
  }
  const categories: string[] = [];
  const keys: string[] = [];
  const totals = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const category = `${row[index]}`;
    const series = key >= 0 ? `${row[key]}` : '';
    if (!finite(row[value])) {
      continue;
    }
    if (!totals.has(category)) {
      if (categories.length >= 6) {
        continue;
      }
      categories.push(category);
      totals.set(category, new Map());
    }
    if (!keys.includes(series)) {
      keys.push(series);
    }
    const t = totals.get(category)!;
    t.set(series, (t.get(series) ?? 0) + num(row[value]));
  }
  const max = Math.max(
    1,
    ...categories.map((c) => [...totals.get(c)!.values()].reduce((a, b) => a + Math.max(0, b), 0))
  );
  const horizontal = option.settings?.layout === 'horizontal';
  const slot = INNER / Math.max(1, categories.length);
  const thick = Math.min(9, slot * 0.6);
  const shapes: React.ReactNode[] = [];
  categories.forEach((category, i) => {
    let offset = 0;
    keys.forEach((series, k) => {
      const v = Math.max(0, totals.get(category)!.get(series) ?? 0);
      const length = (v / max) * INNER;
      if (!length) {
        return;
      }
      const color = colors[(keys.length > 1 ? k : 0) % colors.length];
      const at = PAD + i * slot + (slot - thick) / 2;
      shapes.push(
        horizontal ? (
          <rect key={`${i}-${k}`} x={PAD + offset} y={at} width={length} height={thick} rx={1.5} fill={color} />
        ) : (
          <rect
            key={`${i}-${k}`}
            x={at}
            y={SIZE - PAD - offset - length}
            width={thick}
            height={length}
            rx={1.5}
            fill={color}
          />
        )
      );
      offset += length;
    });
  });
  return (
    <>
      {horizontal ? (
        <line x1={PAD} y1={PAD} x2={PAD} y2={SIZE - PAD} stroke={MUTED} strokeWidth={1} />
      ) : (
        <line x1={PAD} y1={SIZE - PAD} x2={SIZE - PAD} y2={SIZE - PAD} stroke={MUTED} strokeWidth={1} />
      )}
      {shapes}
    </>
  );
}

function Lines({ option, colors }: { option: AiReport; colors: string[] }) {
  const rows = option.preview?.rows ?? [];
  const columns = option.preview?.columns ?? [];
  const names = [option.selection?.value].flat().filter(Boolean) as string[];
  const series = names
    .map((n) => columns.indexOf(n))
    .filter((i) => i >= 0)
    .slice(0, 4);
  if (!series.length || rows.length < 2) {
    return null;
  }
  const values = series.flatMap((s) => rows.map((r) => num(r[s])).filter(Number.isFinite));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (v: number) => SIZE - PAD - ((v - min) / (max - min || 1)) * INNER;
  const x = (i: number) => PAD + (i / (rows.length - 1)) * INNER;
  return (
    <>
      <line x1={PAD} y1={SIZE - PAD} x2={SIZE - PAD} y2={SIZE - PAD} stroke={MUTED} strokeWidth={1} />
      {series.map((s, k) => {
        const points = rows
          .map((r, i) => (finite(r[s]) ? `${x(i).toFixed(1)},${y(num(r[s])).toFixed(1)}` : ''))
          .filter(Boolean);
        const color = colors[k % colors.length];
        return (
          <g key={s}>
            {series.length === 1 ? (
              <polygon
                points={`${PAD},${SIZE - PAD} ${points.join(' ')} ${SIZE - PAD},${SIZE - PAD}`}
                fill={color}
                opacity={0.12}
              />
            ) : (
              <></>
            )}
            <polyline points={points.join(' ')} fill='none' stroke={color} strokeWidth={1.5} strokeLinejoin='round' />
          </g>
        );
      })}
    </>
  );
}

const arc = (cx: number, cy: number, r: number, inner: number, start: number, end: number) => {
  const p = (radius: number, angle: number) => [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = p(r, start);
  const [x2, y2] = p(r, end);
  if (inner <= 0) {
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
  }
  const [x3, y3] = p(inner, end);
  const [x4, y4] = p(inner, start);
  return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
};

function Pie({ option, colors }: { option: AiReport; colors: string[] }) {
  const rows = option.preview?.rows ?? [];
  const value = columnOf(option, 'value');
  if (value < 0) {
    return null;
  }
  const values = rows
    .map((r) => Math.max(0, num(r[value])))
    .filter((v) => v > 0)
    .slice(0, 8);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) {
    return null;
  }
  const inner =
    Number(option.settings?.innerRadius) > 0 ? (INNER / 2) * Math.min(0.8, Number(option.settings?.innerRadius)) : 0;
  let angle = 0;
  return (
    <>
      {values.map((v, i) => {
        const start = angle;
        angle += (v / total) * Math.PI * 2;
        return (
          <path
            key={i}
            d={arc(SIZE / 2, SIZE / 2, INNER / 2, inner, start, Math.min(angle, start + Math.PI * 2 - 0.001))}
            fill={colors[i % colors.length]}
            stroke='var(--theme-color-neutral-bg-weak)'
            strokeWidth={1}
          />
        );
      })}
    </>
  );
}

function Value({ option, colors, gauge }: { option: AiReport; colors: string[]; gauge?: boolean }) {
  const cell = option.preview?.rows?.[0]?.[0];
  const text = finite(cell) ? compact(num(cell)) : `${cell ?? ''}`.slice(0, 6);
  const size = text.length <= 3 ? 20 : text.length <= 5 ? 15 : 11;
  return (
    <>
      {gauge ? (
        <path
          d={arc(SIZE / 2, SIZE / 2 + 8, INNER / 2, INNER / 2 - 5, -Math.PI / 2, Math.PI / 2)}
          fill={colors[0]}
          opacity={0.85}
        />
      ) : (
        <></>
      )}
      <text
        x={SIZE / 2}
        y={gauge ? SIZE / 2 + 10 : SIZE / 2 + size / 3}
        textAnchor='middle'
        fontSize={gauge ? 11 : size}
        fontWeight={600}
        fill='var(--theme-color-neutral-text-default)'
      >
        {text}
      </text>
    </>
  );
}

function Table({ option }: { option: AiReport }) {
  const rows = (option.preview?.rows ?? []).slice(0, 5);
  const columns = Math.min(3, option.preview?.columns.length ?? 0) || 2;
  const width = INNER / columns;
  return (
    <>
      <rect x={PAD} y={PAD} width={INNER} height={6} rx={1.5} fill={MUTED} opacity={0.7} />
      {Array.from({ length: Math.max(rows.length, 3) }, (_, r) =>
        Array.from({ length: columns }, (_, c) => {
          const text = `${rows[r]?.[c] ?? ''}`;
          const w = Math.max(4, Math.min(width - 3, (text.length || 4) * 1.6));
          return (
            <rect
              key={`${r}-${c}`}
              x={PAD + c * width}
              y={PAD + 10 + r * 8}
              width={w}
              height={3}
              rx={1}
              fill={INK}
              opacity={0.5}
            />
          );
        })
      )}
    </>
  );
}

/** Nodes and relationships among a row's values (graphs, sankeys), and points with coordinates (maps). */
const entities = (rows: unknown[][]) => {
  const nodes = new Map<string, { label: string; lat?: number; lon?: number }>();
  const rels: { start: string; end: string }[] = [];
  const visit = (v: any) => {
    if (!v || typeof v !== 'object') {
      return;
    }
    if (Array.isArray(v)) {
      return v.forEach(visit);
    }
    if (typeof v.node === 'string') {
      nodes.set(v.id, { label: v.node, lat: v.lat, lon: v.lon });
    } else if (typeof v.rel === 'string') {
      rels.push({ start: v.start, end: v.end });
    } else if (Array.isArray(v.path)) {
      v.path.forEach(visit);
    }
  };
  rows.forEach((row) => row.forEach(visit));
  return { nodes, rels };
};

function Graph({ option, colors }: { option: AiReport; colors: string[] }) {
  const { nodes, rels } = entities(option.preview?.rows ?? []);
  const ids = [...nodes.keys()].slice(0, 12);
  if (!ids.length) {
    return null;
  }
  const labels = [...new Set(ids.map((id) => nodes.get(id)!.label))];
  const at = (i: number) => {
    const angle = (i / ids.length) * Math.PI * 2;
    return [SIZE / 2 + (INNER / 2 - 3) * Math.sin(angle), SIZE / 2 - (INNER / 2 - 3) * Math.cos(angle)];
  };
  return (
    <>
      {rels
        .filter((r) => ids.includes(r.start) && ids.includes(r.end))
        .slice(0, 20)
        .map((r, i) => {
          const [x1, y1] = at(ids.indexOf(r.start));
          const [x2, y2] = at(ids.indexOf(r.end));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={MUTED} strokeWidth={1} />;
        })}
      {ids.map((id, i) => {
        const [x, y] = at(i);
        return (
          <circle key={id} cx={x} cy={y} r={3.5} fill={colors[labels.indexOf(nodes.get(id)!.label) % colors.length]} />
        );
      })}
    </>
  );
}

function MapPoints({ option, colors }: { option: AiReport; colors: string[] }) {
  const points = [...entities(option.preview?.rows ?? []).nodes.values()].filter(
    (n) => Number.isFinite(n.lat) && Number.isFinite(n.lon)
  );
  if (!points.length) {
    return null;
  }
  const lats = points.map((p) => p.lat!);
  const lons = points.map((p) => p.lon!);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  return (
    <>
      <rect x={PAD - 2} y={PAD - 2} width={INNER + 4} height={INNER + 4} rx={4} fill={MUTED} opacity={0.25} />
      {points.slice(0, 40).map((p, i) => (
        <circle
          key={i}
          cx={PAD + ((p.lon! - minLon) / (maxLon - minLon || 1)) * INNER}
          cy={PAD + (1 - (p.lat! - minLat) / (maxLat - minLat || 1)) * INNER}
          r={2.5}
          fill={colors[0]}
        />
      ))}
    </>
  );
}

function Hierarchy({
  option,
  colors,
  shape,
}: {
  option: AiReport;
  colors: string[];
  shape: 'rects' | 'rings' | 'circles';
}) {
  const rows = option.preview?.rows ?? [];
  const path = columnOf(option, 'index');
  const value = columnOf(option, 'value');
  const groups = new Map<string, number>();
  for (const row of rows) {
    const first = Array.isArray(row[path]) ? `${(row[path] as any[])[0]}` : `${row[path] ?? ''}`;
    const v = finite(row[value]) ? Math.max(0, num(row[value])) : 1;
    groups.set(first, (groups.get(first) ?? 0) + v);
  }
  const sizes = [...groups.values()].slice(0, 6);
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  if (shape === 'rings') {
    let angle = 0;
    return (
      <>
        {sizes.map((s, i) => {
          const start = angle;
          angle += (s / total) * Math.PI * 2;
          return (
            <g key={i}>
              <path
                d={arc(SIZE / 2, SIZE / 2, 13, 0, start, Math.min(angle, start + Math.PI * 2 - 0.001))}
                fill={colors[i % colors.length]}
              />
              <path
                d={arc(SIZE / 2, SIZE / 2, INNER / 2, 15, start, Math.min(angle, start + Math.PI * 2 - 0.001))}
                fill={colors[i % colors.length]}
                opacity={0.6}
              />
            </g>
          );
        })}
      </>
    );
  }
  if (shape === 'circles') {
    return (
      <>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={INNER / 2} fill={MUTED} opacity={0.3} />
        {sizes.map((s, i) => {
          const angle = (i / sizes.length) * Math.PI * 2;
          const r = Math.max(3, Math.sqrt(s / total) * (INNER / 3));
          return (
            <circle
              key={i}
              cx={SIZE / 2 + (INNER / 4) * Math.sin(angle)}
              cy={SIZE / 2 - (INNER / 4) * Math.cos(angle)}
              r={r}
              fill={colors[i % colors.length]}
            />
          );
        })}
      </>
    );
  }
  let x = PAD;
  return (
    <>
      {sizes.map((s, i) => {
        const w = (s / total) * INNER;
        const rect = (
          <rect
            key={i}
            x={x}
            y={PAD}
            width={Math.max(0, w - 1)}
            height={INNER}
            rx={1.5}
            fill={colors[i % colors.length]}
          />
        );
        x += w;
        return rect;
      })}
    </>
  );
}

function TextLines() {
  return (
    <>
      <rect x={PAD} y={PAD + 2} width={INNER * 0.6} height={5} rx={1.5} fill={INK} opacity={0.8} />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={PAD}
          y={PAD + 14 + i * 8}
          width={INNER * (i === 3 ? 0.55 : 0.95)}
          height={3}
          rx={1}
          fill={INK}
          opacity={0.45}
        />
      ))}
    </>
  );
}

const DRAW: Record<string, (props: { option: AiReport; colors: string[] }) => React.ReactNode> = {
  bar: Bars,
  line: Lines,
  pie: Pie,
  value: (p) => <Value {...p} />,
  gauge: (p) => <Value {...p} gauge />,
  table: ({ option }) => <Table option={option} />,
  json: ({ option }) => <Table option={option} />,
  graph: Graph,
  graph3d: Graph,
  sankey: Graph,
  gantt: Graph,
  map: MapPoints,
  treeMap: (p) => <Hierarchy {...p} shape='rects' />,
  sunburst: (p) => <Hierarchy {...p} shape='rings' />,
  circlePacking: (p) => <Hierarchy {...p} shape='circles' />,
  text: () => <TextLines />,
};

/** A preview of an option, or (without one, e.g. no rows) a neutral placeholder. */
export const MiniPreview = ({ option }: { option: AiReport }) => {
  const mode = useChartMode();
  const colors = schemeColors(option.settings?.colors as string | undefined, mode);
  const draw = DRAW[option.type];
  let picture: React.ReactNode = null;
  try {
    picture = draw ? draw({ option, colors }) : null;
  } catch (e) {
    picture = null;
  }
  return (
    <svg className='nd-ai-preview' width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      {picture ?? <rect x={PAD} y={PAD} width={INNER} height={INNER} rx={4} fill={MUTED} opacity={0.3} />}
    </svg>
  );
};

export default MiniPreview;

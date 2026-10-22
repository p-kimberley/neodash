import chroma from 'chroma-js';
import { FONT_SANS } from '../../theme/palette';

/**
 * d3-color's darker/brighter (what nivo's colour modifiers used): RGB channels scaled by 0.7^k, so
 * charts keep the label and border colours they had with nivo.
 */
const scale = (color: string, factor: number) => {
  if (!color || !chroma.valid(color)) {
    return color;
  }
  const [r, g, b, a] = chroma(color).rgba();
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return chroma(f(r), f(g), f(b), a).hex();
};
export const darker = (color: string, k = 1) => scale(color, Math.pow(0.7, k));
export const brighter = (color: string, k = 1) => scale(color, 1 / Math.pow(0.7, k));

const INK = '#151e29';
const WHITE = '#ffffff';

/** Text drawn on a coloured shape (bar, slice, tile): white or dark ink, whichever reads better on it. */
export const labelOnColor = (color: string) => {
  if (!color || !chroma.valid(color)) {
    return INK;
  }
  return chroma.contrast(color, WHITE) >= chroma.contrast(color, INK) ? WHITE : INK;
};

type Margins = { top: number; right: number; bottom: number; left: number };

/** The report's margins as an ECharts grid (axis labels are drawn in the margins, as with nivo). */
export const gridFromMargins = (margin: Margins) => ({
  top: margin.top,
  right: margin.right,
  bottom: margin.bottom,
  left: margin.left,
  containLabel: false,
});

/** Whether the report sets any of its margins (marginTop, marginRight, ...) itself. */
export const hasCustomMargins = (settings: Record<string, any>) =>
  ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].some(
    (key) => settings[key] !== undefined && settings[key] !== null && settings[key] !== ''
  );

/**
 * The plot area of an axis chart. Reports that set their own margins keep them (labels drawn in the
 * margins, as before); otherwise the plot fills the card with a small even padding and the axis labels
 * are fitted inside it, however long they are. `extra` reserves room (e.g. for a legend) on a side.
 */
export const chartGrid = (settings: Record<string, any>, legacy: Margins, extra: Partial<Margins> = {}) => {
  if (hasCustomMargins(settings)) {
    return gridFromMargins({
      top: legacy.top + (extra.top ?? 0),
      right: legacy.right + (extra.right ?? 0),
      bottom: legacy.bottom + (extra.bottom ?? 0),
      left: legacy.left + (extra.left ?? 0),
    });
  }
  return {
    top: 12 + (extra.top ?? 0),
    right: 16 + (extra.right ?? 0),
    bottom: 8 + (extra.bottom ?? 0),
    left: 12 + (extra.left ?? 0),
    outerBoundsMode: 'same',
  };
};

/** Axis numbers: short from a thousand up (1.2K, 8M), otherwise as they are. */
export const compactNumber = (value: number) => {
  if (typeof value !== 'number' || !isFinite(value) || Math.abs(value) < 1000) {
    return typeof value === 'number' ? value.toLocaleString() : `${value}`;
  }
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
};

/** Values in tooltips and labels: grouped digits, at most two decimals. */
export const formatNumber = (value: any) =>
  typeof value === 'number' && isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `${value}`;

/** Shared label text style. */
export const labelText = { fontFamily: FONT_SANS, fontSize: 12 };

/** A number for ECharts from a value that may be a Neo4j Integer, a numeric string or a number. */
export const toNumber = (value: any): number => {
  if (value === null || value === undefined) {
    return NaN;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  if (typeof value.low === 'number' && typeof value.high === 'number') {
    return value.high * 4294967296 + (value.low >>> 0);
  }
  return Number(value);
};

/** Escapes text for ECharts' HTML tooltips. */
export const escapeHtml = (text: any) =>
  `${text}`.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Tooltip row: a colour marker, a name and a value (numbers with grouped digits). */
export const tooltipRow = (color: string, name: any, value: any) =>
  `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:${color}"></span>${escapeHtml(
    name
  )}: <b>${escapeHtml(formatNumber(value))}</b>`;

/** The "Enable interactivity" setting turned off: no tooltip, and the series ignore the mouse. */
export const withoutInteraction = (option: any) => ({
  ...option,
  tooltip: { show: false },
  series: option.series.map((s) => ({ ...s, silent: true })),
});

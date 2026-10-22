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

/** Text drawn on a coloured shape (bar, slice, tile): a dark shade of that colour, as before. */
export const labelOnColor = (color: string) => darker(color, 2.6);

/** The report's margins as an ECharts grid (axis labels are drawn in the margins, as with nivo). */
export const gridFromMargins = (margin: { top: number; right: number; bottom: number; left: number }) => ({
  top: margin.top,
  right: margin.right,
  bottom: margin.bottom,
  left: margin.left,
  containLabel: false,
});

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

/** Tooltip row: a colour marker, a name and a value. */
export const tooltipRow = (color: string, name: any, value: any) =>
  `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${color}"></span>${escapeHtml(
    name
  )}: <b>${escapeHtml(value)}</b>`;

/** The "Enable interactivity" setting turned off: no tooltip, and the series ignore the mouse. */
export const withoutInteraction = (option: any) => ({
  ...option,
  tooltip: { show: false },
  series: option.series.map((s) => ({ ...s, silent: true })),
});

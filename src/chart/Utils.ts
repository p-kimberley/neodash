import { FONT_SANS, palettes } from '../theme/palette';
import { QueryResult, Record as Neo4jRecord } from 'neo4j-driver';
export function recordToNative(input: any): any {
  if (!input && input !== false) {
    return null;
  } else if (typeof input.keys === 'object' && typeof input.get === 'function') {
    return Object.fromEntries(input.keys.map((key) => [key, recordToNative(input.get(key))]));
  } else if (typeof input.toNumber === 'function') {
    return input.toNumber();
  } else if (Array.isArray(input)) {
    return (input as Array<any>).map((item) => recordToNative(item));
  } else if (typeof input === 'object') {
    const converted = Object.entries(input).map(([key, value]) => [key, recordToNative(value)]);

    return Object.fromEntries(converted);
  }

  return input;
}

export function resultToNative(result: QueryResult): Record<string, any> {
  if (!result) {
    return {};
  }

  return result.records.map((row) => recordToNative(row));
}
export function checkResultKeys(first: Neo4jRecord, keys: string[]) {
  const missing = keys.filter((key) => !first.keys.includes(key));

  if (missing.length > 0) {
    return new Error(
      `The query is missing the following key${missing.length > 1 ? 's' : ''}: ${missing.join(
        ', '
      )}.  The expected keys are: ${keys.join(', ')}`
    );
  }

  return false;
}

/**
 * For hierarchical data structures, recursively search for a key property that must have a given value.
 * If none can be found, return null.
 */
export const search = (tree, value, key = 'id', reverse = false) => {
  if (tree.length == 0) {
    return null;
  }
  const stack = Array.isArray(tree) ? [...tree] : [tree];
  while (stack.length) {
    const node = stack[reverse ? 'pop' : 'shift']();
    if (node[key] && node[key] === value) {
      return node;
    }
    if (node.children) {
      stack.push(...node.children);
    }
  }
  return null;
};

/**
 * For hierarchical data, we remove all intermediate node prefixes generate by `processHierarchyFromRecords`.
 * This ensures that the visualization itself shows the 'real' names, and not the intermediate ones.
 */
export const mutateName = (currentNode) => {
  if (currentNode.name) {
    const s = currentNode.name.split('_');
    currentNode.name = s.length > 0 ? s.slice(1).join('_') : s[0];
  }

  if (currentNode.children) {
    currentNode.children.forEach((n) => mutateName(n));
  }
};

export const findObject = (data, name) => data.find((searchedName) => searchedName.name === name);

export const flatten = (data) =>
  data.reduce((acc, item) => {
    if (item.children) {
      return [...acc, item, ...flatten(item.children)];
    }
    return [...acc, item];
  }, []);

export const rgbaToHex = (color: string): string => {
  let rgba;
  if (/^rgb/.test(color)) {
    rgba = color.replace(/^rgba?\(|\s+|\)$/g, '').split(',');
  } else {
    rgba = color.split(',');
  }

  if (rgba) {
    // rgb to hex
    // eslint-disable-next-line no-bitwise
    let hex = `#${((1 << 24) + (parseInt(rgba[0], 10) << 16) + (parseInt(rgba[1], 10) << 8) + parseInt(rgba[2], 10))
      .toString(16)
      .slice(1)}`;

    // added alpha param if exists
    if (rgba[4]) {
      const alpha = Math.round(0o1 * 255);
      const hexAlpha = (alpha + 0x10000).toString(16).substr(-2).toUpperCase();
      hex += hexAlpha;
    }

    return hex;
  }
  return color;
};

export enum EntityType {
  Node,
  Relationship,
}

/**
 * Builds the shared nivo chart theme. `c` gives the colours: CSS variables for SVG charts (so they
 * follow the appearance without re-rendering), concrete values for canvas charts.
 */
function nivoTheme(c: {
  text: string;
  muted: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipText: string;
  border: string;
}) {
  const font = { fontFamily: FONT_SANS, fontSize: 12 };
  return {
    ...font,
    textColor: c.text,
    text: { ...font, fill: c.text },
    grid: { line: { stroke: c.grid, strokeWidth: 1 } },
    crosshair: { line: { stroke: c.muted, strokeWidth: 1, strokeOpacity: 0.6, strokeDasharray: '4 4' } },
    axis: {
      domain: { line: { stroke: c.axis, strokeWidth: 1 } },
      ticks: { line: { stroke: c.axis, strokeWidth: 1 }, text: { ...font, fill: c.text } },
      legend: { text: { ...font, fontSize: 13, fontWeight: 600, fill: c.text } },
    },
    legends: {
      text: { ...font, fill: c.text },
      title: { text: { ...font, fontWeight: 600, fill: c.text } },
      ticks: { text: { ...font, fill: c.text } },
      hidden: { text: { ...font, fill: c.muted } },
    },
    markers: { text: { ...font, fill: c.text }, lineColor: c.axis },
    // Labels outside shapes. Labels drawn on top of coloured shapes pick a contrasting shade of the
    // shape's own colour instead (see LABEL_ON_COLOR).
    labels: { text: { ...font, fontWeight: 600, fill: c.text } },
    annotations: { text: { ...font, fill: c.text }, link: { stroke: c.muted }, outline: { stroke: c.muted } },
    tooltip: {
      container: {
        ...font,
        fontSize: 13,
        color: c.tooltipText,
        background: c.tooltipBg,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)',
        padding: '6px 10px',
      },
    },
  };
}

/** Theme for SVG charts; colours are CSS variables, so they follow light/dark automatically. */
export const themeNivo = nivoTheme({
  text: 'var(--nd-chart-text)',
  muted: 'var(--nd-text-muted)',
  grid: 'var(--nd-chart-grid)',
  axis: 'var(--nd-chart-axis)',
  tooltipBg: 'var(--nd-surface-raised)',
  tooltipText: 'var(--nd-text)',
  border: 'var(--nd-border)',
});

/** Theme for canvas charts, which need concrete colours. */
export const themeNivoCanvas = (theme) => {
  const p = palettes[theme === 'dark' ? 'dark' : 'light'];
  return nivoTheme({
    text: p.chartText,
    muted: p.textMuted,
    grid: p.chartGrid,
    axis: p.chartAxis,
    tooltipBg: p.surfaceRaised,
    tooltipText: p.text,
    border: p.border,
  });
};

/**
 * Text colour for labels drawn on coloured shapes (pie slices, bars, treemap tiles...): a much
 * darker shade of the shape's colour, which stays readable on both light and saturated fills.
 */
export const LABEL_ON_COLOR = { from: 'color', modifiers: [['darker', 2.6]] } as any;

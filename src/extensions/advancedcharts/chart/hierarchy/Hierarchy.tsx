import React, { useState } from 'react';
import { findObject, flatten, mutateName, processHierarchyFromRecords } from '../../../../chart/ChartUtils';
import RefreshButton from '../../component/RefreshButton';

/** A node of a hierarchy report: the path segment name, its own value (`loc`) and children. */
export interface HierarchyNode {
  name: string;
  loc?: number;
  children?: HierarchyNode[];
}

/**
 * The hierarchy from the records (index = list of path segments, value = number). Several roots are
 * wrapped in a "Total" node, as before. Built fresh on each call, so repeated calls are safe.
 */
export const buildHierarchy = (records, selection): HierarchyNode | undefined => {
  if (!selection || !records || records.length == 0 || records[0].keys == null) {
    return undefined;
  }
  const roots = processHierarchyFromRecords(records, selection);
  roots.forEach((node) => mutateName(node));
  return roots.length == 1 ? roots[0] : { name: 'Total', children: roots };
};

/** A node's total: its own value plus its children's (as d3/nivo summed it). */
export const totalOf = (node: HierarchyNode): number =>
  (Number(node.loc) || 0) + (node.children || []).reduce((sum, child) => sum + totalOf(child), 0);

/**
 * Drill-down shared by the hierarchy charts: clicking a node with children shows only that branch;
 * the Reset button (bottom right) goes back to the whole hierarchy.
 */
export const useDrillDown = (root: HierarchyNode | undefined) => {
  const [focus, setFocus] = useState<HierarchyNode | undefined>(undefined);
  // A new query result resets the drill-down.
  const [focusRoot, setFocusRoot] = useState(root);
  if (focusRoot !== root && JSON.stringify(focusRoot) !== JSON.stringify(root)) {
    setFocusRoot(root);
    setFocus(undefined);
  }
  const current = focus ?? root;
  const drillInto = (name: string) => {
    const found = current?.children ? findObject(flatten(current.children), name) : undefined;
    if (found && found.children) {
      setFocus(found);
    }
  };
  const resetButton = focus ? <RefreshButton onClick={() => setFocus(undefined)} /> : <></>;
  return { current, drillInto, resetButton };
};

/** Colours by id in order of first appearance (nivo's ordinal colour scale). */
export const ordinalColors = (scheme: string[]) => {
  const assigned = new Map<string, string>();
  return (id: string) => {
    if (!assigned.has(id)) {
      assigned.set(id, scheme[assigned.size % scheme.length]);
    }
    return assigned.get(id) as string;
  };
};

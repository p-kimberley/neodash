import React from 'react';
import { CleanIconButton } from '@neo4j-ndl/react';
import {
  ChevronDownIconOutline,
  ChevronUpIconOutline,
  MagnifyingGlassIconOutline,
  XMarkIconOutline,
} from '@neo4j-ndl/react/icons';
import { Node } from '../GraphChartVisualization';

/** Text a node can be found by: its labels, its displayed caption and its property values. */
const searchableText = (node: Node) =>
  [...(node.labels || []), ...Object.values(node.properties || {}).map((value) => `${value}`)]
    .join('\u0000')
    .toLowerCase();

export type SearchIndex = { id: string; text: string }[];

/** Each node's searchable text, built once per graph rather than on every keystroke. */
export const buildSearchIndex = (nodes: Node[]): SearchIndex =>
  nodes.map((node) => ({ id: node.id, text: searchableText(node) }));

/** IDs of the nodes matching a search, in display order; empty for an empty search. */
export const findMatches = (index: SearchIndex, text: string): string[] => {
  const query = text.trim().toLowerCase();
  if (!query) {
    return [];
  }
  return index.filter((entry) => entry.text.includes(query)).map((entry) => entry.id);
};

/**
 * Search box over a graph. Matching nodes are highlighted (the rest dimmed); Enter / the arrows step
 * through the matches and centre the view on each.
 */
export const NeoGraphChartSearch = ({
  text,
  setText,
  matches,
  current,
  onStep,
}: {
  text: string;
  setText: (text: string) => void;
  matches: string[];
  current: number;
  onStep: (direction: 1 | -1) => void;
}) => {
  const active = text.trim() !== '';
  return (
    <div className='nd-graph-search' role='search'>
      <MagnifyingGlassIconOutline className='nd-graph-search-icon' aria-hidden />
      <input
        type='search'
        aria-label='Search the graph'
        placeholder='Search graph'
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setText('');
          }
        }}
      />
      {active ? (
        <>
          <span className='nd-graph-search-count' aria-live='polite'>
            {matches.length === 0 ? 'No matches' : `${current + 1} of ${matches.length}`}
          </span>
          <CleanIconButton
            description='Previous match'
            size='small'
            isDisabled={matches.length < 2}
            onClick={() => onStep(-1)}
          >
            <ChevronUpIconOutline />
          </CleanIconButton>
          <CleanIconButton
            description='Next match'
            size='small'
            isDisabled={matches.length < 2}
            onClick={() => onStep(1)}
          >
            <ChevronDownIconOutline />
          </CleanIconButton>
          <CleanIconButton description='Clear search' size='small' onClick={() => setText('')}>
            <XMarkIconOutline />
          </CleanIconButton>
        </>
      ) : (
        <></>
      )}
    </div>
  );
};

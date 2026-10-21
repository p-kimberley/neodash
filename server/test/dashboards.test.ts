import { describe, expect, it } from 'vitest';
import { findReport } from '../src/dashboards.js';

const dashboard = {
  pages: [
    { reports: [{ id: 'r1', type: 'table', title: 'A', query: 'RETURN 1' }] },
    {
      reports: [
        { id: 'r2', type: 'bar', title: 'B', query: 'RETURN 2', database: 'sales' },
        { type: 'value', title: 'Legacy, no id', query: 'RETURN 3' },
      ],
    },
  ],
};

describe('findReport', () => {
  it('finds a report by id on any page', () => {
    expect(findReport(dashboard, { id: 'r2' })).toMatchObject({ query: 'RETURN 2', page: 1, index: 0, database: 'sales' });
  });

  it('falls back to position for reports saved without an id', () => {
    // The browser assigns ids to old reports when it loads them, so the id it sends is unknown here.
    expect(findReport(dashboard, { id: 'client-generated', page: 1, index: 1 })).toMatchObject({ query: 'RETURN 3' });
  });

  it('never substitutes a different report that sits at the same position', () => {
    expect(findReport(dashboard, { id: 'r-deleted', page: 0, index: 0 })).toBeNull();
  });

  it('returns null for missing reports and malformed dashboards', () => {
    expect(findReport(dashboard, { page: 5, index: 0 })).toBeNull();
    expect(findReport({}, { id: 'r1' })).toBeNull();
    expect(findReport(null, { id: 'r1' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { formatCypher } from '../src/ai/format.js';

describe('laying out queries a model wrote', () => {
  it('puts each clause on its own line', () => {
    expect(
      formatCypher(
        'MATCH (c:Customer)-[:PLACED]->(o:Order) WHERE o.total > 100 WITH c, count(o) AS orders RETURN c.name AS name, orders ORDER BY orders DESC LIMIT 10'
      )
    ).toBe(
      [
        'MATCH (c:Customer)-[:PLACED]->(o:Order)',
        'WHERE o.total > 100',
        'WITH c, count(o) AS orders',
        'RETURN c.name AS name, orders',
        'ORDER BY orders DESC',
        'LIMIT 10',
      ].join('\n')
    );
  });

  it('keeps OPTIONAL MATCH together, and STARTS WITH / ENDS WITH in their expression', () => {
    expect(
      formatCypher("MATCH (p:Product) OPTIONAL MATCH (p)<-[:CONTAINS]-(o) WHERE p.name STARTS WITH 'A' RETURN p.name AS name")
    ).toBe(
      ['MATCH (p:Product)', 'OPTIONAL MATCH (p)<-[:CONTAINS]-(o)', "WHERE p.name STARTS WITH 'A'", 'RETURN p.name AS name'].join('\n')
    );
  });

  it('leaves strings, comprehensions and subqueries alone', () => {
    expect(
      formatCypher(
        "MATCH (n) WHERE n.note = 'MATCH this RETURN that' RETURN [(n)-->(m) WHERE m.x > 1 | m.name] AS names, COUNT { MATCH (n)--() } AS degree"
      )
    ).toBe(
      [
        'MATCH (n)',
        "WHERE n.note = 'MATCH this RETURN that'",
        'RETURN [(n)-->(m) WHERE m.x > 1 | m.name] AS names, COUNT { MATCH (n)--() } AS degree',
      ].join('\n')
    );
  });

  it('splits long conditions before AND / OR', () => {
    expect(
      formatCypher(
        "MATCH (o:Order) WHERE o.status <> 'Cancelled' AND (o.date >= $from OR $from IS NULL) AND o.channel IN $channels AND o.total > 0 RETURN count(o) AS orders"
      )
    ).toBe(
      [
        'MATCH (o:Order)',
        "WHERE o.status <> 'Cancelled'",
        '  AND (o.date >= $from OR $from IS NULL)',
        '  AND o.channel IN $channels',
        '  AND o.total > 0',
        'RETURN count(o) AS orders',
      ].join('\n')
    );
  });

  it('leaves queries that are already laid out, and short single clauses', () => {
    const laidOut = 'MATCH (n)\nRETURN n';
    expect(formatCypher(laidOut)).toBe(laidOut);
    expect(formatCypher('  RETURN 1  ')).toBe('RETURN 1');
  });
});

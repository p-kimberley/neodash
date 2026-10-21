import { describe, expect, it } from 'vitest';
import neo4j from 'neo4j-driver';
import { decode, decodeParameters, encode, encodeParameters } from '../src/codec.js';

const t = neo4j.types;
const roundTrip = (v: unknown) => decode(JSON.parse(JSON.stringify(encode(v))), neo4j);

describe('codec', () => {
  it('passes JSON primitives through untouched', () => {
    for (const v of ['text', true, false, 1.5, 0, -3.25]) expect(encode(v)).toBe(v);
    expect(encode(null)).toBeNull();
    expect(encode(undefined)).toBeNull();
  });

  it('keeps integers as lossless neo4j Integers', () => {
    const big = neo4j.int('9007199254740993'); // 2^53 + 1, not representable as a JS number
    const back = roundTrip(big);
    expect(neo4j.isInt(back)).toBe(true);
    expect(back.toString()).toBe('9007199254740993');
    expect(encode(neo4j.int(42))).toEqual({ $type: 'Integer', _value: '42' });
  });

  it('encodes non-finite floats', () => {
    expect(roundTrip(Number.NaN)).toBeNaN();
    expect(roundTrip(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it('distinguishes maps from tagged values and recurses into them', () => {
    const value = { $type: 'not a tag', nested: { n: neo4j.int(1) }, list: [neo4j.int(2), 'x'] };
    const back = roundTrip(value);
    expect(back.$type).toBe('not a tag');
    expect(neo4j.isInt(back.nested.n)).toBe(true);
    expect(back.list[0].toNumber()).toBe(2);
    expect(back.list[1]).toBe('x');
  });

  it('round-trips nodes, relationships and paths as driver objects', () => {
    const a = new t.Node(neo4j.int(1), ['Person'], { name: 'Ann', born: neo4j.int(1970) }, '4:x:1');
    const b = new t.Node(neo4j.int(2), ['Movie'], { title: 'M' }, '4:x:2');
    const r = new t.Relationship(neo4j.int(10), neo4j.int(1), neo4j.int(2), 'ACTED_IN', { roles: ['Lead'] }, '5:x:10', '4:x:1', '4:x:2');
    const path = new t.Path(a, b, [new t.PathSegment(a, r, b)]);

    const node = roundTrip(a);
    expect(neo4j.isNode(node)).toBe(true);
    expect(node.identity.toNumber()).toBe(1);
    expect(node.elementId).toBe('4:x:1');
    expect(node.labels).toEqual(['Person']);
    expect(node.properties.born.toNumber()).toBe(1970);

    const rel = roundTrip(r);
    expect(neo4j.isRelationship(rel)).toBe(true);
    expect(rel.start.toNumber()).toBe(1);
    expect(rel.end.toNumber()).toBe(2);
    expect(rel.type).toBe('ACTED_IN');
    expect(rel.properties.roles).toEqual(['Lead']);

    const p = roundTrip(path);
    expect(neo4j.isPath(p)).toBe(true);
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0].relationship.type).toBe('ACTED_IN');
    expect(p.end.properties.title).toBe('M');
  });

  it('round-trips temporal, spatial and duration values', () => {
    const values = [
      new t.Date(2026, 10, 21),
      new t.LocalTime(13, 5, 9, 123000000),
      new t.Time(13, 5, 9, 0, 3600),
      new t.LocalDateTime(2026, 10, 21, 13, 5, 9, 0),
      new t.DateTime(2026, 10, 21, 13, 5, 9, 0, 7200),
      new t.DateTime(2026, 10, 21, 13, 5, 9, 0, undefined, 'Europe/Amsterdam'),
      new t.Duration(1, 2, 3, 4),
      new t.Point(neo4j.int(4326), 4.47, 51.92),
      new t.Point(neo4j.int(4979), 4.47, 51.92, 12),
    ];
    for (const v of values) {
      const back = roundTrip(v);
      expect(back.constructor).toBe(v.constructor);
      expect(back.toString()).toBe(v.toString());
    }
    expect(neo4j.isDate(roundTrip(values[0]))).toBe(true);
  });

  it('round-trips byte arrays', () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(Array.from(roundTrip(bytes))).toEqual([0, 1, 254, 255]);
  });

  it('round-trips parameter maps (as the browser will send them)', () => {
    const params = { neodash_since: new t.Date(2025, 1, 1), neodash_limit: neo4j.int(10), neodash_names: ['a', 'b'], neodash_ratio: 0.1 };
    const back = decodeParameters(JSON.parse(JSON.stringify(encodeParameters(params))), neo4j);
    expect(neo4j.isDate(back.neodash_since)).toBe(true);
    expect((back.neodash_limit as any).toNumber()).toBe(10);
    expect(back.neodash_names).toEqual(['a', 'b']);
    expect(back.neodash_ratio).toBe(0.1);
  });

  it('rejects untagged objects and unknown tags', () => {
    expect(() => decode({ a: 1 }, neo4j)).toThrow(/Untagged/);
    expect(() => decode({ $type: 'Nope', _value: 1 }, neo4j)).toThrow(/Unknown/);
  });
});

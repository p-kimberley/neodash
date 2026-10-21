// Typed JSON encoding for Neo4j values, shared by the backend and the browser.
//
// JSON cannot tell an integer from a float, a map from a node, or carry dates, so every value that
// is not a plain string, boolean, float, null or list is wrapped as {"$type": "...", "_value": ...}.
// Encoding works on any neo4j-driver version (it checks the __isX__ markers the driver puts on its
// classes); decoding takes the driver module to build real driver objects, so chart code that
// expects neo4j-driver records keeps working unchanged.
//
// This file must not import anything: the frontend bundles it as-is.

export type Encoded =
  | null
  | boolean
  | number
  | string
  | Encoded[]
  | { $type: string; _value: unknown };

type IntegerLike = { low: number; high: number; toString(): string; toNumber(): number };
type NumberOrInt = number | IntegerLike;

/** The parts of the neo4j-driver module needed to rebuild values (4.4 and 5.x both qualify). */
export interface Neo4jLib {
  int(value: string | number): unknown;
  types: {
    Node: new (...args: any[]) => unknown;
    Relationship: new (...args: any[]) => unknown;
    PathSegment: new (...args: any[]) => unknown;
    Path: new (...args: any[]) => unknown;
    Point: new (...args: any[]) => unknown;
    Date: new (...args: any[]) => unknown;
    DateTime: new (...args: any[]) => unknown;
    LocalDateTime: new (...args: any[]) => unknown;
    LocalTime: new (...args: any[]) => unknown;
    Time: new (...args: any[]) => unknown;
    Duration: new (...args: any[]) => unknown;
  };
}

const marker = (v: any, name: string) => v !== null && typeof v === 'object' && v[`__is${name}__`] === true;
const num = (v: NumberOrInt | null | undefined): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : v.toNumber();
const intString = (v: NumberOrInt): string => (typeof v === 'number' ? String(Math.trunc(v)) : v.toString());
const tagged = ($type: string, _value: unknown) => ({ $type, _value });

function encodeProperties(props: Record<string, unknown>): Record<string, Encoded> {
  const out: Record<string, Encoded> = {};
  for (const [k, v] of Object.entries(props ?? {})) out[k] = encode(v);
  return out;
}

function encodeNode(n: any) {
  return tagged('Node', {
    identity: intString(n.identity),
    elementId: n.elementId ?? intString(n.identity),
    labels: n.labels,
    properties: encodeProperties(n.properties),
  });
}

function encodeRelationship(r: any) {
  return tagged('Relationship', {
    identity: intString(r.identity),
    elementId: r.elementId ?? intString(r.identity),
    start: intString(r.start),
    end: intString(r.end),
    startElementId: r.startNodeElementId ?? intString(r.start),
    endElementId: r.endNodeElementId ?? intString(r.end),
    type: r.type,
    properties: encodeProperties(r.properties),
  });
}

export function encode(value: unknown): Encoded {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : tagged('Float', String(value));
    case 'bigint':
      return tagged('Integer', value.toString());
    case 'object':
      break;
    default:
      return String(value);
  }
  const v = value as any;
  if (Array.isArray(v)) return v.map(encode);
  if (marker(v, 'Integer')) return tagged('Integer', v.toString());
  if (marker(v, 'Node')) return encodeNode(v);
  if (marker(v, 'Relationship')) return encodeRelationship(v);
  if (marker(v, 'Path')) {
    return tagged('Path', {
      start: encodeNode(v.start),
      end: encodeNode(v.end),
      segments: v.segments.map((s: any) => ({
        start: encodeNode(s.start),
        relationship: encodeRelationship(s.relationship),
        end: encodeNode(s.end),
      })),
    });
  }
  if (marker(v, 'Point')) return tagged('Point', { srid: num(v.srid), x: v.x, y: v.y, ...(v.z === undefined ? {} : { z: v.z }) });
  if (marker(v, 'Date')) return tagged('Date', { year: num(v.year), month: num(v.month), day: num(v.day) });
  if (marker(v, 'LocalTime')) return tagged('LocalTime', timeParts(v));
  if (marker(v, 'Time')) return tagged('Time', { ...timeParts(v), timeZoneOffsetSeconds: num(v.timeZoneOffsetSeconds) });
  if (marker(v, 'LocalDateTime')) return tagged('LocalDateTime', { ...dateParts(v), ...timeParts(v) });
  if (marker(v, 'DateTime')) {
    return tagged('DateTime', {
      ...dateParts(v),
      ...timeParts(v),
      timeZoneOffsetSeconds: num(v.timeZoneOffsetSeconds),
      timeZoneId: v.timeZoneId ?? null,
    });
  }
  if (marker(v, 'Duration')) {
    return tagged('Duration', { months: num(v.months), days: num(v.days), seconds: num(v.seconds), nanoseconds: num(v.nanoseconds) });
  }
  if (v instanceof Uint8Array || v instanceof Int8Array) {
    return tagged('Bytes', bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
  }
  if (v instanceof globalThis.Date) return v.toISOString();
  return tagged('Map', encodeProperties(v));
}

const dateParts = (v: any) => ({ year: num(v.year), month: num(v.month), day: num(v.day) });
const timeParts = (v: any) => ({ hour: num(v.hour), minute: num(v.minute), second: num(v.second), nanosecond: num(v.nanosecond) });

export function decode(value: unknown, neo4j: Neo4jLib): any {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => decode(v, neo4j));
  if (typeof value !== 'object') return value;

  const { $type, _value } = value as { $type?: string; _value?: any };
  if (typeof $type !== 'string') throw new Error('Untagged object in encoded Neo4j value');
  const t = neo4j.types;
  const decodeProps = (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props ?? {})) out[k] = decode(v, neo4j);
    return out;
  };
  const node = (n: any) => new t.Node(neo4j.int(n.identity), n.labels, decodeProps(n.properties), n.elementId);
  const rel = (r: any) =>
    new t.Relationship(
      neo4j.int(r.identity),
      neo4j.int(r.start),
      neo4j.int(r.end),
      r.type,
      decodeProps(r.properties),
      r.elementId,
      r.startElementId,
      r.endElementId
    );

  switch ($type) {
    case 'Integer':
      return neo4j.int(_value);
    case 'Float':
      return Number(_value);
    case 'Map':
      return decodeProps(_value);
    case 'Node':
      return node(_value);
    case 'Relationship':
      return rel(_value);
    case 'Path': {
      // Path members are themselves tagged Node / Relationship values.
      const segments = _value.segments.map(
        (s: any) => new t.PathSegment(node(s.start._value), rel(s.relationship._value), node(s.end._value))
      );
      return new t.Path(node(_value.start._value), node(_value.end._value), segments);
    }
    case 'Point':
      return _value.z === undefined
        ? new t.Point(neo4j.int(_value.srid), _value.x, _value.y)
        : new t.Point(neo4j.int(_value.srid), _value.x, _value.y, _value.z);
    case 'Date':
      return new t.Date(_value.year, _value.month, _value.day);
    case 'LocalTime':
      return new t.LocalTime(_value.hour, _value.minute, _value.second, _value.nanosecond);
    case 'Time':
      return new t.Time(_value.hour, _value.minute, _value.second, _value.nanosecond, _value.timeZoneOffsetSeconds);
    case 'LocalDateTime':
      return new t.LocalDateTime(_value.year, _value.month, _value.day, _value.hour, _value.minute, _value.second, _value.nanosecond);
    case 'DateTime':
      return new t.DateTime(
        _value.year,
        _value.month,
        _value.day,
        _value.hour,
        _value.minute,
        _value.second,
        _value.nanosecond,
        _value.timeZoneId ? undefined : _value.timeZoneOffsetSeconds,
        _value.timeZoneId ?? undefined
      );
    case 'Duration':
      return new t.Duration(_value.months, _value.days, _value.seconds, _value.nanoseconds);
    case 'Bytes':
      return base64ToBytes(_value);
    default:
      throw new Error(`Unknown encoded Neo4j type: ${$type}`);
  }
}

/** Encodes a map of query parameters (keys stay plain, values are encoded). */
export function encodeParameters(params: Record<string, unknown>): Record<string, Encoded> {
  return encodeProperties(params);
}

export function decodeParameters(params: Record<string, unknown>, neo4j: Neo4jLib): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) out[k] = decode(v, neo4j);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

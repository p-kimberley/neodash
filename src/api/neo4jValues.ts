// The Neo4j value classes (Integer, Node, Date, ...) that query results and URL parameters are
// rebuilt into, so chart code gets the same objects the driver would return. Only the value
// classes are needed in the browser: queries run on the backend.

import {
  Date,
  DateTime,
  Duration,
  LocalDateTime,
  LocalTime,
  Node,
  Path,
  PathSegment,
  Point,
  Relationship,
  Time,
  int,
} from 'neo4j-driver-core';
import type { Neo4jLib } from '../../server/src/codec';

export const neo4jValues: Neo4jLib = {
  int,
  types: { Node, Relationship, PathSegment, Path, Point, Date, DateTime, LocalDateTime, LocalTime, Time, Duration },
};

import neo4j, { type Driver, type Record as Neo4jRecord } from 'neo4j-driver';
import type { Config } from './config.js';

export type AccessMode = 'READ' | 'WRITE';

export interface RunOptions {
  database: string;
  accessMode: AccessMode;
  rowLimit: number;
  timeoutSeconds: number;
}

export interface QueryResult {
  keys: string[];
  records: Neo4jRecord[];
  truncated: boolean;
  durationMs: number;
}

export function createDriver(config: Config): Driver {
  return neo4j.driver(config.neo4j.uri, neo4j.auth.basic(config.neo4j.username, config.neo4j.password), {
    userAgent: 'neodash-server',
    // Keep integers as neo4j Integer objects so they round-trip to the browser losslessly.
    disableLosslessIntegers: false,
  });
}

/**
 * Runs one query in an explicit transaction, stopping after rowLimit + 1 records so a careless
 * `MATCH (n) RETURN n` cannot stream the whole graph through the backend. In READ mode Neo4j itself
 * rejects any write, which is what makes viewer access read-only.
 */
export async function runQuery(
  driver: Driver,
  query: string,
  parameters: Record<string, unknown>,
  options: RunOptions
): Promise<QueryResult> {
  const started = performance.now();
  const session = driver.session({
    database: options.database,
    defaultAccessMode: options.accessMode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
  });
  const tx = await session.beginTransaction({ timeout: options.timeoutSeconds * 1000 });
  try {
    const result = tx.run(query, parameters);
    const records: Neo4jRecord[] = [];
    let truncated = false;
    for await (const record of result) {
      if (records.length >= options.rowLimit) {
        truncated = true;
        break;
      }
      records.push(record);
    }
    const keys = records[0]?.keys.map(String) ?? (await result.keys()).map(String);
    // Committing discards any unread rows; the server still runs the query to completion, so an
    // editor's write query takes full effect even when its returned rows were truncated.
    await tx.commit();
    return { keys, records, truncated, durationMs: Math.round(performance.now() - started) };
  } catch (e) {
    if (tx.isOpen()) await tx.rollback().catch(() => {});
    throw e;
  } finally {
    await session.close();
  }
}

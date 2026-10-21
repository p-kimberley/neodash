// Seeds the dev Neo4j with mock data and example dashboards, then runs every report query
// in the dashboards as a read-only smoke test.
//
// Env:
//   NEO4J_URI        bolt/neo4j URI (default neo4j://localhost:7687)
//   NEO4J_AUTH_FILE  file containing "user/password" (same format as the neo4j image)
//   NEO4J_AUTH       "user/password", used if no auth file is given
//   SEED_RESET       "true" wipes the database and reloads everything
//   DASHBOARD_DIR    folder of dashboard JSON files (default ./dashboards)
//   MOVIES_CYPHER    path to the movies dataset (default ./movies.cypher)

import fs from 'node:fs';
import path from 'node:path';
import neo4j from 'neo4j-driver';
import * as data from './data.mjs';

const SEED_VERSION = 1;
const uri = process.env.NEO4J_URI ?? 'neo4j://localhost:7687';
const auth = (process.env.NEO4J_AUTH_FILE ? fs.readFileSync(process.env.NEO4J_AUTH_FILE, 'utf8') : process.env.NEO4J_AUTH ?? 'neo4j/devpassword').trim();
const [user, ...rest] = auth.split('/');
const password = rest.join('/');
const reset = process.env.SEED_RESET === 'true';
const dashboardDir = process.env.DASHBOARD_DIR ?? './dashboards';
const moviesFile = process.env.MOVIES_CYPHER ?? './movies.cypher';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { disableLosslessIntegers: true });
const log = (...args) => console.log('[seed]', ...args);

async function waitForNeo4j() {
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      await driver.verifyConnectivity();
      return;
    } catch (e) {
      if (attempt === 60) throw e;
      log(`waiting for Neo4j (${e.code ?? e.message})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const write = (query, params = {}) => driver.executeQuery(query, params, { routing: neo4j.routing.WRITE });

async function inBatches(rows, size, query) {
  for (let i = 0; i < rows.length; i += size) {
    await write(query, { rows: rows.slice(i, i + size) });
  }
}

async function wipe() {
  log('SEED_RESET=true: deleting all nodes');
  const session = driver.session();
  try {
    await session.run('MATCH (n) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 10000 ROWS');
  } finally {
    await session.close();
  }
}

async function loadMovies() {
  if (!fs.existsSync(moviesFile)) {
    log(`skipping movies dataset (${moviesFile} not found)`);
    return;
  }
  const statements = fs
    .readFileSync(moviesFile, 'utf8')
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await write(statement);
  log('loaded movies dataset');
}

async function loadRetail() {
  const schema = [
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Region) REQUIRE n.name IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:City) REQUIRE n.name IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Category) REQUIRE n.name IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Product) REQUIRE n.sku IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Supplier) REQUIRE n.name IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Warehouse) REQUIRE n.code IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Customer) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Order) REQUIRE n.id IS UNIQUE',
    'CREATE INDEX IF NOT EXISTS FOR (n:Order) ON (n.date)',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:_Neodash_Dashboard) REQUIRE n.uuid IS UNIQUE',
  ];
  for (const s of schema) await write(s);

  await write('UNWIND $rows AS name CREATE (:Region {name: name})', { rows: data.regions });
  await write(
    `UNWIND $rows AS row MATCH (r:Region {name: row.region})
     CREATE (:Country {name: row.name, code: row.code, code2: row.code2})-[:IN_REGION]->(r)`,
    { rows: data.countries }
  );
  await write(
    `UNWIND $rows AS row MATCH (c:Country {name: row.country})
     CREATE (:City {name: row.name, latitude: row.latitude, longitude: row.longitude})-[:IN_COUNTRY]->(c)`,
    { rows: data.cities }
  );
  await write('UNWIND $rows AS row CREATE (:Category {name: row.name})', { rows: data.categories });
  await write(
    `UNWIND $rows AS row WITH row WHERE row.parent IS NOT NULL
     MATCH (c:Category {name: row.name}), (p:Category {name: row.parent})
     CREATE (c)-[:SUBCATEGORY_OF]->(p)`,
    { rows: data.categories }
  );
  await write(
    `UNWIND $rows AS row MATCH (c:Category {name: row.category})
     CREATE (p:Product {sku: row.sku, name: row.name, price: row.price, cost: row.cost, rating: row.rating,
                        stock: row.stock, launched: date(row.launched)})-[:IN_CATEGORY]->(c)`,
    { rows: data.products }
  );
  await write(
    `UNWIND $rows AS row MATCH (c:City {name: row.city})
     CREATE (:Supplier {name: row.name, rating: row.rating, onTimeTarget: row.onTimeTarget,
                        latitude: row.latitude, longitude: row.longitude})-[:LOCATED_IN]->(c)`,
    { rows: data.suppliers }
  );
  await write(
    `UNWIND $rows AS row MATCH (s:Supplier {name: row.supplier}), (p:Product {sku: row.sku})
     CREATE (s)-[:SUPPLIES {leadTimeDays: row.leadTimeDays, primary: row.primary}]->(p)`,
    { rows: data.supplies }
  );
  await write(
    `UNWIND $rows AS row MATCH (c:City {name: row.city})
     CREATE (:Warehouse {code: row.code, name: row.name, capacity: row.capacity,
                         latitude: row.latitude, longitude: row.longitude})-[:LOCATED_IN]->(c)`,
    { rows: data.warehouses }
  );
  await write(
    `UNWIND $rows AS row MATCH (c:City {name: row.city})
     CREATE (:Customer {id: row.id, name: row.name, segment: row.segment, joined: date(row.joined)})-[:LIVES_IN]->(c)`,
    { rows: data.customers }
  );
  await inBatches(
    data.orders,
    2000,
    `UNWIND $rows AS row
     MATCH (c:Customer {id: row.customer}), (w:Warehouse {code: row.warehouse})
     CREATE (o:Order {id: row.id, date: date(row.date), channel: row.channel, status: row.status, total: row.total,
                      shippedDate: date(row.shippedDate), deliveredDate: date(row.deliveredDate),
                      delayDays: row.delayDays, onTime: row.onTime})
     CREATE (c)-[:PLACED]->(o)
     CREATE (o)-[:SHIPPED_FROM]->(w)`
  );
  await inBatches(
    data.orderLines,
    5000,
    `UNWIND $rows AS row
     MATCH (o:Order {id: row.order}), (p:Product {sku: row.sku})
     CREATE (o)-[:CONTAINS {quantity: row.quantity, unitPrice: row.unitPrice, discount: row.discount}]->(p)`
  );

  // Aggregated flows, used by the Sankey and map reports.
  await write(
    `MATCH (s:Supplier)-[:SUPPLIES {primary: true}]->(:Product)<-[c:CONTAINS]-(o:Order)-[:SHIPPED_FROM]->(w:Warehouse)
     WHERE o.status <> 'Cancelled'
     WITH s, w, sum(c.quantity) AS units
     CREATE (s)-[:SHIPS_TO {units: units}]->(w)`
  );
  await write(
    `MATCH (w:Warehouse)<-[:SHIPPED_FROM]-(o:Order)-[c:CONTAINS]->(),
           (o)<-[:PLACED]-(:Customer)-[:LIVES_IN]->(:City)-[:IN_COUNTRY]->(:Country)-[:IN_REGION]->(r:Region)
     WHERE o.status <> 'Cancelled'
     WITH w, r, sum(c.quantity) AS units
     CREATE (w)-[:SERVES {units: units}]->(r)`
  );

  await write(
    `UNWIND $rows AS project
     CREATE (p:Project {name: project.name})
     WITH p, project
     UNWIND range(0, size(project.tasks) - 1) AS i
     WITH p, project, i, project.tasks[i] AS t
     CREATE (p)-[:HAS_TASK]->(:Task {name: t.name, project: project.name, order: i,
                                     startDate: date(t.startDate), endDate: date(t.endDate)})`,
    { rows: data.projects }
  );
  await write(
    `UNWIND $rows AS project
     UNWIND range(1, size(project.tasks) - 1) AS i
     MATCH (a:Task {project: project.name, order: i - 1}), (b:Task {project: project.name, order: i})
     CREATE (a)-[:NEXT {rel_type: project.tasks[i].dependency}]->(b)`,
    { rows: data.projects }
  );

  log(
    `loaded retail dataset: ${data.customers.length} customers, ${data.orders.length} orders, ` +
      `${data.orderLines.length} order lines, ${data.products.length} products`
  );
}

function readDashboards() {
  if (!fs.existsSync(dashboardDir)) return [];
  return fs
    .readdirSync(dashboardDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, dashboard: JSON.parse(fs.readFileSync(path.join(dashboardDir, file), 'utf8')) }));
}

// Mirrors saveDashboardToNeo4jThunk, so seeded dashboards look exactly like ones saved by NeoDash.
// Existing dashboards are left alone, so edits made while testing survive a re-seed.
async function loadDashboards(dashboards) {
  for (const { file, dashboard } of dashboards) {
    if (!dashboard.uuid) throw new Error(`${file} has no uuid`);
    const { records } = await write(
      `MERGE (n:_Neodash_Dashboard {uuid: $uuid})
       ON CREATE SET n.title = $title, n.version = $version, n.user = $user, n.content = $content, n.date = datetime()
       RETURN n.user = $user AND n.content = $content AS current`,
      {
        uuid: dashboard.uuid,
        title: dashboard.title,
        version: dashboard.version,
        user: 'seed',
        content: JSON.stringify(dashboard, null, 2),
      }
    );
    log(`dashboard ${file}: ${records[0].get('current') ? 'loaded' : 'already exists (kept)'}`);
  }
}

// Runs every report query read-only, with the dashboard's default parameters.
async function verifyDashboards(dashboards) {
  const skip = new Set(['text', 'iframe']);
  let failures = 0;
  for (const { file, dashboard } of dashboards) {
    const defaults = dashboard.settings?.parameters ?? {};
    for (const [p, page] of dashboard.pages.entries()) {
      for (const report of page.reports) {
        if (skip.has(report.type) || !report.query?.trim()) continue;
        const params = { input: '' };
        for (const [, name] of report.query.matchAll(/\$(\w+)/g)) params[name] = defaults[name] ?? null;
        try {
          const { records } = await driver.executeQuery(report.query, params, { routing: neo4j.routing.READ });
          const flag = records.length === 0 && report.type !== 'select' ? '  (no rows)' : '';
          log(`  ok  ${file} / ${page.title} / ${report.title ?? report.type}: ${records.length} rows${flag}`);
        } catch (e) {
          failures++;
          log(`  ERR ${file} / ${page.title} [${p}] / ${report.title ?? report.type}: ${e.message.split('\n')[0]}`);
        }
      }
    }
  }
  return failures;
}

async function main() {
  await waitForNeo4j();
  if (reset) await wipe();

  const { records } = await driver.executeQuery('MATCH (s:_DevSeed) RETURN s.version AS version');
  const seeded = records[0]?.get('version');
  if (seeded === undefined) {
    await loadMovies();
    await loadRetail();
    await write('CREATE (:_DevSeed {version: $version, at: datetime()})', { version: SEED_VERSION });
  } else {
    log(`data already seeded (version ${seeded}); set SEED_RESET=true to reload`);
  }

  const dashboards = readDashboards();
  await loadDashboards(dashboards);
  log('verifying dashboard queries (read-only)');
  const failures = await verifyDashboards(dashboards);
  if (failures) {
    log(`${failures} report queries failed`);
    process.exitCode = 1;
  } else {
    log('all report queries ran');
  }
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => driver.close());

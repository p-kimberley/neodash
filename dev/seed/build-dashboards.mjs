// Generates the example dashboards in ./dashboards as NeoDash 2.4 JSON.
//
//   node dev/seed/build-dashboards.mjs
//
// The JSON files are committed; this script exists so they stay consistent and are easy to change.
// Every report uses only features present in NeoDash 2.4.11, so the files also act as a
// compatibility fixture for the rebuilt UI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { customers, orders } from './data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'dashboards');
const galleryMovies = path.join(here, '..', '..', 'gallery', 'dashboards', 'movies.json');

// Stable ids, so re-generating produces identical files and URLs.
function idFactory(prefix) {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function dashboard({ uuid, title, parameters = {}, pages }) {
  return {
    uuid,
    title,
    version: '2.4',
    settings: { pagenumber: 0, editable: true, fullscreenEnabled: true, parameters, theme: 'light' },
    pages,
    parameters: {},
    extensions: {
      active: true,
      activeReducers: [],
      'advanced-charts': { active: true },
      styling: { active: true },
      actions: { active: true },
    },
  };
}

// Filters in these dashboards are optional, so reports run with unset parameters as null.
// Without ignoreNonDefinedParams NeoDash waits until every parameter in the query has a value.
function reportFactory(nextId) {
  return (type, title, query, [x, y, width, height], selection = {}, settings = {}) => ({
    id: nextId(),
    title,
    query,
    width,
    height,
    x,
    y,
    type,
    selection,
    settings: type !== 'select' && query.includes('$neodash_') ? { ignoreNonDefinedParams: true, ...settings } : settings,
  });
}

const nodeSelect = (report, label, property, pos, { title = label, ...extra } = {}) =>
  report('select', title, matchQuery(label, property), pos, {}, {
    type: 'Node Property',
    entityType: label,
    propertyType: property,
    propertyTypeDisplay: property,
    parameterName: `neodash_${label}_${property}`.toLowerCase(),
    ...extra,
  });

// Same query the parameter-select settings screen generates for a node property.
const matchQuery = (label, property, limit = 5) =>
  `MATCH (n:\`${label}\`) \nWHERE toLower(toString(n.\`${property}\`)) CONTAINS toLower($input) \n` +
  `RETURN DISTINCT n.\`${property}\` as value,  n.\`${property}\` as display ORDER BY size(toString(value)) ASC LIMIT ${limit}`;

const dateSelect = (report, name, pos, title = name) =>
  report('select', title, 'RETURN true;', pos, {}, { type: 'Date Picker', entityType: name, parameterName: `neodash_${name}` });

// --- Filters shared by the sales reports --------------------------------------------------------

const SALES_SCOPE = `MATCH (rg:Region)<-[:IN_REGION]-(co:Country)<-[:IN_COUNTRY]-(:City)<-[:LIVES_IN]-(cu:Customer)-[:PLACED]->(o:Order)
WHERE o.status <> 'Cancelled'
  AND (coalesce($neodash_region_name, '') = '' OR rg.name = $neodash_region_name)
  AND ($neodash_from_date IS NULL OR $neodash_from_date = '' OR o.date >= $neodash_from_date)
  AND ($neodash_to_date IS NULL OR $neodash_to_date = '' OR o.date <= $neodash_to_date)`;

const CATEGORIES = ['Electronics', 'Home & Kitchen', 'Sports & Outdoors', 'Books', 'Fashion'];
const CHANNELS = ['Web', 'Mobile', 'Store', 'Partner'];
const pivot = (keys, listVar) =>
  keys.map((k) => `toInteger(coalesce([p IN ${listVar} WHERE p[0] = '${k}' | p[1]][0], 0)) AS \`${k}\``).join(',\n       ');

const HIERARCHY_QUERY = `MATCH (top:Category)<-[:SUBCATEGORY_OF]-(sub:Category)<-[:IN_CATEGORY]-(p:Product)<-[c:CONTAINS]-(o:Order)
WHERE o.status <> 'Cancelled'
RETURN ['Revenue', top.name, sub.name, p.name] AS path, toInteger(sum(c.quantity * c.unitPrice)) AS value`;

const SANKEY_QUERY = `// Units flowing supplier -> warehouse -> customer region
MATCH (s:Supplier)-[r:SHIPS_TO]->(w:Warehouse)
RETURN s AS source, r AS flow, w AS target
UNION ALL
MATCH (w:Warehouse)-[r:SERVES]->(g:Region)
RETURN w AS source, r AS flow, g AS target`;

// --- Sales overview -----------------------------------------------------------------------------

function salesDashboard() {
  const r = reportFactory(idFactory('5a1e5000'));
  const orderCount = {};
  for (const o of orders) orderCount[o.customer] = (orderCount[o.customer] ?? 0) + 1;
  const topCustomer = customers.reduce((a, b) => ((orderCount[b.id] ?? 0) > (orderCount[a.id] ?? 0) ? b : a));

  return dashboard({
    uuid: '5a1e5000-0000-4000-8000-000000000000',
    title: 'Sales Overview',
    parameters: {
      neodash_region_name: null,
      neodash_from_date: null,
      neodash_to_date: null,
      neodash_customer_name: topCustomer.name,
    },
    pages: [
      {
        title: 'Overview',
        reports: [
          nodeSelect(r, 'Region', 'name', [0, 0, 6, 2], { helperText: 'Filter all reports by region' }),
          dateSelect(r, 'from_date', [6, 0, 4, 2], 'From'),
          dateSelect(r, 'to_date', [10, 0, 4, 2], 'To'),
          r(
            'text',
            'About',
            '**Acme Outfitters — sales**\n\nFilter by region and date range. Click a customer in *Top customers* to open them on the *Customer drill-down* page.',
            [14, 0, 10, 2]
          ),
          r('value', 'Revenue', `${SALES_SCOPE}\nRETURN toInteger(sum(o.total)) AS Revenue`, [0, 2, 6, 2], {}, { textAlign: 'center' }),
          r('value', 'Orders', `${SALES_SCOPE}\nRETURN count(o) AS Orders`, [6, 2, 6, 2], {}, { textAlign: 'center' }),
          r('value', 'Average order value', `${SALES_SCOPE}\nRETURN round(avg(o.total), 2) AS AOV`, [12, 2, 6, 2], {}, { textAlign: 'center' }),
          r('value', 'Active customers', `${SALES_SCOPE}\nRETURN count(DISTINCT cu) AS Customers`, [18, 2, 6, 2], {}, { textAlign: 'center' }),
          r(
            'line',
            'Monthly revenue',
            `${SALES_SCOPE}\nRETURN date.truncate('month', o.date) AS Month, toInteger(sum(o.total)) AS Revenue\nORDER BY Month`,
            [0, 4, 16, 4],
            { x: 'Month', value: ['Revenue'] },
            { xTickTimeValues: 'every 3 months', xAxisTimeFormat: '%b %Y', marginLeft: 70, curve: 'monotoneX' }
          ),
          r(
            'pie',
            'Revenue by channel',
            `${SALES_SCOPE}\nRETURN o.channel AS Channel, toInteger(sum(o.total)) AS Revenue`,
            [16, 4, 8, 4],
            { index: 'Channel', value: 'Revenue', key: '(none)' },
            { innerRadius: 0.5, colors: 'set2' }
          ),
          r(
            'bar',
            'Revenue by category and region',
            `${SALES_SCOPE}\nMATCH (o)-[c:CONTAINS]->(:Product)-[:IN_CATEGORY]->(:Category)-[:SUBCATEGORY_OF]->(top:Category)\nRETURN top.name AS Category, rg.name AS Region, toInteger(sum(c.quantity * c.unitPrice)) AS Revenue\nORDER BY Category`,
            [0, 8, 12, 4],
            { index: 'Category', value: 'Revenue', key: 'Region' },
            { groupMode: 'stacked', marginLeft: 70, marginBottom: 60, colors: 'set2', legend: true }
          ),
          r(
            'choropleth',
            'Revenue by country',
            `${SALES_SCOPE}\nRETURN co.code AS code, toInteger(sum(o.total)) AS value`,
            [12, 8, 12, 4],
            { index: 'code', value: 'value', key: 'code' },
            { colors: 'YlOrRd' }
          ),
          r(
            'table',
            'Top products',
            `${SALES_SCOPE}\nMATCH (o)-[c:CONTAINS]->(p:Product)-[:IN_CATEGORY]->(sub:Category)\nWITH p, sub, sum(c.quantity) AS units, sum(c.quantity * c.unitPrice) AS revenue, sum(c.quantity * p.cost) AS cost\nRETURN p.name AS Product, sub.name AS Category, units AS Units, toInteger(revenue) AS Revenue,\n       round(100.0 * (revenue - cost) / revenue, 1) AS \`Margin %\`\nORDER BY Revenue DESC LIMIT 15`,
            [0, 12, 12, 5],
            {},
            {
              compact: true,
              styleRules: [{ field: 'Margin %', condition: '<', value: '35', customization: 'row color', customizationValue: '#fde2e1' }],
            }
          ),
          r(
            'table',
            'Top customers',
            `${SALES_SCOPE}\nRETURN cu.name AS Customer, cu.segment AS Segment, co.name AS Country, count(o) AS Orders, toInteger(sum(o.total)) AS Revenue\nORDER BY Revenue DESC LIMIT 15`,
            [12, 12, 12, 5],
            {},
            {
              compact: true,
              actionsRules: [{ condition: 'Click', field: 'Customer', value: 'Customer', customization: 'set variable', customizationValue: 'customer_name' }],
            }
          ),
        ],
      },
      {
        title: 'Customer drill-down',
        reports: [
          nodeSelect(r, 'Customer', 'name', [0, 0, 8, 2]),
          r('value', 'Lifetime value', `MATCH (cu:Customer {name: $neodash_customer_name})-[:PLACED]->(o:Order) WHERE o.status <> 'Cancelled'\nRETURN toInteger(sum(o.total))`, [8, 0, 4, 2]),
          r('value', 'Orders', `MATCH (cu:Customer {name: $neodash_customer_name})-[:PLACED]->(o:Order)\nRETURN count(o)`, [12, 0, 4, 2]),
          r('value', 'Customer since', `MATCH (cu:Customer {name: $neodash_customer_name})\nRETURN toString(min(cu.joined))`, [16, 0, 4, 2], {}, { fontSize: 36 }),
          r('value', 'Segment', `MATCH (cu:Customer {name: $neodash_customer_name})\nRETURN head(collect(DISTINCT cu.segment))`, [20, 0, 4, 2], {}, { fontSize: 36 }),
          r(
            'graph',
            'Recent orders',
            `MATCH (cu:Customer {name: $neodash_customer_name})-[:PLACED]->(o:Order)\nWITH cu, o ORDER BY o.date DESC LIMIT 8\nMATCH path = (cu)-[:PLACED]->(o)-[:CONTAINS]->(:Product)-[:IN_CATEGORY]->(:Category)\nRETURN path`,
            [0, 2, 14, 6],
            { Customer: 'name', Order: 'id', Product: 'name', Category: 'name' },
            { nodePositions: {} }
          ),
          r(
            'table',
            'Order history',
            `MATCH (cu:Customer {name: $neodash_customer_name})-[:PLACED]->(o:Order)-[:SHIPPED_FROM]->(w:Warehouse)\nRETURN o.id AS Order, o.date AS Date, o.status AS Status, o.channel AS Channel, o.total AS Total, w.name AS Warehouse\nORDER BY Date DESC`,
            [14, 2, 10, 6],
            {},
            {
              compact: true,
              styleRules: [
                { field: 'Status', condition: '=', value: 'Returned', customization: 'row color', customizationValue: '#fff4ce' },
                { field: 'Status', condition: '=', value: 'Cancelled', customization: 'row color', customizationValue: '#eeeeee' },
              ],
            }
          ),
        ],
      },
    ],
  });
}

// --- Supply chain -------------------------------------------------------------------------------

function supplyChainDashboard() {
  const r = reportFactory(idFactory('5c4a1000'));
  const WAREHOUSE_SCOPE = `MATCH (o:Order)-[:SHIPPED_FROM]->(w:Warehouse)
WHERE o.onTime IS NOT NULL AND (coalesce($neodash_warehouse_name, '') = '' OR w.name = $neodash_warehouse_name)`;

  return dashboard({
    uuid: '5c4a1000-0000-4000-8000-000000000000',
    title: 'Supply Chain',
    parameters: { neodash_warehouse_name: null },
    pages: [
      {
        title: 'Network',
        reports: [
          r(
            'text',
            'About this page',
            'Twelve suppliers ship to six regional hubs, which serve five customer regions.\n\n- **Map**: supplier → hub lanes\n- **Sankey**: units shipped along each lane (from fulfilled orders)\n- **Table**: supplier scorecard; ratings under 3.5 are highlighted',
            [0, 0, 8, 6]
          ),
          r(
            'map',
            'Supplier lanes',
            'MATCH (s:Supplier)-[r:SHIPS_TO]->(w:Warehouse)\nRETURN s, r, w',
            [8, 0, 16, 6],
            { Supplier: 'name', Warehouse: 'name', SHIPS_TO: '(label)' },
            { defaultRelColor: 'rgba(80,120,200,0.5)', defaultRelWidth: 3, defaultNodeSize: 'medium', nodeColorScheme: 'set2' }
          ),
          r(
            'sankey',
            'Units by lane',
            SANKEY_QUERY,
            [0, 6, 24, 6],
            { Supplier: 'name', Warehouse: 'name', Region: 'name' },
            { labelProperty: 'units', labelPosition: 'inside', layout: 'horizontal', colors: 'set2' }
          ),
          r(
            'table',
            'Supplier scorecard',
            `MATCH (s:Supplier)-[:LOCATED_IN]->(c:City)-[:IN_COUNTRY]->(co:Country)
OPTIONAL MATCH (s)-[sup:SUPPLIES]->(p:Product)
WITH s, c, co, count(p) AS products, round(avg(sup.leadTimeDays), 1) AS leadTime
OPTIONAL MATCH (s)-[sh:SHIPS_TO]->()
RETURN s.name AS Supplier, c.name + ', ' + co.name AS Location, products AS Products,
       leadTime AS \`Avg lead time (days)\`, sum(sh.units) AS \`Units shipped\`, s.rating AS Rating
ORDER BY Rating ASC`,
            [0, 12, 24, 5],
            {},
            { compact: true, styleRules: [{ field: 'Rating', condition: '<', value: '3.5', customization: 'row color', customizationValue: '#fde2e1' }] }
          ),
        ],
      },
      {
        title: 'Delivery',
        reports: [
          nodeSelect(r, 'Warehouse', 'name', [0, 0, 6, 2]),
          r('value', 'Late deliveries', `${WAREHOUSE_SCOPE} AND NOT o.onTime\nRETURN count(o)`, [6, 0, 6, 2], {}, { textAlign: 'center' }),
          r('value', 'Average delay when late (days)', `${WAREHOUSE_SCOPE} AND NOT o.onTime\nRETURN round(avg(o.delayDays), 1)`, [12, 0, 6, 2], {}, { textAlign: 'center' }),
          r(
            'gauge',
            'On-time delivery %',
            `${WAREHOUSE_SCOPE}\nRETURN toInteger(round(100.0 * sum(CASE WHEN o.onTime THEN 1 ELSE 0 END) / count(o)))`,
            [18, 0, 6, 6],
            {},
            { nrOfLevels: 3, arcsLength: '0.8,0.1,0.1', arcColors: '#e15759,#f1ce63,#59a14f' }
          ),
          r(
            'bar',
            'On-time % by hub',
            `MATCH (o:Order)-[:SHIPPED_FROM]->(w:Warehouse) WHERE o.onTime IS NOT NULL\nRETURN w.name AS Hub, round(100.0 * sum(CASE WHEN o.onTime THEN 1 ELSE 0 END) / count(o), 1) AS \`On-time %\`\nORDER BY \`On-time %\``,
            [0, 2, 18, 4],
            { index: 'Hub', value: 'On-time %', key: '(none)' },
            {
              marginLeft: 60,
              styleRules: [{ field: 'On-time %', condition: '<', value: '85', customization: 'bar color', customizationValue: '#e15759' }],
            }
          ),
          r(
            'line',
            'On-time % by month',
            `${WAREHOUSE_SCOPE}\nRETURN date.truncate('month', o.date) AS Month, round(100.0 * sum(CASE WHEN o.onTime THEN 1 ELSE 0 END) / count(o), 1) AS \`On-time %\`\nORDER BY Month`,
            [0, 6, 12, 5],
            { x: 'Month', value: ['On-time %'] },
            { xTickTimeValues: 'every 3 months', xAxisTimeFormat: '%b %Y', minYValue: 50, maxYValue: 100 }
          ),
          r(
            'table',
            'Latest late deliveries',
            `${WAREHOUSE_SCOPE} AND NOT o.onTime\nMATCH (cu:Customer)-[:PLACED]->(o)\nRETURN o.id AS Order, o.date AS Ordered, o.deliveredDate AS Delivered, o.delayDays AS \`Delay (days)\`, w.name AS Hub, cu.name AS Customer\nORDER BY Ordered DESC LIMIT 50`,
            [12, 6, 12, 5],
            {},
            { compact: true, styleRules: [{ field: 'Delay (days)', condition: '>', value: '7', customization: 'row color', customizationValue: '#fde2e1' }] }
          ),
        ],
      },
      {
        title: 'Projects',
        reports: [
          r(
            'gantt',
            'Operations roadmap',
            'MATCH (p:Project)-[:HAS_TASK]->(t:Task)\nOPTIONAL MATCH (t)-[n:NEXT]->(t2:Task)\nRETURN t, n, t2',
            [0, 0, 24, 6],
            {},
            { viewMode: 'Week', barColor: '#7aa6d8' }
          ),
          r(
            'table',
            'Tasks',
            'MATCH (p:Project)-[:HAS_TASK]->(t:Task)\nRETURN p.name AS Project, t.name AS Task, t.startDate AS Start, t.endDate AS End, duration.inDays(t.startDate, t.endDate).days AS Days\nORDER BY Project, Start',
            [0, 6, 24, 5],
            {},
            { compact: true }
          ),
        ],
      },
    ],
  });
}

// --- Kitchen sink: every report type and parameter type ------------------------------------------

function kitchenSinkDashboard() {
  const r = reportFactory(idFactory('c0ffee00'));
  const FILTERED_ORDERS = `MATCH (cu:Customer)-[:PLACED]->(o:Order)-[c:CONTAINS]->(p:Product)-[:IN_CATEGORY]->(sub:Category)-[:SUBCATEGORY_OF]->(top:Category),
      (cu)-[:LIVES_IN]->(:City)-[:IN_COUNTRY]->(co:Country)
WHERE (coalesce($neodash_category_name, '') = '' OR $neodash_category_name IN [top.name, sub.name])
  AND ($neodash_contains_discount IS NULL OR toString($neodash_contains_discount) = '' OR c.discount = toFloat($neodash_contains_discount))
  AND (coalesce($neodash_search, '') = '' OR toLower(p.name) CONTAINS toLower($neodash_search) OR toLower(cu.name) CONTAINS toLower($neodash_search))
  AND ($neodash_since IS NULL OR $neodash_since = '' OR o.date >= $neodash_since)
  AND (coalesce($neodash_segment, '') = '' OR cu.segment = $neodash_segment)
  AND (size(coalesce($neodash_country_name, [])) = 0 OR co.name IN $neodash_country_name)`;

  return dashboard({
    uuid: 'c0ffee00-0000-4000-8000-000000000000',
    title: 'Kitchen Sink — every report type',
    parameters: {
      neodash_category_name: null,
      neodash_contains_discount: null,
      neodash_search: null,
      neodash_since: null,
      neodash_segment: null,
      neodash_country_name: [],
    },
    pages: [
      {
        title: 'Basics',
        reports: [
          r(
            'text',
            'What this dashboard is for',
            '# Kitchen sink\n\nEvery report and parameter type NeoDash 2.4 supports, on the mock retail dataset. Use it to compare the legacy and rebuilt UIs page by page.\n\n| Page | Covers |\n|---|---|\n| Basics | markdown, single value, table, raw JSON, iframe |\n| Charts | bar (grouped, stacked, horizontal), line, pie, radar, gauge |\n| Hierarchies & flows | treemap, sunburst, circle packing, Sankey |\n| Geo | point map, map with lanes, choropleth, area map |\n| Graphs | 2D graph, 3D graph, movies graph, Gantt |\n| Parameters | every parameter-select type, multi-select |',
            [0, 0, 12, 5]
          ),
          r('value', 'Revenue (all time)', "MATCH (o:Order) WHERE o.status <> 'Cancelled' RETURN toInteger(sum(o.total))", [12, 0, 6, 2], {}, { textAlign: 'center' }),
          r('value', 'Orders', 'MATCH (o:Order) RETURN count(o)', [18, 0, 6, 2], {}, { textAlign: 'center' }),
          r('value', 'Latest order date', 'MATCH (o:Order) RETURN toString(max(o.date))', [12, 2, 6, 3], {}, { textAlign: 'center', fontSize: 48 }),
          r('value', 'Products', 'MATCH (p:Product) RETURN count(p)', [18, 2, 6, 3], {}, { textAlign: 'center' }),
          r(
            'table',
            'Product catalogue',
            'MATCH (p:Product)-[:IN_CATEGORY]->(sub:Category)-[:SUBCATEGORY_OF]->(top:Category)\nRETURN p.sku AS SKU, p.name AS Product, top.name AS Category, sub.name AS Subcategory, p.price AS Price, p.stock AS Stock, p.rating AS Rating, p.launched AS Launched\nORDER BY SKU',
            [0, 5, 16, 6],
            {},
            { compact: true, styleRules: [{ field: 'Stock', condition: '<', value: '50', customization: 'row color', customizationValue: '#fff4ce' }] }
          ),
          r(
            'json',
            'Raw result (one order)',
            "MATCH (cu:Customer)-[:PLACED]->(o:Order {id: 'O-1'})-[c:CONTAINS]->(p:Product)\nRETURN cu {.id, .name, .segment} AS customer, o {.*, date: toString(o.date)} AS order, collect(p.name) AS products",
            [16, 5, 8, 6]
          ),
          r('iframe', 'Embedded page (iframe)', 'https://www.openstreetmap.org/export/embed.html?bbox=-10.5,35.5,30.5,60.5&layer=mapnik', [0, 11, 24, 4]),
        ],
      },
      {
        title: 'Charts',
        reports: [
          r(
            'bar',
            'Revenue by category and segment (grouped)',
            "MATCH (cu:Customer)-[:PLACED]->(o:Order)-[c:CONTAINS]->(:Product)-[:IN_CATEGORY]->(:Category)-[:SUBCATEGORY_OF]->(top:Category)\nWHERE o.status <> 'Cancelled'\nRETURN top.name AS Category, cu.segment AS Segment, toInteger(sum(c.quantity * c.unitPrice)) AS Revenue\nORDER BY Category",
            [0, 0, 12, 4],
            { index: 'Category', value: 'Revenue', key: 'Segment' },
            { groupMode: 'grouped', marginLeft: 70, marginBottom: 60, colors: 'paired', legend: true }
          ),
          r(
            'bar',
            'Orders by year and channel (horizontal, stacked)',
            'MATCH (o:Order)\nRETURN toString(o.date.year) AS Year, o.channel AS Channel, count(o) AS Orders\nORDER BY Year',
            [12, 0, 12, 4],
            { index: 'Year', value: 'Orders', key: 'Channel' },
            { groupMode: 'stacked', layout: 'horizontal', marginLeft: 60, colors: 'set2', legend: true }
          ),
          r(
            'line',
            'Monthly revenue by channel (multi-series)',
            `MATCH (o:Order) WHERE o.status <> 'Cancelled'\nWITH date.truncate('month', o.date) AS Month, o.channel AS channel, sum(o.total) AS revenue\nWITH Month, collect([channel, revenue]) AS pairs\nRETURN Month,\n       ${pivot(CHANNELS, 'pairs')}\nORDER BY Month`,
            [0, 4, 12, 4],
            { x: 'Month', value: CHANNELS },
            { xTickTimeValues: 'every 3 months', xAxisTimeFormat: '%b %Y', marginLeft: 70, legend: true }
          ),
          r(
            'pie',
            'Customers by segment',
            'MATCH (cu:Customer) RETURN cu.segment AS Segment, count(cu) AS Customers',
            [12, 4, 6, 4],
            { index: 'Segment', value: 'Customers', key: '(none)' },
            { colors: 'pastel1' }
          ),
          r(
            'pie',
            'Orders by status (donut)',
            'MATCH (o:Order) RETURN o.status AS Status, count(o) AS Orders',
            [18, 4, 6, 4],
            { index: 'Status', value: 'Orders', key: '(none)' },
            { innerRadius: 0.55, colors: 'set3' }
          ),
          r(
            'radar',
            'Category health',
            `MATCH (top:Category)<-[:SUBCATEGORY_OF]-(:Category)<-[:IN_CATEGORY]-(p:Product)<-[c:CONTAINS]-(o:Order)
WITH top.name AS category,
     100.0 * sum(c.quantity * (c.unitPrice - p.cost)) / sum(c.quantity * c.unitPrice) AS margin,
     avg(p.rating) * 20 AS rating,
     100.0 * sum(CASE WHEN o.onTime THEN 1 ELSE 0 END) / count(o) AS onTime,
     1000.0 * sum(CASE WHEN o.status = 'Returned' THEN 1 ELSE 0 END) / count(o) AS returns
WITH collect({category: category, margin: margin, rating: rating, onTime: onTime, returns: returns}) AS rows
UNWIND [['Margin %', 'margin'], ['Rating (x20)', 'rating'], ['On-time %', 'onTime'], ['Returns (per 1000)', 'returns']] AS m
RETURN m[0] AS Metric,
       ${CATEGORIES.map((k) => `round([r IN rows WHERE r.category = '${k}' | r[m[1]]][0], 1) AS \`${k}\``).join(',\n       ')}`,
            [0, 8, 12, 5],
            { index: 'Metric', values: CATEGORIES },
            { colors: 'set2', legend: true }
          ),
          r(
            'gauge',
            'Average product rating (% of 5)',
            'MATCH (p:Product) RETURN toInteger(round(avg(p.rating) * 20))',
            [12, 8, 6, 5]
          ),
          r(
            'value',
            'Return rate',
            "MATCH (o:Order) RETURN toString(round(100.0 * sum(CASE WHEN o.status = 'Returned' THEN 1 ELSE 0 END) / count(o), 2)) + ' %'",
            [18, 8, 6, 5],
            {},
            { textAlign: 'center', fontSize: 48, marginTop: 40 }
          ),
        ],
      },
      {
        title: 'Hierarchies & flows',
        reports: [
          r('treeMap', 'Revenue treemap', HIERARCHY_QUERY, [0, 0, 12, 6], { index: 'path', value: 'value', key: 'path' }, { colors: 'set2' }),
          r('sunburst', 'Revenue sunburst', HIERARCHY_QUERY, [12, 0, 12, 6], { index: 'path', value: 'value', key: 'path' }, { colors: 'set2' }),
          r('circlePacking', 'Revenue circle packing', HIERARCHY_QUERY, [0, 6, 12, 6], { index: 'path', value: 'value', key: 'path' }, { colors: 'set2' }),
          r(
            'sankey',
            'Supply flows',
            SANKEY_QUERY,
            [12, 6, 12, 6],
            { Supplier: 'name', Warehouse: 'name', Region: 'name' },
            { labelProperty: 'units', labelPosition: 'inside', layout: 'horizontal' }
          ),
        ],
      },
      {
        title: 'Geo',
        reports: [
          r('map', 'Customer cities', 'MATCH (c:City)<-[:LIVES_IN]-(:Customer)\nRETURN DISTINCT c', [0, 0, 12, 6], { City: 'name' }, { defaultNodeSize: 'small' }),
          r(
            'map',
            'Supplier lanes',
            'MATCH (s:Supplier)-[r:SHIPS_TO]->(w:Warehouse)\nRETURN s, r, w',
            [12, 0, 12, 6],
            { Supplier: 'name', Warehouse: 'name', SHIPS_TO: '(label)' },
            { defaultRelColor: 'rgba(200,80,80,0.5)', defaultRelWidth: 3 }
          ),
          r(
            'choropleth',
            'Revenue by country (ISO-3)',
            "MATCH (co:Country)<-[:IN_COUNTRY]-(:City)<-[:LIVES_IN]-(:Customer)-[:PLACED]->(o:Order)\nWHERE o.status <> 'Cancelled'\nRETURN co.code AS code, toInteger(sum(o.total)) AS value",
            [0, 6, 12, 6],
            { index: 'code', value: 'value', key: 'code' },
            { colors: 'greens' }
          ),
          r(
            'areamap',
            'Customers by country (area map, ISO-2)',
            'MATCH (co:Country)<-[:IN_COUNTRY]-(:City)<-[:LIVES_IN]-(cu:Customer)\nRETURN co.code2 AS code, count(cu) AS value',
            [12, 6, 12, 6],
            { index: 'code', value: 'value' },
            { countryCodeFormat: 'Alpha-2', showLegend: true }
          ),
        ],
      },
      {
        title: 'Graphs',
        reports: [
          r(
            'graph',
            'Electronics supply graph',
            "MATCH path = (:Supplier)-[:SUPPLIES]->(:Product)-[:IN_CATEGORY]->(:Category)-[:SUBCATEGORY_OF]->(:Category {name: 'Electronics'})\nRETURN path",
            [0, 0, 12, 6],
            { Supplier: 'name', Product: 'name', Category: 'name' },
            { nodePositions: {}, enableExploration: true }
          ),
          r(
            'graph3d',
            'Whole catalogue (3D)',
            'MATCH path = (:Supplier)-[:SUPPLIES]->(:Product)-[:IN_CATEGORY]->(:Category)-[:SUBCATEGORY_OF]->(:Category)\nRETURN path',
            [12, 0, 12, 6],
            { Supplier: 'name', Product: 'name', Category: 'name' }
          ),
          r(
            'graph',
            'Movies since 2000',
            'MATCH path = (:Person)-[:ACTED_IN]->(m:Movie)\nWHERE m.released >= 2000\nRETURN path',
            [0, 6, 12, 6],
            { Person: 'name', Movie: 'title' },
            { nodePositions: {} }
          ),
          r(
            'gantt',
            'Project plan',
            'MATCH (p:Project)-[:HAS_TASK]->(t:Task)\nOPTIONAL MATCH (t)-[n:NEXT]->(t2:Task)\nRETURN t, n, t2',
            [12, 6, 12, 6],
            {},
            { viewMode: 'Month' }
          ),
        ],
      },
      {
        title: 'Parameters',
        reports: [
          nodeSelect(r, 'Category', 'name', [0, 0, 6, 2], { title: 'Node property' }),
          r(
            'select',
            'Relationship property',
            'MATCH ()-[n:`CONTAINS`]->() \nWHERE toLower(toString(n.`discount`)) CONTAINS toLower($input) \nRETURN DISTINCT n.`discount` as value,  n.`discount` as display ORDER BY size(toString(value)) ASC LIMIT 5',
            [6, 0, 6, 2],
            {},
            {
              type: 'Relationship Property',
              entityType: 'CONTAINS',
              propertyType: 'discount',
              propertyTypeDisplay: 'discount',
              parameterName: 'neodash_contains_discount',
            }
          ),
          r('select', 'Free text', 'RETURN true;', [12, 0, 6, 2], {}, { type: 'Free Text', entityType: 'search', parameterName: 'neodash_search', helperText: 'Product or customer name' }),
          dateSelect(r, 'since', [18, 0, 6, 2], 'Date picker'),
          r(
            'select',
            'Custom query',
            'MATCH (c:Customer)\nWHERE toLower(c.segment) CONTAINS toLower($input)\nRETURN DISTINCT c.segment AS value, c.segment AS display\nORDER BY value',
            [0, 2, 6, 2],
            {},
            { type: 'Custom Query', entityType: 'segment', parameterName: 'neodash_segment' }
          ),
          nodeSelect(r, 'Country', 'name', [6, 2, 10, 2], { title: 'Multi-select', multiSelector: true, multiSelectLimit: 10, helperText: 'Pick one or more countries' }),
          r(
            'table',
            'Current parameter values',
            'RETURN $neodash_category_name AS category, $neodash_contains_discount AS discount, $neodash_search AS search,\n       toString($neodash_since) AS since, $neodash_segment AS segment, $neodash_country_name AS countries',
            [16, 2, 8, 4],
            {},
            { compact: true }
          ),
          r(
            'table',
            'Orders matching all parameters',
            `${FILTERED_ORDERS}\nRETURN o.id AS Order, o.date AS Date, cu.name AS Customer, cu.segment AS Segment, co.name AS Country, p.name AS Product, c.quantity AS Qty, c.discount AS Discount\nORDER BY Date DESC LIMIT 200`,
            [0, 4, 16, 7],
            {},
            { compact: true }
          ),
          r(
            'bar',
            'Matching revenue by category',
            `${FILTERED_ORDERS}\nRETURN top.name AS Category, toInteger(sum(c.quantity * c.unitPrice)) AS Revenue`,
            [16, 6, 8, 5],
            { index: 'Category', value: 'Revenue', key: '(none)' },
            { marginLeft: 70, marginBottom: 80 }
          ),
        ],
      },
    ],
  });
}

// --- Movies (from the gallery, unchanged apart from a fixed uuid) --------------------------------

function moviesDashboard() {
  const movies = JSON.parse(fs.readFileSync(galleryMovies, 'utf8'));
  return { uuid: '30f1e500-0000-4000-8000-000000000000', ...movies };
}

const outputs = {
  'sales.json': salesDashboard(),
  'supply-chain.json': supplyChainDashboard(),
  'kitchen-sink.json': kitchenSinkDashboard(),
  'movies.json': moviesDashboard(),
};

fs.mkdirSync(outDir, { recursive: true });
for (const [file, content] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(content, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), path.join(outDir, file))}`);
}

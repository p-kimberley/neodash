// Deterministic mock data for a fictional retailer ("Acme Outfitters").
// Same seed => same graph on every machine, so dashboards look identical for everyone.

const SEED = 20261021;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const between = (min, max) => min + rand() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const pickWeighted = (items, weight) => {
  const total = items.reduce((s, i) => s + weight(i), 0);
  let r = rand() * total;
  for (const i of items) {
    r -= weight(i);
    if (r <= 0) return i;
  }
  return items[items.length - 1];
};
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// --- Geography ---------------------------------------------------------------------------------

export const regions = ['Europe', 'North America', 'South America', 'Asia Pacific', 'Middle East & Africa'];

// [country, ISO3, ISO2, region, [[city, lat, lon, marketWeight], ...]]
const GEO = [
  ['United Kingdom', 'GBR', 'GB', 'Europe', [['London', 51.5074, -0.1278, 9], ['Manchester', 53.4808, -2.2426, 3]]],
  ['Germany', 'DEU', 'DE', 'Europe', [['Berlin', 52.52, 13.405, 6], ['Munich', 48.1351, 11.582, 4], ['Hamburg', 53.5511, 9.9937, 3]]],
  ['France', 'FRA', 'FR', 'Europe', [['Paris', 48.8566, 2.3522, 7], ['Lyon', 45.764, 4.8357, 2]]],
  ['Netherlands', 'NLD', 'NL', 'Europe', [['Amsterdam', 52.3676, 4.9041, 3], ['Rotterdam', 51.9244, 4.4777, 2]]],
  ['Spain', 'ESP', 'ES', 'Europe', [['Madrid', 40.4168, -3.7038, 4], ['Barcelona', 41.3874, 2.1686, 3]]],
  ['Italy', 'ITA', 'IT', 'Europe', [['Milan', 45.4642, 9.19, 3], ['Rome', 41.9028, 12.4964, 3]]],
  ['Sweden', 'SWE', 'SE', 'Europe', [['Stockholm', 59.3293, 18.0686, 2]]],
  ['Poland', 'POL', 'PL', 'Europe', [['Warsaw', 52.2297, 21.0122, 2]]],
  ['United States', 'USA', 'US', 'North America', [['New York', 40.7128, -74.006, 10], ['Chicago', 41.8781, -87.6298, 5], ['San Francisco', 37.7749, -122.4194, 6], ['Austin', 30.2672, -97.7431, 3]]],
  ['Canada', 'CAN', 'CA', 'North America', [['Toronto', 43.6532, -79.3832, 4], ['Vancouver', 49.2827, -123.1207, 2]]],
  ['Mexico', 'MEX', 'MX', 'North America', [['Mexico City', 19.4326, -99.1332, 3]]],
  ['Brazil', 'BRA', 'BR', 'South America', [['São Paulo', -23.5505, -46.6333, 4]]],
  ['Argentina', 'ARG', 'AR', 'South America', [['Buenos Aires', -34.6037, -58.3816, 2]]],
  ['Chile', 'CHL', 'CL', 'South America', [['Santiago', -33.4489, -70.6693, 1]]],
  ['Japan', 'JPN', 'JP', 'Asia Pacific', [['Tokyo', 35.6762, 139.6503, 7], ['Osaka', 34.6937, 135.5023, 3]]],
  ['Singapore', 'SGP', 'SG', 'Asia Pacific', [['Singapore', 1.3521, 103.8198, 3]]],
  ['Australia', 'AUS', 'AU', 'Asia Pacific', [['Sydney', -33.8688, 151.2093, 4], ['Melbourne', -37.8136, 144.9631, 3]]],
  ['India', 'IND', 'IN', 'Asia Pacific', [['Bengaluru', 12.9716, 77.5946, 3], ['Mumbai', 19.076, 72.8777, 3]]],
  ['China', 'CHN', 'CN', 'Asia Pacific', [['Shanghai', 31.2304, 121.4737, 4], ['Shenzhen', 22.5431, 114.0579, 2]]],
  ['South Korea', 'KOR', 'KR', 'Asia Pacific', [['Seoul', 37.5665, 126.978, 3]]],
  ['New Zealand', 'NZL', 'NZ', 'Asia Pacific', [['Auckland', -36.8485, 174.7633, 1]]],
  ['United Arab Emirates', 'ARE', 'AE', 'Middle East & Africa', [['Dubai', 25.2048, 55.2708, 2]]],
  ['South Africa', 'ZAF', 'ZA', 'Middle East & Africa', [['Johannesburg', -26.2041, 28.0473, 2], ['Cape Town', -33.9249, 18.4241, 1]]],
  ['Kenya', 'KEN', 'KE', 'Middle East & Africa', [['Nairobi', -1.2921, 36.8219, 1]]],
  ['Nigeria', 'NGA', 'NG', 'Middle East & Africa', [['Lagos', 6.5244, 3.3792, 1]]],
];

export const countries = GEO.map(([name, code, code2, region]) => ({ name, code, code2, region }));
export const cities = GEO.flatMap(([country, , , region, list]) =>
  list.map(([name, latitude, longitude, weight]) => ({ name, latitude, longitude, weight, country, region }))
);
const cityByName = Object.fromEntries(cities.map((c) => [c.name, c]));

// --- Catalogue ---------------------------------------------------------------------------------

const CATALOGUE = {
  Electronics: {
    Laptops: [['Aero 13 Laptop', 1199], ['Nimbus 15 Pro', 1749], ['Studio 16 Creator', 2399], ['Lite 14 Chromebook', 449]],
    Phones: [['Pulse X Phone', 899], ['Pulse Mini', 599], ['Orbit Fold', 1599], ['Trail Rugged Phone', 499]],
    Audio: [['Echo Buds', 149], ['Halo Over-Ear', 329], ['Boom Speaker', 199], ['Studio Monitor Pair', 549]],
  },
  'Home & Kitchen': {
    Cookware: [['Cast Iron Skillet', 59], ['Copper Pan Set', 289], ['Dutch Oven 6L', 139], ['Chef Knife 8"', 119]],
    Furniture: [['Oak Desk', 649], ['Ergo Chair', 499], ['Linen Sofa', 1899], ['Walnut Bookshelf', 429]],
    Lighting: [['Arc Floor Lamp', 229], ['Smart Bulb 4-pack', 69], ['Pendant Light', 179], ['Desk Lamp LED', 89]],
  },
  'Sports & Outdoors': {
    Cycling: [['Gravel Bike', 1899], ['City E-Bike', 2599], ['Bike Helmet', 129], ['Cycling Computer', 299]],
    Camping: [['2-Person Tent', 349], ['Down Sleeping Bag', 279], ['Camp Stove', 99], ['Trekking Poles', 89]],
    Fitness: [['Adjustable Dumbbells', 399], ['Yoga Mat', 49], ['Rowing Machine', 1299], ['Smart Watch', 349]],
  },
  Books: {
    Fiction: [['The Quiet Graph', 18], ['Northern Lights Trilogy', 42], ['Salt and Signal', 16], ['The Last Cartographer', 22]],
    'Non-fiction': [['Graphs in Practice', 54], ['Supply Chains Explained', 38], ['A Short History of Data', 29], ['Designing Dashboards', 45]],
    Children: [['Ollie the Owl', 12], ['Space Explorers Atlas', 24], ['Bedtime Puzzles', 14], ['My First Coding Book', 19]],
  },
  Fashion: {
    Footwear: [['Trail Runner', 149], ['Leather Boot', 249], ['Canvas Sneaker', 79], ['Hiking Boot', 219]],
    Outerwear: [['Rain Shell', 199], ['Down Parka', 399], ['Wool Overcoat', 459], ['Fleece Jacket', 119]],
    Accessories: [['Leather Belt', 69], ['Travel Backpack', 179], ['Wool Beanie', 35], ['Sunglasses', 159]],
  },
};

export const categories = Object.entries(CATALOGUE).flatMap(([top, subs]) => [
  { name: top, parent: null },
  ...Object.keys(subs).map((name) => ({ name, parent: top })),
]);

let skuCounter = 1000;
export const products = Object.entries(CATALOGUE).flatMap(([top, subs]) =>
  Object.entries(subs).flatMap(([sub, items]) =>
    items.map(([name, price]) => ({
      sku: `SKU-${skuCounter++}`,
      name,
      category: sub,
      topCategory: top,
      price,
      cost: round2(price * between(0.48, 0.74)),
      rating: round2(between(3.1, 4.9)),
      stock: int(0, 600),
      launched: isoDate(new Date(Date.UTC(2021 + int(0, 4), int(0, 11), int(1, 28)))),
    }))
  )
);

// --- Supply side -------------------------------------------------------------------------------

const SUPPLIERS = [
  ['Shenzhen Circuitworks', 'Shenzhen', ['Electronics']],
  ['Pacific Components', 'Shanghai', ['Electronics', 'Home & Kitchen']],
  ['Hanriver Devices', 'Seoul', ['Electronics']],
  ['Kansai Precision', 'Osaka', ['Electronics', 'Sports & Outdoors']],
  ['Bengal Textiles', 'Bengaluru', ['Fashion']],
  ['Milano Moda', 'Milan', ['Fashion']],
  ['Bavaria Works', 'Munich', ['Home & Kitchen', 'Sports & Outdoors']],
  ['Vistula Furniture', 'Warsaw', ['Home & Kitchen']],
  ['Catalan Outdoor', 'Barcelona', ['Sports & Outdoors', 'Fashion']],
  ['Azteca Manufacturing', 'Mexico City', ['Home & Kitchen', 'Fashion']],
  ['Paulista Press', 'São Paulo', ['Books']],
  ['Lone Star Publishing', 'Austin', ['Books']],
];

export const suppliers = SUPPLIERS.map(([name, city, cats]) => ({
  name,
  city,
  latitude: cityByName[city].latitude,
  longitude: cityByName[city].longitude,
  rating: round2(between(2.8, 4.9)),
  onTimeTarget: pick([0.9, 0.92, 0.95]),
  categories: cats,
}));

// Every product gets one primary supplier from a matching category, sometimes a second.
export const supplies = products.flatMap((p) => {
  const candidates = suppliers.filter((s) => s.categories.includes(p.topCategory));
  const primary = pick(candidates);
  const rows = [{ supplier: primary.name, sku: p.sku, leadTimeDays: int(7, 45), primary: true }];
  const others = candidates.filter((s) => s !== primary);
  if (others.length && rand() < 0.35) rows.push({ supplier: pick(others).name, sku: p.sku, leadTimeDays: int(10, 60), primary: false });
  return rows;
});

const WAREHOUSES = [
  ['WH-EU-RTM', 'Rotterdam Hub', 'Rotterdam', ['Europe'], 120000],
  ['WH-NA-CHI', 'Chicago Hub', 'Chicago', ['North America'], 150000],
  ['WH-SA-SAO', 'São Paulo Hub', 'São Paulo', ['South America'], 50000],
  ['WH-AP-SIN', 'Singapore Hub', 'Singapore', ['Asia Pacific'], 110000],
  ['WH-AP-SYD', 'Sydney Hub', 'Sydney', ['Asia Pacific'], 40000],
  ['WH-ME-DXB', 'Dubai Hub', 'Dubai', ['Middle East & Africa'], 45000],
];

export const warehouses = WAREHOUSES.map(([code, name, city, serves, capacity]) => ({
  code,
  name,
  city,
  latitude: cityByName[city].latitude,
  longitude: cityByName[city].longitude,
  serves,
  capacity,
}));

const warehouseFor = (city) => {
  if (city.country === 'Australia' || city.country === 'New Zealand') return 'WH-AP-SYD';
  return warehouses.find((w) => w.serves.includes(city.region) && w.code !== 'WH-AP-SYD').code;
};
const transitDays = { 'WH-EU-RTM': 2, 'WH-NA-CHI': 3, 'WH-SA-SAO': 5, 'WH-AP-SIN': 4, 'WH-AP-SYD': 3, 'WH-ME-DXB': 4 };

// --- Customers and orders ----------------------------------------------------------------------

const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Rowan', 'Sasha', 'Kai', 'Noor', 'Mika', 'Elif', 'Ravi', 'Lena', 'Tomás', 'Yuki', 'Ade', 'Ines', 'Oskar', 'Priya', 'Mateo', 'Hana', 'Luca', 'Zara', 'Felix', 'Amara'];
const LAST = ['Smith', 'García', 'Müller', 'Rossi', 'Kowalski', 'Tanaka', 'Kim', 'Patel', 'Silva', 'Dubois', 'Jansen', 'Nguyen', 'Okafor', 'Andersson', 'Cohen', 'Moreau', 'Novak', 'Fernández', 'Sato', 'Mensah', 'Walsh', 'Ibrahim', 'Costa', 'Larsen', 'Chen'];
const COMPANY = ['Northwind', 'Bluefin', 'Brightpath', 'Ironbark', 'Lumen', 'Meridian', 'Quarry', 'Summit', 'Tidewater', 'Verdant', 'Kestrel', 'Harbor', 'Granite', 'Saffron', 'Cobalt'];
const COMPANY_SUFFIX = ['Ltd', 'GmbH', 'Group', 'Partners', 'Labs', 'Studio', 'Co.'];
const SEGMENTS = [
  ['Consumer', 0.7],
  ['Small Business', 0.22],
  ['Enterprise', 0.08],
];

// Names are unique so dashboards can filter customers by name.
const usedNames = new Set();
export const customers = Array.from({ length: 450 }, (_, i) => {
  const city = pickWeighted(cities, (c) => c.weight);
  const segment = pickWeighted(SEGMENTS, (s) => s[1])[0];
  let name;
  do {
    name = segment === 'Consumer' ? `${pick(FIRST)} ${pick(LAST)}` : `${pick(COMPANY)} ${pick(COMPANY_SUFFIX)}`;
    if (segment !== 'Consumer' && usedNames.has(name)) name = `${name} ${city.name}`;
  } while (usedNames.has(name));
  usedNames.add(name);
  return {
    id: `C-${String(i + 1).padStart(4, '0')}`,
    name,
    segment,
    city: city.name,
    joined: isoDate(new Date(Date.UTC(2022 + int(0, 3), int(0, 11), int(1, 28)))),
  };
});
const cityOf = Object.fromEntries(customers.map((c) => [c.id, cityByName[c.city]]));

const CHANNELS = [
  ['Web', 0.52],
  ['Mobile', 0.28],
  ['Store', 0.12],
  ['Partner', 0.08],
];
// Each segment leans towards different categories.
const SEGMENT_TASTE = {
  Consumer: { Electronics: 3, 'Home & Kitchen': 2, 'Sports & Outdoors': 2, Books: 3, Fashion: 4 },
  'Small Business': { Electronics: 5, 'Home & Kitchen': 3, 'Sports & Outdoors': 1, Books: 2, Fashion: 1 },
  Enterprise: { Electronics: 6, 'Home & Kitchen': 4, 'Sports & Outdoors': 1, Books: 1, Fashion: 1 },
};
// Warehouses with chronic delays, so the delivery dashboards have something to show.
const DELAY_PRONE = { 'WH-SA-SAO': 0.3, 'WH-ME-DXB': 0.22, 'WH-AP-SIN': 0.12 };

const START = new Date(Date.UTC(2024, 0, 1));
const END = new Date(Date.UTC(2026, 9, 20));
const TODAY = new Date(Date.UTC(2026, 9, 21));

export const orders = [];
export const orderLines = [];

let orderSeq = 1;
for (let day = START; day <= END; day = addDays(day, 1)) {
  const monthsIn = (day - START) / (30.4 * 86400000);
  const growth = 1 + monthsIn * 0.025;
  const month = day.getUTCMonth();
  const seasonal = month === 10 ? 1.6 : month === 11 ? 1.9 : month === 0 ? 0.75 : month >= 5 && month <= 7 ? 1.1 : 1;
  const weekday = day.getUTCDay();
  const weekly = weekday === 0 || weekday === 6 ? 1.2 : 1;
  const expected = 3.2 * growth * seasonal * weekly;
  const count = Math.max(0, Math.round(expected + between(-1.5, 1.5)));

  for (let n = 0; n < count; n++) {
    const customer = pick(customers);
    const city = cityOf[customer.id];
    const warehouse = warehouseFor(city);
    const taste = SEGMENT_TASTE[customer.segment];
    const lineCount = customer.segment === 'Enterprise' ? int(2, 6) : int(1, 3);
    const chosen = new Set();
    let total = 0;
    for (let l = 0; l < lineCount; l++) {
      const product = pickWeighted(products, (p) => taste[p.topCategory] * (p.price < 100 ? 1.6 : 1));
      if (chosen.has(product.sku)) continue;
      chosen.add(product.sku);
      const quantity = customer.segment === 'Enterprise' ? int(2, 25) : product.price < 60 ? int(1, 4) : 1;
      const discount = customer.segment === 'Consumer' ? pick([0, 0, 0, 0.1, 0.15]) : pick([0.05, 0.1, 0.15, 0.2]);
      const unitPrice = round2(product.price * (1 - discount));
      total += unitPrice * quantity;
      orderLines.push({ order: `O-${orderSeq}`, sku: product.sku, quantity, unitPrice, discount });
    }

    const shipped = addDays(day, int(0, 2));
    const prone = DELAY_PRONE[warehouse] ?? 0.05;
    const delayDays = rand() < prone ? int(1, 12) : 0;
    const delivered = addDays(shipped, transitDays[warehouse] + int(0, 2) + delayDays);
    let status = 'Delivered';
    const r = rand();
    if (r < 0.03) status = 'Cancelled';
    else if (r < 0.055) status = 'Returned';
    else if (delivered > TODAY) status = shipped > TODAY ? 'Processing' : 'Shipped';

    orders.push({
      id: `O-${orderSeq}`,
      customer: customer.id,
      warehouse,
      date: isoDate(day),
      channel: pickWeighted(CHANNELS, (c) => c[1])[0],
      status,
      total: round2(total),
      shippedDate: status === 'Cancelled' ? null : isoDate(shipped),
      deliveredDate: delivered <= TODAY && status !== 'Cancelled' ? isoDate(delivered) : null,
      // Delivery performance is only known once an order has arrived.
      delayDays: delivered <= TODAY && status !== 'Cancelled' ? delayDays : null,
      onTime: delivered <= TODAY && status !== 'Cancelled' ? delayDays === 0 : null,
    });
    orderSeq++;
  }
}

// --- Projects (for the Gantt chart) ------------------------------------------------------------

const PROJECTS = [
  ['Rotterdam Hub Expansion', '2026-03-02', [['Business case', 14, 'EE'], ['Permits', 35, 'ES'], ['Construction', 70, 'ES'], ['Racking & automation', 28, 'ES'], ['Staff hiring', 30, 'SS'], ['Go-live', 7, 'ES']]],
  ['ERP Migration', '2026-05-04', [['Discovery', 21, 'ES'], ['Data mapping', 28, 'ES'], ['Build & configure', 56, 'ES'], ['User acceptance testing', 21, 'ES'], ['Cut-over', 5, 'ES'], ['Hypercare', 30, 'ES']]],
  ['Same-day Delivery Pilot', '2026-08-03', [['Partner selection', 14, 'ES'], ['Route planning', 21, 'SS'], ['Pilot in London', 42, 'ES'], ['Review', 10, 'ES']]],
];

export const projects = PROJECTS.map(([name, start, tasks]) => {
  let cursor = new Date(`${start}T00:00:00Z`);
  let prevStart = cursor;
  const rows = tasks.map(([task, days, dep], i) => {
    // 'SS' tasks start alongside the previous one; everything else follows it.
    const begin = dep === 'SS' && i > 0 ? prevStart : cursor;
    const end = addDays(begin, days);
    prevStart = begin;
    cursor = end > cursor ? end : cursor;
    return { name: task, startDate: isoDate(begin), endDate: isoDate(end), dependency: dep };
  });
  return { name, tasks: rows };
});

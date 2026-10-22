// A stand-in for a language model on an OpenAI-compatible API, for trying Build with AI in the dev
// stack without a GPU: it answers with fixed queries and reports for the seeded data, chosen by
// keywords. Not a model; point AI_BASE_URL at a real one (e.g. vLLM) to try that.

import http from 'node:http';

const ANSWERS = [
  [
    /actor|acted|person|people/i,
    'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name AS actor, count(m) AS movies ORDER BY movies DESC LIMIT 10',
  ],
  [/movie|film/i, 'MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY released DESC LIMIT 10'],
  [/customer/i, 'MATCH (c:Customer) RETURN c.name AS customer, c.segment AS segment LIMIT 10'],
  [/order/i, 'MATCH (o:Order) RETURN o.id AS order, o.date AS date, o.total AS total ORDER BY date DESC LIMIT 10'],
  // Not valid Cypher, so the backend's EXPLAIN check and retry can be seen.
  [/broken/i, 'SELECT * FROM nodes'],
];
const FALLBACK = 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC';

// Reports for the seeded retail data, for Build with AI (keywords in the description pick one).
const REPORTS = {
  channel: {
    type: 'bar',
    title: 'Orders by channel',
    query: 'MATCH (o:Order) RETURN o.channel AS channel, count(o) AS orders ORDER BY orders DESC',
    selection: { index: 'channel', value: 'orders' },
    why: 'How orders split across sales channels.',
  },
  segment: {
    type: 'pie',
    title: 'Customers by segment',
    query: 'MATCH (c:Customer) RETURN c.segment AS segment, count(c) AS customers ORDER BY customers DESC',
    selection: { index: 'segment', value: 'customers' },
    why: 'The mix of customer segments.',
  },
  month: {
    type: 'line',
    title: 'Revenue per month',
    query: "MATCH (o:Order) RETURN date.truncate('month', o.date) AS month, sum(o.total) AS revenue ORDER BY month",
    selection: { x: 'month', value: ['revenue'] },
    why: 'Revenue over time.',
  },
  product: {
    type: 'bar',
    title: 'Top products by units',
    query:
      'MATCH (:Order)-[:CONTAINS]->(p:Product) RETURN p.name AS product, count(*) AS units ORDER BY units DESC LIMIT 10',
    selection: { index: 'product', value: 'units' },
    why: 'The best-selling products.',
  },
};
const reportFor = (text) =>
  /segment/i.test(text)
    ? REPORTS.segment
    : /month|trend|time|revenue/i.test(text)
      ? REPORTS.month
      : /product/i.test(text)
        ? REPORTS.product
        : REPORTS.channel;

/** Build with AI requests (told apart by their instructions); undefined for other questions. */
const builderAnswer = (messages) => {
  const system = String(messages.find((m) => m.role === 'system')?.content ?? '');
  const users = messages.filter((m) => m.role === 'user').map((m) => String(m.content));
  const request = users[0] ?? '';
  const correcting = users.length > 1;
  if (system.startsWith('You suggest reports')) {
    const first = reportFor(request);
    const others = Object.values(REPORTS).filter((r) => r !== first);
    return { suggestions: [first, ...others].slice(0, 3) };
  }
  if (system.startsWith('You build one report')) {
    const report = reportFor(request);
    // "broken" first answers with a misspelt label, so the checks and the correction can be seen.
    if (/broken/i.test(request) && !correcting) return { ...report, query: report.query.replace(':Order', ':Ordr') };
    return report;
  }
  if (system.startsWith('Choose settings')) {
    const settings = {};
    if (/horizontal/i.test(request)) settings.layout = 'horizontal';
    if (/legend/i.test(request)) settings.legend = true;
    if (/stacked/i.test(request)) settings.groupMode = 'stacked';
    return { settings };
  }
  return undefined;
};

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      return send(res, 200, { data: [{ id: 'fake-cypher', object: 'model' }] });
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions')
      return send(res, 404, { error: { message: 'Not found' } });
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const { messages = [] } = JSON.parse(raw || '{}');
      // Describing a query in English (the report editor's English mode).
      const system = String(messages.find((m) => m.role === 'system')?.content ?? '');
      if (system.startsWith('You explain')) {
        const query = String(messages.at(-1)?.content ?? '');
        const text = /Movie/.test(query)
          ? 'The 10 most recently released movies, newest first.'
          : /Order/.test(query)
            ? 'Orders with their dates and totals, newest first.'
            : 'How many nodes have each label, most first.';
        console.log(`describe: ${query.slice(0, 60)} -> ${text}`);
        return send(res, 200, { choices: [{ index: 0, message: { role: 'assistant', content: text } }] });
      }
      const built = builderAnswer(messages);
      if (built) {
        console.log(`builder: ${JSON.stringify(built).slice(0, 100)}`);
        return send(res, 200, {
          choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(built) } }],
        });
      }
      // The question is the first line of the last message from the user.
      const question = String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '').split('\n')[0];
      const retry = /^That query fails/.test(question);
      const answer = retry ? FALLBACK : (ANSWERS.find(([pattern]) => pattern.test(question))?.[1] ?? FALLBACK);
      console.log(`${retry ? 'retry' : 'question'}: ${question.slice(0, 80)} -> ${answer.slice(0, 60)}`);
      // Wrapped in a code fence, as real models often do despite being asked not to.
      send(res, 200, {
        choices: [{ index: 0, message: { role: 'assistant', content: '```cypher\n' + answer + '\n```' } }],
      });
    });
  })
  .listen(8000, () => console.log('fake LLM on :8000'));

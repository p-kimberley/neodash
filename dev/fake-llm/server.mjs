// A stand-in for a language model on an OpenAI-compatible API, for trying Text2Cypher in the dev
// stack without a GPU: it answers with a fixed query for the seeded data, chosen by keywords in the
// question. Not a model; point TEXT2CYPHER_BASE_URL at a real one (e.g. vLLM) to try that.

import http from 'node:http';

const ANSWERS = [
  [/actor|acted|person|people/i, 'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name AS actor, count(m) AS movies ORDER BY movies DESC LIMIT 10'],
  [/movie|film/i, 'MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY released DESC LIMIT 10'],
  [/customer/i, 'MATCH (c:Customer) RETURN c.name AS customer, c.segment AS segment LIMIT 10'],
  [/order/i, 'MATCH (o:Order) RETURN o.id AS order, o.date AS date, o.total AS total ORDER BY date DESC LIMIT 10'],
  // Not valid Cypher, so the backend's EXPLAIN check and retry can be seen.
  [/broken/i, 'SELECT * FROM nodes'],
];
const FALLBACK = 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC';

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      return send(res, 200, { data: [{ id: 'fake-cypher', object: 'model' }] });
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return send(res, 404, { error: { message: 'Not found' } });
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const { messages = [] } = JSON.parse(raw || '{}');
      // The question is the first line of the last message from the user.
      const question = String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '').split('\n')[0];
      const retry = /^That query fails/.test(question);
      const answer = retry ? FALLBACK : (ANSWERS.find(([pattern]) => pattern.test(question))?.[1] ?? FALLBACK);
      console.log(`${retry ? 'retry' : 'question'}: ${question.slice(0, 80)} -> ${answer.slice(0, 60)}`);
      // Wrapped in a code fence, as real models often do despite being asked not to.
      send(res, 200, { choices: [{ index: 0, message: { role: 'assistant', content: '```cypher\n' + answer + '\n```' } }] });
    });
  })
  .listen(8000, () => console.log('fake LLM on :8000'));

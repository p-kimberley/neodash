// Text2Cypher: turns a question into a Cypher query with a language model on an OpenAI-compatible
// chat completions API (vLLM, OpenAI, Ollama, LiteLLM, ...). The backend calls the model, so browsers
// never see the endpoint or its key, and the database schema the model needs is read here too. Each
// answer is checked with EXPLAIN (in a read transaction) before it is returned; when that fails, the
// model gets the error and one more try.

import neo4j, { type Driver } from 'neo4j-driver';
import { formatCypher } from './ai/format.js';

export interface Text2CypherConfig {
  /** Base URL of the API, e.g. http://vllm.ai.svc:8000/v1 (requests go to <baseUrl>/chat/completions). */
  baseUrl: string;
  model: string;
  /** Sent as a bearer token when set. */
  apiKey?: string;
  timeoutSeconds: number;
  /** How many answers the model may give for one question (the first plus retries). */
  maxAttempts: number;
  temperature: number;
  maxTokens?: number;
  /** How long a database's schema is reused before it is read again. */
  schemaTtlSeconds: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TranslateRequest {
  question: string;
  database: string;
  /** The report the query is for, so the model returns the columns that report expects. */
  reportType?: string;
  /** Earlier questions for the same report and the queries they produced. */
  history?: { question: string; query: string }[];
  /** Question / answer pairs written by dashboard authors, to steer the model. */
  examples?: { question: string; answer: string }[];
}

export class Text2CypherError extends Error {
  constructor(
    message: string,
    public readonly code: 'model_unavailable' | 'translation_failed' | 'schema_unavailable',
    public readonly lastAnswer?: string
  ) {
    super(message);
  }
}

const TASK = `You are an expert Neo4j Cypher translator who understands the question in English and converts it to Cypher strictly based on the Neo4j schema provided, following these instructions:
1. Generate a Cypher query compatible ONLY with Neo4j version 5.
2. Do not use the EXISTS or SIZE keywords. Use an alias when using the WITH keyword.
3. Do not use the same variable name for different nodes and relationships in the query.
4. Use only the node labels, relationship types and properties in the schema, and respect relationship directions.
5. Always search properties case-insensitively and fuzzily, e.g. to search for a company name use toLower(c.name) CONTAINS 'neo4j'.
6. Always use aliases to refer to nodes in the query.
7. 'Answer' is NOT a Cypher keyword and must never be used in a query.
8. Generate only one Cypher query per question.
9. Cypher is NOT SQL: do not mix the syntaxes.
10. Words prefixed with $ are parameters; keep them as they are.
11. Answer with the Cypher query only: no explanation, no comments, no code fences.`;

const DESCRIBE_TASK = `You explain Neo4j Cypher queries to people who don't know Cypher. Describe what the query shows as a short request in plain English (one or two sentences), the way someone would ask for it, for example "The 10 best-selling products by units, most first." Mention filters, grouping, sorting and limits. Refer to parameters ($name) as "the selected <name in plain words>". Answer with the description only: no Cypher, no quotes, no preamble.`;

/** What each report type expects from a query, with an example. */
const REPORT_SHAPES: Record<string, { description: string; example: string }> = {
  table: {
    description: 'Multiple columns with property values of nodes and relationships.',
    example:
      'MATCH (n:Movie)<-[:ACTED_IN]-(p:Person) RETURN n.title AS title, n.released AS released, count(p) AS actors',
  },
  graph: {
    description: 'Node and relationship objects (return the relationships too).',
    example: "MATCH (p:Person)-[a:ACTED_IN]->(m:Movie) WHERE m.title = 'The Matrix' RETURN p, a, m",
  },
  bar: {
    description: 'Two columns: a category (text) and a value (number).',
    example: 'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS category, count(p) AS value',
  },
  line: {
    description: 'Two numeric columns, x and y (x may be a date).',
    example: 'MATCH (p:Person) RETURN (p.born / 10) * 10 AS decade, count(p) AS people ORDER BY decade',
  },
  pie: {
    description: 'Two columns: a category and a value.',
    example: 'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS category, count(p) AS value LIMIT 10',
  },
  value: { description: 'A single value in a single column.', example: 'MATCH (n) RETURN count(n)' },
  json: { description: 'Any result, shown as raw JSON.', example: 'MATCH (n) RETURN n LIMIT 5' },
  map: {
    description: 'Nodes (with point or latitude/longitude properties) and relationships.',
    example: 'MATCH (b:Brewery) RETURN b',
  },
  sunburst: {
    description: 'Two columns: a path (list of strings) and a value (number).',
    example:
      'MATCH path = (:Company)-[:HAS_DEPARTMENT*]->(d:Department) RETURN [n IN nodes(path) | n.name] AS path, d.employees AS value',
  },
  circlepacking: {
    description: 'Two columns: a path (list of strings) and a value (number).',
    example:
      'MATCH path = (:Company)-[:HAS_DEPARTMENT*]->(d:Department) RETURN [n IN nodes(path) | n.name] AS path, d.employees AS value',
  },
  treemap: {
    description: 'Two columns: a path (list of strings) and a value (number).',
    example:
      'MATCH path = (:Company)-[:HAS_DEPARTMENT*]->(d:Department) RETURN [n IN nodes(path) | n.name] AS path, d.employees AS value',
  },
  choropleth: {
    description: 'Two columns: a country code (text) and a value (number).',
    example: 'MATCH (e:Employee)-[:LIVES_IN]->(c:Country) RETURN c.code AS code, count(e) AS value',
  },
  areamap: {
    description: 'Two columns: a country or region code (text) and a value (number).',
    example: 'MATCH (e:Employee)-[:LIVES_IN]->(c:Country) RETURN c.code AS code, count(e) AS value',
  },
  radar: {
    description: 'One column with a category, and one numeric column per series.',
    example: 'MATCH (s:Skill)<-[h:HAS_SKILL]-(p:Player {name: "Messi"}) RETURN s.name AS skill, h.value AS Messi',
  },
  sankey: {
    description: 'Two node objects and the relationship object between them.',
    example: 'MATCH (p:Person)-[r:RATES]->(m:Movie) RETURN p, r, m',
  },
  gauge: { description: 'A single number in a single column.', example: 'MATCH (c:CPU {id: 1}) RETURN c.load * 100' },
};

// Report type ids (and the labels older clients sent) for the shapes above.
const REPORT_ALIASES: Record<string, string> = {
  graph3d: 'graph',
  barchart: 'bar',
  linechart: 'line',
  piechart: 'pie',
  singlevalue: 'value',
  rawjson: 'json',
  gaugechart: 'gauge',
  sankeychart: 'sankey',
  radarchart: 'radar',
};

export function reportShape(reportType?: string) {
  const key = (reportType ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return REPORT_SHAPES[REPORT_ALIASES[key] ?? key];
}

const SCHEMA_SAMPLE_SIZE = 10000;

/** Strips what models add around a query despite being asked not to: code fences and a "cypher" tag. */
export function cleanAnswer(answer: string): string {
  let text = answer.trim();
  const fenced = /```(?:[a-zA-Z]*)\s*\n?([\s\S]*?)```/.exec(text);
  if (fenced) text = fenced[1]!.trim();
  return text.replace(/^cypher\s*\n/i, '').trim();
}

/** The names in a database's schema, for checking what a model wrote (and suggesting corrections). */
export interface SchemaNames {
  labels: string[];
  relationshipTypes: string[];
  /** Property names, on any label or relationship type. */
  properties: string[];
}

interface SchemaParts {
  nodes: Map<string, string[]>;
  rels: Map<string, string[]>;
  patterns: Set<string>;
}

export class Text2Cypher {
  private schemas = new Map<string, { text: string; names: SchemaNames; at: number }>();
  /** Request fields the model has refused (e.g. temperature), left out of later requests. */
  private unsupported = new Set<string>();

  constructor(
    private readonly config: Text2CypherConfig,
    private readonly driver: Driver,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  get model() {
    return this.config.model;
  }

  /** The schema of a database as text for the model; read once per schemaTtlSeconds. */
  async schema(database: string): Promise<string> {
    return (await this.cachedSchema(database)).text;
  }

  /** The label, relationship type and property names of a database (from the same cached read). */
  async schemaNames(database: string): Promise<SchemaNames> {
    return (await this.cachedSchema(database)).names;
  }

  private async cachedSchema(database: string) {
    const cached = this.schemas.get(database);
    if (cached && Date.now() - cached.at < this.config.schemaTtlSeconds * 1000) return cached;
    let parts: SchemaParts;
    try {
      parts = await this.readSchemaWithApoc(database).catch(() => this.readSchemaBuiltIn(database));
    } catch (e) {
      throw new Text2CypherError(`Could not read the database schema: ${(e as Error).message}`, 'schema_unavailable');
    }
    const entry = { text: describeSchema(parts), names: namesOf(parts), at: Date.now() };
    this.schemas.set(database, entry);
    return entry;
  }

  private async read<T>(database: string, query: string, parameters: Record<string, unknown> = {}) {
    const session = this.driver.session({ database, defaultAccessMode: neo4j.session.READ });
    try {
      return (await session.executeRead((tx) => tx.run(query, parameters), { timeout: 30_000 })).records as T;
    } finally {
      await session.close();
    }
  }

  /** APOC's sampled metadata: labels with typed properties, relationship types and patterns. */
  private async readSchemaWithApoc(database: string): Promise<SchemaParts> {
    const records: any[] = await this.read(
      database,
      `CALL apoc.meta.data({maxRels: 10, sample: $sample})
       YIELD label, other, elementType, type, property
       RETURN label, other, elementType, type, property`,
      { sample: neo4j.int(SCHEMA_SAMPLE_SIZE) }
    );
    const nodes = new Map<string, string[]>();
    const rels = new Map<string, string[]>();
    const patterns = new Set<string>();
    for (const r of records) {
      const label = String(r.get('label'));
      const type = String(r.get('type'));
      const property = String(r.get('property'));
      const elementType = String(r.get('elementType'));
      if (type === 'RELATIONSHIP') {
        if (elementType === 'node') {
          for (const target of r.get('other') ?? []) patterns.add(`(:${label})-[:${property}]->(:${target})`);
        }
        continue;
      }
      const into = elementType === 'node' ? nodes : rels;
      into.set(label, [...(into.get(label) ?? []), `${property}: ${type}`]);
    }
    return { nodes, rels, patterns };
  }

  /** The same from Neo4j's own schema procedures (no APOC needed). */
  private async readSchemaBuiltIn(database: string): Promise<SchemaParts> {
    const nodes = new Map<string, string[]>();
    const rels = new Map<string, string[]>();
    const patterns = new Set<string>();
    const nodeProps: any[] = await this.read(
      database,
      'CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName, propertyTypes RETURN nodeLabels, propertyName, propertyTypes'
    );
    for (const r of nodeProps) {
      const label = (r.get('nodeLabels') ?? []).join(':');
      const property = r.get('propertyName');
      if (!nodes.has(label)) nodes.set(label, []);
      if (property) nodes.get(label)!.push(`${property}: ${(r.get('propertyTypes') ?? [])[0] ?? 'Any'}`);
    }
    const relProps: any[] = await this.read(
      database,
      'CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes RETURN relType, propertyName, propertyTypes'
    );
    for (const r of relProps) {
      const type = String(r.get('relType')).replace(/^:`?|`$/g, '');
      const property = r.get('propertyName');
      if (!rels.has(type)) rels.set(type, []);
      if (property) rels.get(type)!.push(`${property}: ${(r.get('propertyTypes') ?? [])[0] ?? 'Any'}`);
    }
    // The visualisation's virtual relationships refer to its virtual nodes by id.
    const visual: any[] = await this.read(
      database,
      'CALL db.schema.visualization() YIELD nodes, relationships RETURN nodes, relationships'
    );
    for (const r of visual) {
      const labelOf = new Map<string, string>();
      for (const n of r.get('nodes') ?? [])
        labelOf.set(String(n.elementId ?? n.identity), n.labels?.[0] ?? n.properties?.name);
      for (const rel of r.get('relationships') ?? []) {
        const start = labelOf.get(String(rel.startNodeElementId ?? rel.start));
        const end = labelOf.get(String(rel.endNodeElementId ?? rel.end));
        if (start && end) patterns.add(`(:${start})-[:${rel.type}]->(:${end})`);
      }
    }
    return { nodes, rels, patterns };
  }

  /** One chat completion: the model's answer text. `extra` adds request fields (e.g. response_format). */
  async chat(messages: ChatMessage[], extra: Record<string, unknown> = {}): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response: Response;
    let body: any;
    for (;;) {
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.config.model,
            messages,
            ...(this.unsupported.has('temperature') ? {} : { temperature: this.config.temperature }),
            ...(this.config.maxTokens && !this.unsupported.has('max_tokens') ? { max_tokens: this.config.maxTokens } : {}),
            ...extra,
          }),
          signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000),
        });
      } catch (e) {
        throw new Text2CypherError(
          `The language model could not be reached: ${(e as Error).message}`,
          'model_unavailable'
        );
      }
      body = await response.json().catch(() => ({}));
      if (response.ok) break;
      const detail = body?.error?.message ?? body?.message ?? `status ${response.status}`;
      // Some models refuse a sampling parameter (e.g. "temperature is deprecated for this model"): leave
      // it out from now on and ask again.
      const refused = ['temperature', 'max_tokens'].find(
        (p) => !this.unsupported.has(p) && new RegExp(`\\b${p}\\b`, 'i').test(`${detail}`) && response.status < 500
      );
      if (refused) {
        this.unsupported.add(refused);
        continue;
      }
      throw new Text2CypherError(`The language model returned an error: ${detail}`, 'model_unavailable');
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Text2CypherError('The language model returned no answer', 'model_unavailable');
    }
    return content;
  }

  /** Checks that a query parses and plans against the database, without running it. */
  async explain(database: string, query: string): Promise<string | undefined> {
    try {
      await this.read(database, `EXPLAIN ${query}`);
      return undefined;
    } catch (e) {
      return (e as Error).message;
    }
  }

  /**
   * The other way round: what a query shows, in plain English, phrased as the request someone would
   * make for it (so it can be edited and translated back).
   */
  async describe(database: string, query: string): Promise<string> {
    const schema = await this.schema(database);
    const answer = await this.chat([
      { role: 'system', content: `${DESCRIBE_TASK}\n\nSchema:\n${schema}` },
      { role: 'user', content: query },
    ]);
    return answer
      .trim()
      .replace(/^```[a-z]*\s*|```$/g, '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
  }

  async translate(request: TranslateRequest): Promise<{ query: string; attempts: number }> {
    const schema = await this.schema(request.database);
    const messages: ChatMessage[] = [{ role: 'system', content: `${TASK}\n\nSchema:\n${schema}` }];
    const examples = (request.examples ?? []).filter((e) => e.question && e.answer);
    if (examples.length) {
      messages.push({
        role: 'system',
        content: `Examples of questions and their queries:\n${examples
          .map((e) => `Question: ${e.question}\nQuery: ${e.answer}`)
          .join('\n')}`,
      });
    }
    for (const turn of (request.history ?? []).slice(-5)) {
      messages.push({ role: 'user', content: turn.question }, { role: 'assistant', content: turn.query });
    }
    const shape = reportShape(request.reportType);
    messages.push({
      role: 'user',
      content: shape
        ? `${request.question}\nThe result must have this shape: ${shape.description}\nFor example: ${shape.example}`
        : request.question,
    });

    let answer = '';
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      answer = formatCypher(cleanAnswer(await this.chat(messages)));
      const error = await this.explain(request.database, answer);
      if (!error) return { query: answer, attempts: attempt };
      messages.push(
        { role: 'assistant', content: answer },
        {
          role: 'user',
          content: `That query fails: ${error}\nCorrect it. Answer with the Cypher query only, without comments or explanations.`,
        }
      );
    }
    throw new Text2CypherError(
      'The model could not translate the question into a valid query. Try naming the node labels, relationship types and properties to use.',
      'translation_failed',
      answer
    );
  }
}

function namesOf({ nodes, rels }: SchemaParts): SchemaNames {
  const properties = new Set<string>();
  for (const props of [...nodes.values(), ...rels.values()]) {
    for (const p of props) properties.add(p.split(':')[0]!.trim());
  }
  return {
    labels: [...new Set([...nodes.keys()].flatMap((l) => l.split(':')))].filter(Boolean),
    relationshipTypes: [...rels.keys()],
    properties: [...properties].filter(Boolean),
  };
}

function describeSchema({ nodes, rels, patterns }: SchemaParts) {
  if (!nodes.size && !rels.size) throw new Error('the database is empty');
  const list = (m: Map<string, string[]>, prefix: string) =>
    [...m.entries()].map(([name, props]) => `${prefix}${name} {${props.join(', ')}}`).join('\n');
  return [
    'Node labels and their properties:',
    list(nodes, ':'),
    'Relationship types and their properties:',
    list(rels, ':'),
    'Relationships (from source to target):',
    [...patterns].join('\n'),
  ].join('\n');
}

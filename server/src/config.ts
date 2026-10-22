import fs from 'node:fs';
import { z } from 'zod';

// Every setting comes from the environment. Secrets can instead be read from a file by setting
// <NAME>_FILE, which is how Kubernetes Secrets and Docker secrets are normally mounted.

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const schema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    // The URL users reach NeoDash on, e.g. https://neodash.example.com. Used for OIDC redirects,
    // cookie security and the Origin check on state-changing requests.
    PUBLIC_URL: z.string().url(),
    // Other origins the UI may be served from, e.g. the webpack dev server (http://localhost:5173).
    // Requests from these pass the Origin check, and sign-in may return to them.
    ADDITIONAL_ORIGINS: csv.default(''),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // Built frontend to serve. Leave unset when the frontend is served separately (e.g. dev server).
    STATIC_DIR: z.string().optional(),
    // Set when NeoDash sits behind a reverse proxy / ingress, so client IPs in audit logs are right.
    TRUST_PROXY: bool.default('false'),

    NEO4J_URI: z.string().default('neo4j://localhost:7687'),
    NEO4J_USERNAME: z.string().default('neo4j'),
    NEO4J_PASSWORD: z.string().min(1),
    // Databases reports may query. The first one is the default.
    NEO4J_DATABASES: csv.default('neo4j'),
    // Database holding the _Neodash_Dashboard nodes. Defaults to the first of NEO4J_DATABASES.
    DASHBOARD_DATABASE: z.string().optional(),

    QUERY_TIMEOUT_SECONDS_DEFAULT: z.coerce.number().positive().default(20),
    QUERY_TIMEOUT_SECONDS_MAX: z.coerce.number().positive().default(120),
    QUERY_ROW_LIMIT_MAX: z.coerce.number().int().positive().default(10000),

    OIDC_ISSUER_URL: z.string().url(),
    // Where the backend fetches the discovery document from, if different from the issuer
    // (e.g. an in-cluster Keycloak service). The issuer in the document must equal OIDC_ISSUER_URL.
    OIDC_DISCOVERY_URL: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_SCOPES: z.string().default('openid profile email'),
    // Dot-separated path to the roles array in the ID / access token.
    OIDC_ROLES_CLAIM: z.string().default('realm_access.roles'),
    OIDC_USERNAME_CLAIM: z.string().default('preferred_username'),
    // Only for local development against an http:// identity provider.
    OIDC_ALLOW_INSECURE_HTTP: bool.default('false'),
    ROLE_VIEWER: z.string().default('neodash-viewer'),
    ROLE_EDITOR: z.string().default('neodash-editor'),

    // At least 32 characters. Rotating it logs everyone out.
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_MAX_AGE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(8 * 60 * 60),

    // Map background tiles, e.g. an internal tile server: https://tiles.internal/{z}/{x}/{y}.png.
    // Empty (the default) means no tiles, so nothing is fetched from the internet.
    MAP_TILE_URL: z.string().default(''),
    MAP_TILE_ATTRIBUTION: z.string().default(''),
    // Where the choropleth / area map charts load country shapes (GeoJSON) from.
    MAP_DATA_URL: z.string().default('/maps'),

    // Include query parameter values in audit logs. Turn off if parameters may hold sensitive data.
    AUDIT_LOG_PARAMETERS: bool.default('true'),

    // Text2Cypher: a language model on an OpenAI-compatible API (e.g. vLLM) that writes queries from
    // questions. Off unless a base URL is set, e.g. http://vllm.ai.svc:8000/v1.
    TEXT2CYPHER_BASE_URL: z.string().url().optional(),
    TEXT2CYPHER_MODEL: z.string().optional(),
    // Optional; sent as a bearer token. Usually from a Secret, via TEXT2CYPHER_API_KEY_FILE.
    TEXT2CYPHER_API_KEY: z.string().optional(),
    TEXT2CYPHER_TIMEOUT_SECONDS: z.coerce.number().positive().default(60),
    // Answers the model may give per question: the first, and retries with the error when it fails.
    TEXT2CYPHER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
    TEXT2CYPHER_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
    TEXT2CYPHER_MAX_TOKENS: z.coerce.number().int().positive().optional(),
    // How long a database's schema (sent to the model) is reused before it is read again.
    TEXT2CYPHER_SCHEMA_TTL_SECONDS: z.coerce.number().int().min(0).default(300),
  })
  .refine((c) => !c.TEXT2CYPHER_BASE_URL || c.TEXT2CYPHER_MODEL, {
    message: 'TEXT2CYPHER_MODEL is required when TEXT2CYPHER_BASE_URL is set',
    path: ['TEXT2CYPHER_MODEL'],
  });

export type Config = ReturnType<typeof loadConfig>;

const SECRET_KEYS = ['NEO4J_PASSWORD', 'OIDC_CLIENT_SECRET', 'SESSION_SECRET', 'TEXT2CYPHER_API_KEY'] as const;

function withFileSecrets(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env };
  for (const key of SECRET_KEYS) {
    const file = env[`${key}_FILE`];
    if (file && !env[key]) out[key] = fs.readFileSync(file, 'utf8').trim();
  }
  // NEO4J_AUTH_FILE ("user/password") matches the official Neo4j image and the dev stack.
  if (env.NEO4J_AUTH_FILE && !out.NEO4J_PASSWORD) {
    const [user, ...rest] = fs.readFileSync(env.NEO4J_AUTH_FILE, 'utf8').trim().split('/');
    out.NEO4J_USERNAME ??= user;
    out.NEO4J_PASSWORD = rest.join('/');
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(withFileSecrets(env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const c = parsed.data;
  const publicUrl = new URL(c.PUBLIC_URL);
  const databases = c.NEO4J_DATABASES.length ? c.NEO4J_DATABASES : ['neo4j'];

  return {
    port: c.PORT,
    host: c.HOST,
    publicUrl,
    allowedOrigins: [publicUrl.origin, ...c.ADDITIONAL_ORIGINS.map((o) => new URL(o).origin)],
    secureCookies: publicUrl.protocol === 'https:',
    logLevel: c.LOG_LEVEL,
    staticDir: c.STATIC_DIR,
    trustProxy: c.TRUST_PROXY,
    neo4j: {
      uri: c.NEO4J_URI,
      username: c.NEO4J_USERNAME,
      password: c.NEO4J_PASSWORD,
      databases,
      defaultDatabase: databases[0]!,
      dashboardDatabase: c.DASHBOARD_DATABASE ?? databases[0]!,
    },
    query: {
      defaultTimeoutSeconds: c.QUERY_TIMEOUT_SECONDS_DEFAULT,
      maxTimeoutSeconds: c.QUERY_TIMEOUT_SECONDS_MAX,
      maxRowLimit: c.QUERY_ROW_LIMIT_MAX,
    },
    oidc: {
      issuer: c.OIDC_ISSUER_URL,
      discoveryUrl: c.OIDC_DISCOVERY_URL,
      clientId: c.OIDC_CLIENT_ID,
      clientSecret: c.OIDC_CLIENT_SECRET,
      scopes: c.OIDC_SCOPES,
      rolesClaim: c.OIDC_ROLES_CLAIM,
      usernameClaim: c.OIDC_USERNAME_CLAIM,
      allowInsecureHttp: c.OIDC_ALLOW_INSECURE_HTTP,
      roleViewer: c.ROLE_VIEWER,
      roleEditor: c.ROLE_EDITOR,
    },
    session: {
      secret: c.SESSION_SECRET,
      maxAgeSeconds: c.SESSION_MAX_AGE_SECONDS,
    },
    audit: {
      logParameters: c.AUDIT_LOG_PARAMETERS,
    },
    maps: {
      tileUrl: c.MAP_TILE_URL,
      tileAttribution: c.MAP_TILE_ATTRIBUTION,
      dataUrl: c.MAP_DATA_URL,
    },
    text2cypher: c.TEXT2CYPHER_BASE_URL
      ? {
          baseUrl: c.TEXT2CYPHER_BASE_URL,
          model: c.TEXT2CYPHER_MODEL!,
          apiKey: c.TEXT2CYPHER_API_KEY || undefined,
          timeoutSeconds: c.TEXT2CYPHER_TIMEOUT_SECONDS,
          maxAttempts: c.TEXT2CYPHER_MAX_ATTEMPTS,
          temperature: c.TEXT2CYPHER_TEMPERATURE,
          maxTokens: c.TEXT2CYPHER_MAX_TOKENS,
          schemaTtlSeconds: c.TEXT2CYPHER_SCHEMA_TTL_SECONDS,
        }
      : undefined,
  };
}

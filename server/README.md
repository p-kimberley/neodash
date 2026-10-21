# NeoDash server

The backend that sits between the NeoDash UI and Neo4j. Browsers never connect to Neo4j or see its
credentials; they sign in with OpenID Connect (e.g. Keycloak) and call this API.

- **Sign-in:** OIDC authorization code flow with PKCE. The session is an encrypted cookie
  (AES-256-GCM), so replicas need only a shared `SESSION_SECRET`. API clients can send an access
  token from the same identity provider as `Authorization: Bearer …`.
- **Roles:** taken from a token claim (default `realm_access.roles`). `neodash-editor` can do
  everything; `neodash-viewer` can open dashboards and run their saved queries; anyone else is
  turned away after sign-in.
- **Read-only viewers:** a viewer can only run a query that is saved in a dashboard, identified by
  dashboard and report id. The Cypher is read from the database, never from the request, and runs in
  a `READ` transaction, so Neo4j itself rejects writes.
- **Dashboards:** stored exactly as NeoDash 2.4 stores them (`_Neodash_Dashboard` nodes), so the
  legacy UI and this server can share a database.
- **Audit log:** one JSON line per sign-in, denial, dashboard access, save, delete and query, on
  stdout with `"audit": true`.

## API

| Method & path                | Who     | Purpose                                                       |
| ---------------------------- | ------- | ------------------------------------------------------------- |
| `GET /auth/login?returnTo=`  | anyone  | Start sign-in; returns to `returnTo` (relative paths only)     |
| `GET /auth/callback`         | –       | OIDC redirect target                                          |
| `POST /auth/logout`          | anyone  | End the session; returns `{logoutUrl}` for the identity provider |
| `GET /api/config`            | anyone  | Databases and query limits                                    |
| `GET /api/me`                | signed in | User, role and what they may do                            |
| `GET /api/dashboards`        | viewer  | List dashboards                                               |
| `GET /api/dashboards/:uuid`  | viewer  | Dashboard JSON (`content`) plus metadata                      |
| `PUT /api/dashboards/:uuid`  | editor  | Create or overwrite a dashboard                               |
| `DELETE /api/dashboards/:uuid` | editor | Delete a dashboard                                           |
| `POST /api/query`            | viewer / editor | Run a saved report query, or (editors) any Cypher     |
| `GET /healthz`, `GET /readyz`| anyone  | Liveness; readiness (checks Neo4j)                            |

### `POST /api/query`

Saved query (viewers and editors):

```json
{
  "dashboard": "5a1e5000-0000-4000-8000-000000000000",
  "report": { "id": "5a1e5000-0000-4000-8000-000000000005", "page": 0, "index": 4 },
  "parameters": { "neodash_region_name": "Europe" },
  "rowLimit": 1000,
  "timeoutSeconds": 20
}
```

`page` and `index` are only needed for dashboards saved before reports had ids.

Ad-hoc query (editors only); `context` is recorded in the audit log:

```json
{ "query": "MATCH (n:Person) RETURN n LIMIT 10", "parameters": {}, "context": { "dashboard": "…", "report": "…" } }
```

Response:

```json
{ "keys": ["Revenue"], "records": [[{ "$type": "Integer", "_value": "6559314" }]], "truncated": false, "durationMs": 7 }
```

Values use the typed JSON encoding in [`src/codec.ts`](src/codec.ts): strings, booleans, floats,
nulls and lists are plain JSON; everything else is `{"$type": …, "_value": …}` (Integer, Float for
NaN/Infinity, Map, Node, Relationship, Path, Point, Date, Time, LocalTime, DateTime, LocalDateTime,
Duration, Bytes). Parameters are sent in the same encoding. `decode()` rebuilds real neo4j-driver
objects, so existing chart code works unchanged.

Missing parameters that the query references are passed as `null`. Errors come back as
`{"error": {"code", "message", "neo4jCode"?}}` with status 401, 403, 404, 422 (Neo4j rejected the
query) or 503 (Neo4j unavailable).

Cookie-authenticated `POST`/`PUT`/`DELETE` requests must be `application/json` and, if they carry an
`Origin` header, come from `PUBLIC_URL`.

## Configuration

All settings are environment variables. Secrets can be given as files instead, by setting
`<NAME>_FILE` (`NEO4J_PASSWORD_FILE`, `OIDC_CLIENT_SECRET_FILE`, `SESSION_SECRET_FILE`), or
`NEO4J_AUTH_FILE` containing `user/password`.

| Variable | Default | |
| --- | --- | --- |
| `PUBLIC_URL` | required | URL users reach NeoDash on; used for redirects and cookie security |
| `NEO4J_URI` | `neo4j://localhost:7687` | |
| `NEO4J_USERNAME` / `NEO4J_PASSWORD` | `neo4j` / required | |
| `NEO4J_DATABASES` | `neo4j` | Comma-separated databases reports may query; first is the default |
| `DASHBOARD_DATABASE` | first database | Where `_Neodash_Dashboard` nodes live |
| `OIDC_ISSUER_URL` | required | Issuer as browsers and tokens see it |
| `OIDC_DISCOVERY_URL` | issuer | Where the server fetches metadata, if different (e.g. in-cluster URL) |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | required | Confidential client; redirect URI is `PUBLIC_URL/auth/callback` |
| `OIDC_SCOPES` | `openid profile email` | |
| `OIDC_ROLES_CLAIM` | `realm_access.roles` | Dot path to the roles array; use e.g. `resource_access.neodash.roles` for client roles |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | |
| `ROLE_VIEWER` / `ROLE_EDITOR` | `neodash-viewer` / `neodash-editor` | |
| `OIDC_ALLOW_INSECURE_HTTP` | `false` | Only for a local `http://` identity provider |
| `SESSION_SECRET` | required | ≥ 32 characters; rotating it signs everyone out |
| `SESSION_MAX_AGE_SECONDS` | `28800` (8 h) | Roles are re-read at the next sign-in |
| `QUERY_TIMEOUT_SECONDS_DEFAULT` / `_MAX` | `20` / `120` | |
| `QUERY_ROW_LIMIT_MAX` | `10000` | Rows beyond this are not fetched; the response says `truncated` |
| `AUDIT_LOG_PARAMETERS` | `true` | Include parameter values in audit lines |
| `TRUST_PROXY` | `false` | Set behind an ingress so audit logs record the client IP |
| `STATIC_DIR` | – | Built frontend to serve, with client-side routing fallback |
| `PORT` / `HOST` / `LOG_LEVEL` | `3000` / `0.0.0.0` / `info` | |

## Development

```sh
npm install
npm test                  # unit tests
npm run test:integration  # API against the dev stack's Neo4j
npm run test:e2e          # real sign-in through Keycloak, against the backend in the dev stack
```

Start the dev stack first for the last two: `docker compose -f dev/compose.yaml up -d --build`
(see [`dev/README.md`](../dev/README.md)).

To run the server outside Docker against the dev stack, set `PUBLIC_URL=http://localhost:3000`,
`NEO4J_PASSWORD=devpassword`, `OIDC_ISSUER_URL=http://localhost:8080/realms/neodash`,
`OIDC_CLIENT_ID=neodash`, `OIDC_CLIENT_SECRET=neodash-dev-secret`, `OIDC_ALLOW_INSECURE_HTTP=true`
and a `SESSION_SECRET`, then `npm run dev`.

## Not yet covered

- Graph exploration ("expand node") and graph editing for viewers: these build Cypher in the
  browser, so for now they need the editor role.
- The forms extension writes data, so it needs the editor role.
- Roles are fixed for the life of a session (default 8 hours).

Note for dashboard authors: viewers can only change *parameter values*, never the Cypher. But a saved
query that executes a parameter as Cypher (e.g. `CALL apoc.cypher.run($q, {})`) would let viewers run
any read-only query, so don't write those.

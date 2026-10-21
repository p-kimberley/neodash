## NeoDash

NeoDash is a dashboard builder for Neo4j: tables, graphs, charts, maps and parameter selectors,
driven by Cypher and saved in your database.

This is a maintained fork of [NeoDash 2.4](https://github.com/neo4j-contrib/neodash) (no longer
maintained upstream). It adds what's needed to run NeoDash as a shared service on Kubernetes:

- **A backend** that serves the UI and runs every query, so browsers never connect to Neo4j or see
  its credentials.
- **OIDC sign-in** (e.g. Keycloak) with **viewer** and **editor** roles in one deployment. Viewers
  can only run the queries saved in dashboards, read-only.
- **Many dashboards** with a start page, a switcher, and **URLs** for every dashboard, page and filter.
- **Audit logs** of sign-ins, dashboard access and every query.
- **A Helm chart** for ingress-nginx or the Gateway API, with Secrets for all credentials, plus a
  distroless non-root image that runs **air-gapped**.
- **A refreshed UI** with light and dark appearances.

Existing dashboards keep working unchanged.

| | |
| --- | --- |
| Deploy it | [`docs/deployment.md`](docs/deployment.md) |
| Helm chart reference | [`k8s-deploy/neodash/README.md`](k8s-deploy/neodash/README.md) |
| Backend settings and API | [`server/README.md`](server/README.md) |
| Run it locally, with sample data | [`dev/README.md`](dev/README.md) |
| Using NeoDash (reports, parameters, styling) | [`docs/modules/ROOT/pages/user-guide`](docs/modules/ROOT/pages/user-guide) |

Quick start: `docker compose -f dev/compose.yaml up -d --build`, then open http://localhost:3000 and
sign in as `editor` / `password`.

# NeoDash Helm chart

Deploys NeoDash as one stateless Deployment: a single container serves the UI, handles OIDC
sign-in and runs all Neo4j queries. Browsers never connect to Neo4j and never see its credentials.

This is the chart reference. For the full guide (Keycloak set-up, air-gapped installs, security,
audit logs, CI/CD and migrating from upstream NeoDash), see
[`docs/deployment.md`](../../docs/deployment.md).

- **Ingress or Gateway API**: one host, one path (`/`), with TLS; ingress-nginx by default, any
  other Ingress controller, or an HTTPRoute on a Gateway.
- **Secrets, not values**: the Neo4j password and OIDC client secret come from existing Secrets,
  mounted as files. A session key is generated on install unless you supply one.
- **Roles**: users need the viewer or editor role from your identity provider (e.g. Keycloak).
  Viewers can only run the queries saved in dashboards, read-only; editors can edit and save.
- **Hardened pod**: distroless image, non-root (UID 65532), read-only root filesystem, no
  capabilities, no service-account token, RuntimeDefault seccomp.
- **Offline-ready**: the image makes no outbound internet requests and the chart uses no other
  images (the `helm test` pod reuses the NeoDash image). See [Air-gapped installs](#air-gapped-installs).

## Prerequisites

- Kubernetes 1.25+, Helm 3.
- A Neo4j 5 server reachable from the cluster (Community or Enterprise).
- An OIDC provider. For Keycloak, in your realm:
  1. Create a **confidential** OpenID Connect client, e.g. `neodash`, with standard flow enabled.
     - Valid redirect URI: `https://neodash.example.com/auth/callback`
     - Valid post-logout redirect URI: `https://neodash.example.com/*`
     - Web origin: `https://neodash.example.com`
  2. Create realm roles `neodash-viewer` and `neodash-editor` and assign them to users or groups.
     Realm roles appear in the `realm_access.roles` claim by default. To use client roles instead,
     set `oidc.rolesClaim: resource_access.neodash.roles`.
  3. Copy the client secret from the client's *Credentials* tab.

## Install

```sh
kubectl create namespace neodash

kubectl -n neodash create secret generic neo4j-credentials \
  --from-literal=username=neo4j --from-literal=password='<neo4j password>'

kubectl -n neodash create secret generic neodash-oidc \
  --from-literal=client-secret='<client secret>'

# TLS certificate for the ingress (or let cert-manager create neodash-tls)
kubectl -n neodash create secret tls neodash-tls --cert=tls.crt --key=tls.key
```

`my-values.yaml`:

```yaml
image:
  repository: <owner>/neodash # ghcr.io/<owner>/neodash; set image.registry for another registry
publicUrl: https://neodash.example.com
neo4j:
  uri: neo4j://neo4j.neo4j.svc.cluster.local:7687
  auth:
    existingSecret: neo4j-credentials
oidc:
  issuerUrl: https://keycloak.example.com/realms/acme
  existingSecret: neodash-oidc
ingress:
  host: neodash.example.com
  tls:
    secretName: neodash-tls
```

Install the published chart (released versions, and `<version>-dev.<n>` builds of `master`):

```sh
helm install neodash oci://ghcr.io/<owner>/charts/neodash --version <chart version> \
  -n neodash -f my-values.yaml
helm test neodash -n neodash
```

Or install from a checkout with `helm install neodash k8s-deploy/neodash -n neodash -f my-values.yaml`.
The chart stops with a clear message if a required value is missing.

Published charts default to the image built from the same commit (`appVersion`). Pin by digest in
production with `image.digest`.

**GitOps** (Argo CD, or anything else that renders the chart without cluster access): create the
session key yourself and set `session.existingSecret`. Otherwise every render generates a new key,
which signs everyone out.

## Common settings

| Value | Default | |
| --- | --- | --- |
| `publicUrl` | required | URL users open; `https://<ingress.host>` |
| `image.registry` / `image.repository` / `image.tag` / `image.digest` | `ghcr.io` / required / appVersion / – | `digest` wins over `tag` |
| `global.imageRegistry` | – | Overrides `image.registry` (air-gapped mirrors) |
| `imagePullSecrets` | `[]` | e.g. for a private GHCR package |
| `replicaCount` | `2` | Pods are stateless; scale freely |
| `neo4j.uri` | in-cluster `neo4j` service | `neo4j+s://` for TLS |
| `neo4j.databases` | `[neo4j]` | Databases reports may query; first is the default |
| `neo4j.dashboardDatabase` | first database | Where `_Neodash_Dashboard` nodes live |
| `neo4j.auth.existingSecret` | required | Keys `username`, `password` (configurable) |
| `oidc.issuerUrl` | required | Issuer as browsers see it |
| `oidc.discoveryUrl` | – | In-cluster URL for the pods to fetch the issuer's metadata |
| `oidc.existingSecret` | required | Key `client-secret` (configurable) |
| `oidc.rolesClaim` | `realm_access.roles` | Dot path to the roles claim |
| `oidc.roles.viewer` / `.editor` | `neodash-viewer` / `neodash-editor` | |
| `oidc.caBundle.existingSecret` / `.existingConfigMap` | – | PEM CA bundle to trust, e.g. an internal CA (also used for `neo4j+s://`) |
| `session.existingSecret` | generated | Cookie-encryption key; shared by all replicas |
| `session.maxAgeSeconds` | `28800` | Users sign in again after this; role changes apply then |
| `query.timeoutSecondsMax` / `query.rowLimitMax` | `120` / `10000` | Server-side limits for every query |
| `audit.logParameters` | `true` | Include query parameter values in audit logs |
| `maps.tileUrl` | – | Map tile server, e.g. `https://tiles.internal/{z}/{x}/{y}.png`; empty = no tiles |
| `maps.dataUrl` | `/maps` | Where choropleth/area-map country shapes load from; bundled in the image |
| `text2cypher.baseUrl` / `model` | – | Text2Cypher through an OpenAI-compatible API, e.g. vLLM `http://vllm.ai.svc:8000/v1`, and the model it serves; empty = off |
| `text2cypher.apiKey.existingSecret` / `key` | – / `api-key` | Optional API key from a Secret, sent as a bearer token |
| `text2cypher.timeoutSeconds` / `maxAttempts` / `temperature` | `60` / `2` / `0` | |
| `branding.appName` | `NeoDash` | Product name in the header and browser tab |
| `branding.logo.base64` / `fileName` | – / `logo.png` | Header logo (base64 PNG/SVG, e.g. `--set-file branding.logo.base64=logo.b64`), served from the pod |
| `branding.style` | `{}` | Extra `style.config.json` entries, e.g. `--theme-light-color-primary-bg-strong: '#005eb8'` and the `--theme-dark-color-…` equivalent for the primary colour (the earlier `--palette-…` names still work) |
| `ingress.enabled` / `className` / `host` | `true` / `nginx` / required | |
| `ingress.tls.enabled` / `secretName` | `true` / required | |
| `ingress.annotations` | see below | ingress-nginx annotations; adjust for other controllers |
| `httpRoute.enabled` / `parentRefs` | `false` / required | Gateway API HTTPRoute instead of the Ingress |
| `httpRoute.hostnames` / `timeouts` | host of `publicUrl` / – | |
| `autoscaling.enabled` | `false` | CPU-based HPA |
| `podDisruptionBudget.enabled` | `true` | Applied when more than one replica |
| `networkPolicy.enabled` | `false` | Ingress from `ingressFrom` (and the test pod); egress to DNS + `egressTo` |
| `extraEnv` | `[]` | Any other backend setting (see `server/README.md`) |

## Ingress and Gateway API

The default Ingress targets ingress-nginx with three annotations. Keep their equivalents if you
use another controller:

| Annotation | Default | Why |
| --- | --- | --- |
| `nginx.ingress.kubernetes.io/proxy-body-size` | `20m` | Dashboards are saved as one JSON document |
| `nginx.ingress.kubernetes.io/proxy-read-timeout` | `150` | Queries may run up to `query.timeoutSecondsMax` |
| `nginx.ingress.kubernetes.io/proxy-buffer-size` | `16k` | The sign-in response's session cookie (up to ~4 KB) overflows nginx's default buffer, causing a 502 after sign-in |

The ingress-nginx project was retired in March 2026. To use the Gateway API instead, attach an
HTTPRoute to an existing Gateway (the Gateway terminates TLS):

```yaml
ingress:
  enabled: false
httpRoute:
  enabled: true
  parentRefs:
    - name: shared-gateway
      namespace: gateway-system
      sectionName: https
  timeouts:
    request: 150s
```

## Audit logs

Each sign-in, access decision, dashboard view/save/delete and query is logged as one JSON line on
stdout with `"audit": true`, including the user, role, dashboard, report and (optionally)
parameter values. Ship pod logs with your usual collector and filter on that field.

## Air-gapped installs

Nothing in the running system needs internet access:

- The image contains the UI, fonts and backend; it makes no outbound requests.
- Sign-in uses your identity provider; set `oidc.discoveryUrl` if pods reach it on an internal URL,
  and `oidc.caBundle` if its certificate is signed by an internal CA.
- Map charts use `maps.tileUrl` (an internal tile server, or none) and `maps.dataUrl`.
- Text2Cypher calls only the model you configure (`text2cypher.baseUrl`, e.g. a vLLM service in the
  cluster), from the backend; it is off by default.

To install without internet access, copy the image (`ghcr.io/<owner>/neodash:<version>`) and this
chart into registries the cluster can reach, then install with
`--set global.imageRegistry=<registry>`. See [docs/deployment.md](../../docs/deployment.md#air-gapped-clusters).

## Upgrading from chart 1.x

Chart 1.x deployed the browser-only NeoDash (nginx) with optional viewer-mode credentials in
`env` / `envFromSecrets`. 2.x replaces all of that:

- `enable_reader_mode`, `env`, `envFromSecrets` → roles from your identity provider, plus
  `neo4j.auth.existingSecret` and `oidc.*`.
- `service.type: LoadBalancer` on port 5005 → `ClusterIP` behind the Ingress or HTTPRoute
  (container port 3000).
- Separate viewer and editor releases → one release; each user's role decides what they can do.

Dashboards stored in Neo4j are unchanged and keep working. See
[Migrating](../../docs/deployment.md#migrating-from-upstream-neodash-or-chart-1x) for a step-by-step
plan.

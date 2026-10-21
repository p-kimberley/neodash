# Browser regression suite

Playwright tests that drive the real UI against the [dev stack](../README.md): Keycloak sign-in,
the seed dashboards and every report type, in light and dark mode.

They run in the Playwright Docker image, so nothing needs installing on the host beyond Docker.

## Running

Start the dev stack (`docker compose -f dev/compose.yaml up -d`) and, to test uncommitted UI
changes, the webpack dev server (`yarn dev`). Then:

```sh
dev/e2e/run.sh                                   # against the dev server, http://localhost:5173
APP_URL=http://localhost:3000 dev/e2e/run.sh     # against the backend container (production build)
dev/e2e/run.sh --project=dark tests/maximise.spec.mjs   # extra arguments go to `playwright test`
```

A full run takes about six minutes. Results are in `dev/e2e/report/` (open `index.html`), with a
screenshot of every dashboard page attached to the dashboard tests and a trace for each failure.

## What is covered

| Spec                    | Checks                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboards.spec.mjs`   | Every page of the Sales, Supply Chain and Kitchen Sink dashboards: each report draws something and shows no error; dashboard selector, URL and back navigation; dashboards panel; viewer role (no Save, no Examples).                         |
| `maximise.spec.mjs`     | Every report type maximised: even 16px margins, nothing scrolls behind it, the report fills the window; settings open while maximised.                                                                                                        |
| `interactions.spec.mjs` | Bar click actions set parameters; style-rule row colours on hover; graph search, node popup and remembered 2D/3D mode; map pins, popups and legend; hierarchy drill-down; date and select parameters; markdown descriptions; Help > Examples. |

Every test also fails on uncaught page errors and on the dev server's error overlay.

Tests that need a modified dashboard save a temporary copy under a fixed `dddd0000-…` id and
delete it afterwards. The suite signs in once per role (`editor`, `viewer`; see
[the test users](../README.md)) and keeps the sessions in `.auth/`.

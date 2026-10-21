#!/bin/sh
# Runs the browser regression suite in the Playwright Docker image against the dev stack.
#   dev/e2e/run.sh                       # against the webpack dev server (http://localhost:5173)
#   APP_URL=http://localhost:3000 dev/e2e/run.sh   # against the backend container
#   dev/e2e/run.sh --project=dark tests/maximise.spec.mjs   # extra arguments go to playwright test
set -e
cd "$(dirname "$0")"
# Git Bash on Windows would otherwise rewrite the container paths below.
export MSYS_NO_PATHCONV=1
exec docker run --rm --ipc=host \
  -e APP_URL="${APP_URL:-http://localhost:5173}" \
  -e E2E_FORWARD_HOST=host.docker.internal \
  --add-host=host.docker.internal:host-gateway \
  -v "$(pwd):/e2e" \
  -v neodash-e2e-node-modules:/e2e/node_modules \
  -w /e2e \
  mcr.microsoft.com/playwright:v1.48.2-jammy \
  sh -c 'npm ci --no-audit --no-fund --loglevel=error && npx playwright test "$@"' -- "$@"

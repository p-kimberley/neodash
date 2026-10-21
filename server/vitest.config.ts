import { defineConfig } from 'vitest/config';

// `--mode integration` / `--mode e2e` switch on the suites that need the dev stack running,
// without relying on shell-specific environment variable syntax.
export default defineConfig(({ mode }) => ({
  test: {
    env: {
      ...(mode === 'integration' ? { INTEGRATION: '1' } : {}),
      ...(mode === 'e2e' ? { E2E: '1' } : {}),
    },
  },
}));

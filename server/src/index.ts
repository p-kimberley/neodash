import { buildApp } from './app.js';
import { OidcClient } from './auth/oidc.js';
import { loadConfig } from './config.js';
import { createDriver } from './neo4j.js';

const config = loadConfig();
const driver = createDriver(config);
const oidc = new OidcClient(config.oidc, new URL('/auth/callback', config.publicUrl).href);
const app = await buildApp({ config, driver, oidc });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await driver.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(
  { publicUrl: config.publicUrl.href, neo4j: config.neo4j.uri, databases: config.neo4j.databases, issuer: config.oidc.issuer },
  'NeoDash server ready'
);

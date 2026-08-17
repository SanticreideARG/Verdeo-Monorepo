import { serve } from '@hono/node-server';

import { parseServerEnv } from '@verdeo/config';
import { createLogger } from '@verdeo/observability';

import { createApp } from './app.js';

const env = parseServerEnv(process.env);
const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
  service: 'verdeo-api',
});
const port = Number(process.env.PORT ?? 3000);
const app = createApp({ appOrigin: env.APP_URL, logger, version: '0.1.0' });

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ event: 'server.started', port: info.port });
});

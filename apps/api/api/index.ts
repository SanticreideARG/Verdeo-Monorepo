import { parseServerEnv } from '@verdeo/config';
import { createLogger } from '@verdeo/observability';

import { createApp } from '../src/app.js';

const env = parseServerEnv(process.env);
const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: false,
  service: 'verdeo-api',
});

const app = createApp({
  appOrigin: env.APP_URL,
  logger,
  version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? '0.1.0',
});

export default app;

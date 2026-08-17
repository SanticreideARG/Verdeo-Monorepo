import { serve } from '@hono/node-server';

import { createApiRuntime } from './runtime.js';

const runtime = createApiRuntime({
  prettyLogs: process.env.NODE_ENV === 'development',
  version: '0.1.0',
});
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: runtime.app.fetch, port }, (info) => {
  runtime.logger.info({ event: 'server.started', port: info.port });
});

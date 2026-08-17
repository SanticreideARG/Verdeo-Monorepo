import { createApiRuntime } from '../src/runtime.js';

const runtime = createApiRuntime({
  prettyLogs: false,
  version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? '0.1.0',
});

export default runtime.app;

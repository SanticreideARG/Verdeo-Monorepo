import { createMiddleware } from 'hono/factory';

import type { AuthenticatedSession } from '@verdeo/auth';

interface AuthorizationVariables {
  requestId: string;
  session: AuthenticatedSession;
}

export function requirePermission(permission: string) {
  return createMiddleware<{ Variables: AuthorizationVariables }>(async (context, next) => {
    if (!context.get('session').permissions.includes(permission)) {
      return context.json(
        {
          error: {
            code: 'FORBIDDEN' as const,
            message: 'No tenés permiso para realizar esta acción.',
            requestId: context.get('requestId'),
          },
        },
        403,
      );
    }

    await next();
  });
}

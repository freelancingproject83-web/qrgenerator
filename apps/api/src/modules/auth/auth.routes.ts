import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { AuthController } from './auth.controller.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  controller: AuthController,
  verifyTrustedOrigin: preHandlerHookHandler,
) {
  app.post(
    '/register',
    {
      preHandler: verifyTrustedOrigin,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    controller.register,
  );
  app.post(
    '/login',
    {
      preHandler: verifyTrustedOrigin,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    controller.login,
  );
  app.post(
    '/refresh',
    {
      preHandler: verifyTrustedOrigin,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    controller.refresh,
  );
  app.post(
    '/logout',
    {
      preHandler: verifyTrustedOrigin,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    controller.logout,
  );
}

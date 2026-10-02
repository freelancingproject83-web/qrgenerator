import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { TenantController } from '../controllers/tenant.controller.js';

export function registerTenantRoutes(
  app: FastifyInstance,
  controller: TenantController,
  authenticate: preHandlerHookHandler,
) {
  app.get(
    '/tenants',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    controller.list,
  );
  app.post('/admin/tenants', { preHandler: authenticate }, controller.create);
}

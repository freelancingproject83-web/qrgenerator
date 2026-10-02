import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { BatchController } from '../controllers/batch.controller.js';

export function registerBatchRoutes(
  app: FastifyInstance,
  controller: BatchController,
  authenticate: preHandlerHookHandler,
) {
  app.get('/batches', { preHandler: authenticate }, controller.list);
  app.get(
    '/batches/:batchNumber',
    { preHandler: authenticate },
    controller.get,
  );
  app.post(
    '/batches',
    { preHandler: authenticate, bodyLimit: 32768 },
    controller.create,
  );
}

import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { CodeController } from './code.controller.js';

export function registerCodeRoutes(
  app: FastifyInstance,
  controller: CodeController,
  authenticate: preHandlerHookHandler,
) {
  app.addHook('onRequest', async (_request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer');
  });
  const options = (max: number) => ({
    preHandler: authenticate,
    bodyLimit: 4096,
    config: { rateLimit: { max, timeWindow: '1 minute' } },
  });
  app.post('/code-jobs/preview', options(20), controller.preview);
  app.post('/code-jobs', options(5), controller.create);
  app.get('/code-jobs/:id', options(60), controller.job);
  app.get('/codes/:id', options(60), controller.unit);
  app.get('/codes/:id/artwork.svg', options(60), controller.download('svg'));
  app.get('/codes/:id/artwork.pdf', options(60), controller.download('pdf'));
  app.post('/codes/:id/revoke', options(20), controller.revoke);
  app.get(
    '/public/codes/:token',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    controller.publicLookup,
  );
}

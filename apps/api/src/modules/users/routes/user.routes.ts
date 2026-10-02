import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { UserController } from '../controllers/user.controller.js';

export function registerUserRoutes(
  app: FastifyInstance,
  controller: UserController,
  authenticate: preHandlerHookHandler,
) {
  app.get('/users/me', { preHandler: authenticate }, controller.me);
  app.get('/admin/users', { preHandler: authenticate }, controller.list);
  app.patch(
    '/admin/users/:userId/role',
    { preHandler: authenticate },
    controller.promote,
  );
}

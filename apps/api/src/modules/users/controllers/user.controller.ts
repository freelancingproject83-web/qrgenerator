import {
  updateUserRoleInputSchema,
  userIdParamsSchema,
} from '@qrgenerator/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserService } from '../services/user.service.js';

export class UserController {
  constructor(private readonly userService: UserService) {}

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await this.userService.getCurrentUser(request.user.sub);
    return reply.send({ user });
  };

  list = async (request: FastifyRequest) =>
    this.userService.listUsers(request.user.sub);

  promote = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const { role } = updateUserRoleInputSchema.parse(request.body);
    const user = await this.userService.promoteUser(
      request.user.sub,
      userId,
      role,
    );
    return reply.send({ user });
  };
}

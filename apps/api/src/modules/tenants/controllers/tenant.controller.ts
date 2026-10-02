import { createTenantInputSchema } from '@qrgenerator/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TenantService } from '../services/tenant.service.js';

export class TenantController {
  constructor(private readonly service: TenantService) {}

  list = async () => this.service.list();

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = createTenantInputSchema.parse(request.body);
    return reply
      .code(201)
      .send(await this.service.create(request.user.sub, name));
  };
}

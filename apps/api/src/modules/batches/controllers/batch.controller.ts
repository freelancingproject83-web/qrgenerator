import {
  batchNumberParamsSchema,
  createBatchInputSchema,
} from '@qrgenerator/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BatchService } from '../services/batch.service.js';

export class BatchController {
  constructor(private readonly service: BatchService) {}
  list = async (request: FastifyRequest) => this.service.list(request.user.sub);
  get = async (request: FastifyRequest) =>
    this.service.get(
      request.user.sub,
      batchNumberParamsSchema.parse(request.params).batchNumber,
    );
  create = async (request: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(201)
      .send(
        await this.service.create(
          request.user.sub,
          createBatchInputSchema.parse(request.body),
        ),
      );
}

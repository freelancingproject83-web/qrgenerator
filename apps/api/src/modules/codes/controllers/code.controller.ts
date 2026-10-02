import {
  codeIdParamsSchema,
  codePreviewInputSchema,
  createCodeJobSchema,
  idempotencyKeySchema,
  publicCodeParamsSchema,
  revokeCodeSchema,
} from '@qrgenerator/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CodeService } from '../services/code.service.js';

export class CodeController {
  constructor(private readonly service: CodeService) {}
  preview = async (request: FastifyRequest) => {
    const { batchNumber, print } = codePreviewInputSchema.parse(request.body);
    return this.service.preview(request.user.sub, batchNumber, print);
  };
  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.create(
      request.user.sub,
      idempotencyKeySchema.parse(request.headers['idempotency-key']),
      createCodeJobSchema.parse(request.body),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  };
  job = async (request: FastifyRequest) =>
    this.service.job(
      request.user.sub,
      codeIdParamsSchema.parse(request.params).id,
    );
  unit = async (request: FastifyRequest) => ({
    code: await this.service.unit(
      request.user.sub,
      codeIdParamsSchema.parse(request.params).id,
    ),
  });
  revoke = async (request: FastifyRequest) => ({
    code: await this.service.revoke(
      request.user.sub,
      codeIdParamsSchema.parse(request.params).id,
      revokeCodeSchema.parse(request.body).reason,
    ),
  });
  publicLookup = async (request: FastifyRequest) =>
    this.service.publicLookup(
      publicCodeParamsSchema.parse(request.params).token,
    );
  download =
    (format: 'svg' | 'pdf') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = codeIdParamsSchema.parse(request.params);
      const data = await this.service.artwork(request.user.sub, id, format);
      return reply
        .header(
          'Content-Disposition',
          `attachment; filename="unit-${id}.${format}"`,
        )
        .type(format === 'svg' ? 'image/svg+xml' : 'application/pdf')
        .send(data);
    };
}

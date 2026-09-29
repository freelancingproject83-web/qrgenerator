import { ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { CodeError } from '../modules/codes/code.error.js';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error instanceof CodeError && error.details ? { details: error.details } : {}) },
      });
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 401
    ) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid access token' },
      });
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code =
        error.statusCode === 429 ? 'TOO_MANY_REQUESTS' : 'REQUEST_ERROR';
      return reply.code(error.statusCode).send({
        error: { code, message: 'Request could not be processed' },
      });
    }

    app.log.error({ error }, 'Unhandled request error');
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' },
    });
  });
}

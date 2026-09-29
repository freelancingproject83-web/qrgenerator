import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors/app-error.js';

export async function authenticate(request: FastifyRequest) {
  await request.jwtVerify();
  if (request.user.tokenType !== 'access') throw new UnauthorizedError();
}

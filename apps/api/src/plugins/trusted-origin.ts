import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../errors/app-error.js';

export function trustedOrigin(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);

  return async function verifyTrustedOrigin(request: FastifyRequest) {
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin)) {
      throw new ForbiddenError('Untrusted request origin');
    }
  };
}

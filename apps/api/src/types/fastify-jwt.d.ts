import type { UserRole } from '@qrgenerator/contracts';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      role: UserRole;
      tokenType: 'access';
    };
    user: {
      sub: string;
      role: UserRole;
      tokenType: 'access';
    };
  }
}

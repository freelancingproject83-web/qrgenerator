import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { healthResponseSchema } from '@qrgenerator/contracts';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { AuthController } from './modules/auth/controllers/auth.controller.js';
import { registerAuthRoutes } from './modules/auth/routes/auth.routes.js';
import { CodeController } from './modules/codes/controllers/code.controller.js';
import {
  DrizzleCodeRepository,
  type CodeRepository,
} from './modules/codes/repositories/code.repository.js';
import { CodeService } from './modules/codes/services/code.service.js';
import { registerCodeRoutes } from './modules/codes/routes/code.routes.js';
import { AuthService } from './modules/auth/services/auth.service.js';
import { UserController } from './modules/users/controllers/user.controller.js';
import { DrizzleUserRepository } from './modules/users/repositories/user.repository.js';
import { registerUserRoutes } from './modules/users/routes/user.routes.js';
import { UserService } from './modules/users/services/user.service.js';
import { authenticate } from './plugins/authenticate.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { trustedOrigin } from './plugins/trusted-origin.js';
import {
  passwordHasher as defaultPasswordHasher,
  type PasswordHasher,
} from './utils/password.js';
import type { UserRepository } from './modules/users/repositories/user.repository.js';

interface AppOverrides {
  codeRepository?: CodeRepository;
  userRepository?: UserRepository;
  passwordHasher?: PasswordHasher;
}

export async function buildApp(
  config: AppConfig,
  overrides: AppOverrides = {},
) {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
    trustProxy: config.NODE_ENV === 'production',
  });
  const { pool, db } = createDatabase(
    config.DATABASE_URL,
    config.DATABASE_POOL_MAX,
  );

  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(jwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: {
      iss: config.JWT_ISSUER,
      aud: config.JWT_AUDIENCE,
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    },
    verify: {
      allowedIss: config.JWT_ISSUER,
      allowedAud: config.JWT_AUDIENCE,
    },
  });

  registerErrorHandler(app);

  const userRepository =
    overrides.userRepository ?? new DrizzleUserRepository(db);
  const authService = new AuthService(
    userRepository,
    overrides.passwordHasher ?? defaultPasswordHasher,
    {
      sign: ({ id, role }) =>
        app.jwt.sign({ role, tokenType: 'access' }, { sub: id }),
    },
    config.ACCESS_TOKEN_TTL_SECONDS,
    config.REFRESH_TOKEN_TTL_DAYS,
  );
  const authController = new AuthController(authService, config);
  const userController = new UserController(new UserService(userRepository));
  const verifyTrustedOrigin = trustedOrigin(config.CORS_ORIGINS);
  const codeController = new CodeController(
    new CodeService(
      overrides.codeRepository ?? new DrizzleCodeRepository(db),
      userRepository,
      config.PUBLIC_SCAN_ORIGIN,
    ),
  );
  await app.register(
    async (codeApp) =>
      registerCodeRoutes(codeApp, codeController, authenticate),
    { prefix: '/api/v1' },
  );

  await app.register(
    async (authApp) =>
      registerAuthRoutes(authApp, authController, verifyTrustedOrigin),
    { prefix: '/api/v1/auth' },
  );
  await app.register(
    async (userApp) =>
      registerUserRoutes(userApp, userController, authenticate),
    { prefix: '/api/v1' },
  );

  app.get('/health', async () => healthResponseSchema.parse({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok' as const };
    } catch (error) {
      app.log.error({ error }, 'Database readiness check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}

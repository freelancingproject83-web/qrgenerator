import { z } from 'zod';

const developmentJwtSecret = 'development-only-secret-change-me-now';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url().startsWith('postgres'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    PUBLIC_SCAN_ORIGIN: z
      .url()
      .max(80)
      .default('http://127.0.0.1:5173')
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === '/'
        );
      }, 'Use a bare HTTP(S) origin without credentials, path, query or fragment'),
    CORS_ORIGINS: z
      .string()
      .default('http://127.0.0.1:5173,http://127.0.0.1:5174')
      .transform((value) => value.split(',').map((origin) => origin.trim())),
    JWT_ACCESS_SECRET: z.string().min(32).default(developmentJwtSecret),
    JWT_ISSUER: z.string().min(1).default('qrgenerator-api'),
    JWT_AUDIENCE: z.string().min(1).default('qrgenerator-apps'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    REFRESH_COOKIE_NAME: z.string().min(1).default('qrgenerator_refresh'),
  })
  .superRefine((env, context) => {
    if (
      env.NODE_ENV === 'production' &&
      !env.PUBLIC_SCAN_ORIGIN.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_SCAN_ORIGIN'],
        message: 'Production scan links require HTTPS',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.JWT_ACCESS_SECRET === developmentJwtSecret
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'A production JWT secret must be configured',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}

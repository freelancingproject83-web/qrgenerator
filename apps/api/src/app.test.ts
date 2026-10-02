import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import type { PasswordHasher } from './utils/password.js';
import type {
  UserRepository,
  UserWithTenant,
} from './modules/users/repositories/user.repository.js';
import { buildApp } from './app.js';
import type { TenantRepository } from './modules/tenants/repositories/tenant.repository.js';

let app: FastifyInstance | undefined;

const testConfig = {
  NODE_ENV: 'test' as const,
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: 'postgres://localhost:5432/test',
  DATABASE_POOL_MAX: 1,
  PUBLIC_SCAN_ORIGIN: 'https://q.example',
  CORS_ORIGINS: ['http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
  JWT_ISSUER: 'qrgenerator-api',
  JWT_AUDIENCE: 'qrgenerator-apps',
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
  REFRESH_COOKIE_NAME: 'qrgenerator_refresh',
};

function testRepository(createdUser: UserWithTenant): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    list: vi.fn(),
    createUser: vi.fn().mockResolvedValue(createdUser),
    updateRole: vi.fn(),
    createRefreshSession: vi.fn(),
    findRefreshSession: vi.fn(),
    rotateRefreshSession: vi.fn(),
    revokeRefreshSession: vi.fn(),
    revokeAllRefreshSessions: vi.fn(),
  };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('API health', () => {
  it('responds without requiring a database connection', async () => {
    app = await buildApp(testConfig);

    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports unavailable when the database cannot be reached', async () => {
    app = await buildApp({
      ...testConfig,
      DATABASE_URL: 'postgres://localhost:1/test',
    });

    const response = await app.inject('/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('protects authenticated user routes', async () => {
    app = await buildApp(testConfig);

    const response = await app.inject('/api/v1/users/me');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid access token' },
    });
  });

  it('allows the admin frontend to preflight role changes', async () => {
    app = await buildApp(testConfig);

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/users/ccd271f0-022e-4f86-9936-2e084c94b4b7/role',
      headers: {
        origin: 'http://127.0.0.1:5174',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5174',
    );
  });

  it('registers a tenant user and keeps the refresh token out of JSON', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const tenantId = '9d2953d8-f03a-4aba-93f8-bf87338b0257';
    const createdUser: UserWithTenant = {
      id: '7ccafba9-27de-43bf-a5d2-1b1333338c57',
      email: 'person@example.com',
      passwordHash: 'stored-hash',
      role: 'tenant_user',
      tenantId,
      tenantName: 'Example Pharma',
      createdAt,
      updatedAt: createdAt,
    };
    const repository = testRepository(createdUser);
    const passwords: PasswordHasher = {
      hash: vi.fn().mockResolvedValue('stored-hash'),
      verify: vi.fn(),
    };
    app = await buildApp(testConfig, {
      userRepository: repository,
      passwordHasher: passwords,
      tenantRepository: {
        list: vi.fn(),
        findById: vi.fn().mockResolvedValue({
          id: tenantId,
          name: 'Example Pharma',
          createdAt,
        }),
        create: vi.fn(),
      } satisfies TenantRepository,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: ' Person@Example.com ',
        password: 'correct-password',
        tenantId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      expiresIn: 900,
      user: { email: 'person@example.com', role: 'tenant_user' },
    });
    expect(response.json()).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('Path=/api/v1/auth');
  });

  it('rejects cookie-authentication requests from an untrusted browser origin', async () => {
    app = await buildApp(testConfig);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'Untrusted request origin' },
    });
  });
});

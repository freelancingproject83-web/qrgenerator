import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../../../errors/app-error.js';
import type { PasswordHasher } from '../../../utils/password.js';
import { hashRefreshToken } from '../../../utils/tokens.js';
import type {
  UserRepository,
  UserWithTenant,
} from '../../users/repositories/user.repository.js';
import { AuthService } from './auth.service.js';
import type { TenantRepository } from '../../tenants/repositories/tenant.repository.js';

const now = new Date('2026-01-01T00:00:00.000Z');
const tenantId = '9d2953d8-f03a-4aba-93f8-bf87338b0257';
const user: UserWithTenant = {
  id: '7ccafba9-27de-43bf-a5d2-1b1333338c57',
  email: 'person@example.com',
  passwordHash: 'stored-password-hash',
  role: 'tenant_user',
  tenantId,
  tenantName: 'Example Pharma',
  createdAt: now,
  updatedAt: now,
};

function createRepository(): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    createUser: vi.fn(),
    updateRole: vi.fn(),
    createRefreshSession: vi.fn(),
    findRefreshSession: vi.fn(),
    rotateRefreshSession: vi.fn(),
    revokeRefreshSession: vi.fn(),
    revokeAllRefreshSessions: vi.fn(),
  };
}

describe('AuthService', () => {
  let repository: UserRepository;
  let passwords: PasswordHasher;
  let service: AuthService;

  beforeEach(() => {
    repository = createRepository();
    passwords = { hash: vi.fn(), verify: vi.fn() };
    service = new AuthService(
      repository,
      {
        list: vi.fn(),
        findById: vi.fn().mockResolvedValue({
          id: tenantId,
          name: 'Example Pharma',
          createdAt: now,
        }),
        create: vi.fn(),
      } satisfies TenantRepository,
      passwords,
      { sign: ({ id, role }) => `signed:${id}:${role}` },
      900,
      30,
    );
  });

  it('creates a tenant user with a password hash and server-side refresh hash', async () => {
    vi.mocked(repository.findByEmail).mockResolvedValue(undefined);
    vi.mocked(passwords.hash).mockResolvedValue('new-password-hash');
    vi.mocked(repository.createUser).mockResolvedValue(user);

    const result = await service.register(
      { email: user.email, password: 'correct-password', tenantId },
      { ipAddress: '127.0.0.1' },
    );

    expect(repository.createUser).toHaveBeenCalledWith({
      email: user.email,
      passwordHash: 'new-password-hash',
      tenantId,
    });
    expect(repository.createRefreshSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        tokenHash: hashRefreshToken(result.refreshToken),
      }),
    );
    expect(result).toMatchObject({
      accessToken: `signed:${user.id}:tenant_user`,
      expiresIn: 900,
      user: { email: user.email, role: 'tenant_user' },
    });
  });

  it('returns the same login error when an email does not exist', async () => {
    vi.mocked(repository.findByEmail).mockResolvedValue(undefined);
    vi.mocked(passwords.hash).mockResolvedValue('unused-hash');

    await expect(
      service.login(
        { email: 'missing@example.com', password: 'wrong-password' },
        {},
      ),
    ).rejects.toEqual(new UnauthorizedError('Invalid email or password'));
    expect(passwords.hash).toHaveBeenCalledOnce();
  });

  it('rotates an active refresh session', async () => {
    const rawToken = 'current-refresh-token';
    vi.mocked(repository.findRefreshSession).mockResolvedValue({
      user,
      session: {
        id: '85862dc4-6aa7-4957-b7f9-fdb04e665bc4',
        userId: user.id,
        tokenHash: hashRefreshToken(rawToken),
        userAgent: null,
        ipAddress: null,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        createdAt: now,
      },
    });
    vi.mocked(repository.rotateRefreshSession).mockResolvedValue(true);

    const result = await service.refresh(rawToken, {});

    expect(result.refreshToken).not.toBe(rawToken);
    expect(repository.rotateRefreshSession).toHaveBeenCalledWith(
      '85862dc4-6aa7-4957-b7f9-fdb04e665bc4',
      expect.objectContaining({
        userId: user.id,
        tokenHash: hashRefreshToken(result.refreshToken),
      }),
    );
  });

  it('revokes all sessions when a rotated refresh token is reused', async () => {
    vi.mocked(repository.findRefreshSession).mockResolvedValue({
      user,
      session: {
        id: '85862dc4-6aa7-4957-b7f9-fdb04e665bc4',
        userId: user.id,
        tokenHash: 'hash',
        userAgent: null,
        ipAddress: null,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: now,
        createdAt: now,
      },
    });

    await expect(service.refresh('reused-token', {})).rejects.toEqual(
      new UnauthorizedError('Refresh token reuse detected'),
    );
    expect(repository.revokeAllRefreshSessions).toHaveBeenCalledWith(user.id);
  });
});

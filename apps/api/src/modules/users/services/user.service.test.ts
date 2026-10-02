import { describe, expect, it, vi } from 'vitest';
import type { UserRecord } from '../../../db/schema.js';
import { ForbiddenError } from '../../../errors/app-error.js';
import type {
  UserRepository,
  UserWithTenant,
} from '../repositories/user.repository.js';
import { UserService } from './user.service.js';

const now = new Date('2026-01-01T00:00:00.000Z');

function user(id: string, role: UserRecord['role']): UserWithTenant {
  return {
    id,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    role,
    tenantId:
      role === 'super_admin' ? null : '9d2953d8-f03a-4aba-93f8-bf87338b0257',
    tenantName: role === 'super_admin' ? null : 'Example Pharma',
    createdAt: now,
    updatedAt: now,
  };
}

function repositoryWithUsers(
  usersById: Record<string, UserWithTenant>,
): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn((id) => Promise.resolve(usersById[id])),
    list: vi.fn().mockResolvedValue(Object.values(usersById)),
    createUser: vi.fn(),
    updateRole: vi.fn((id, role) =>
      Promise.resolve(
        usersById[id] ? { ...usersById[id], role, updatedAt: now } : undefined,
      ),
    ),
    createRefreshSession: vi.fn(),
    findRefreshSession: vi.fn(),
    rotateRefreshSession: vi.fn(),
    revokeRefreshSession: vi.fn(),
    revokeAllRefreshSessions: vi.fn(),
  };
}

describe('UserService', () => {
  it('allows a super admin to promote a tenant user', async () => {
    const repository = repositoryWithUsers({
      actor: user('actor', 'super_admin'),
      target: user('target', 'tenant_user'),
    });

    const result = await new UserService(repository).promoteUser(
      'actor',
      'target',
      'tenant_admin',
    );

    expect(repository.updateRole).toHaveBeenCalledWith(
      'target',
      'tenant_admin',
    );
    expect(result.role).toBe('tenant_admin');
  });

  it('does not trust the access-token role when the actor is not a current super admin', async () => {
    const repository = repositoryWithUsers({
      actor: user('actor', 'tenant_admin'),
      target: user('target', 'tenant_user'),
    });

    await expect(
      new UserService(repository).promoteUser('actor', 'target', 'super_admin'),
    ).rejects.toEqual(new ForbiddenError());
    expect(repository.updateRole).not.toHaveBeenCalled();
  });
});

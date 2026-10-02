import { describe, expect, it, vi } from 'vitest';
import type { BatchRecord } from '../../../db/schema.js';
import type {
  UserRepository,
  UserWithTenant,
} from '../../users/repositories/user.repository.js';
import type {
  BatchRepository,
  BatchWithCounts,
} from '../repositories/batch.repository.js';
import { BatchService } from './batch.service.js';

const tenantId = '9d2953d8-f03a-4aba-93f8-bf87338b0257';
const now = new Date('2026-10-02T00:00:00.000Z');

function actor(role: UserWithTenant['role']): UserWithTenant {
  return {
    id: '7ccafba9-27de-43bf-a5d2-1b1333338c57',
    email: 'person@example.com',
    passwordHash: 'hash',
    role,
    tenantId,
    tenantName: 'Example Pharma',
    createdAt: now,
    updatedAt: now,
  };
}

function users(user: UserWithTenant): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(user),
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

const input = {
  medicineName: 'Paracetamol',
  medicineType: 'Tablet',
  manufactureDate: '2026-10-01',
  expiryDate: '2028-10-01',
  cautions: ['Keep away from children'],
  variants: ['500 mg'],
  usages: ['Fever relief'],
  dosages: ['As directed'],
  eligibleUsers: ['Adults'],
  sideEffects: ['Nausea'],
};

describe('BatchService', () => {
  it('scopes the batch list to the current tenant', async () => {
    const repository: BatchRepository = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      find: vi.fn(),
    };

    await new BatchService(repository, users(actor('tenant_user'))).list(
      actor('tenant_user').id,
    );

    expect(repository.list).toHaveBeenCalledWith(tenantId);
  });

  it('retries a primary-key collision and returns the committed batch', async () => {
    let stored: BatchRecord | undefined;
    const create = vi
      .fn()
      .mockRejectedValueOnce({ code: '23505' })
      .mockImplementationOnce(async (batch: BatchRecord) => {
        stored = batch;
      });
    const repository: BatchRepository = {
      create,
      list: vi.fn(),
      find: vi.fn(async (): Promise<BatchWithCounts | undefined> =>
        stored
          ? {
              batch: stored,
              tenantName: 'Example Pharma',
              codeJobCount: 0,
              codeCount: 0,
            }
          : undefined,
      ),
    };

    const result = await new BatchService(
      repository,
      users(actor('tenant_admin')),
    ).create(actor('tenant_admin').id, input);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.batch.batchNumber).toMatch(/^BAT-\d{8}-[A-F0-9]{20}$/);
    expect(result.batch.slug).toBe('paracetamol_tablet');
  });
});

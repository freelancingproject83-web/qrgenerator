import { randomBytes } from 'node:crypto';
import { batchSchema, type CreateBatchInput } from '@qrgenerator/contracts';
import type { BatchRecord } from '../../../db/schema.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../errors/app-error.js';
import type { UserRepository } from '../../users/repositories/user.repository.js';
import type {
  BatchRepository,
  BatchWithCounts,
} from '../repositories/batch.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505',
  );
}

function slugFor(name: string, type: string) {
  return `${name}_${type}`
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 300);
}

function batchNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `BAT-${day}-${randomBytes(10).toString('hex').toUpperCase()}`;
}

function response(row: BatchWithCounts) {
  return batchSchema.parse({
    ...row.batch,
    tenantName: row.tenantName,
    createdAt: row.batch.createdAt.toISOString(),
    codeJobCount: row.codeJobCount,
    codeCount: row.codeCount,
  });
}

export class BatchService {
  constructor(
    private readonly repository: BatchRepository,
    private readonly users: UserRepository,
  ) {}

  private async actor(id: string) {
    const actor = await this.users.findById(id);
    if (!actor) throw new UnauthorizedError();
    return actor;
  }

  async list(actorId: string) {
    const actor = await this.actor(actorId);
    if (actor.role !== 'super_admin' && !actor.tenantId)
      throw new ForbiddenError();
    const rows = await this.repository.list(
      actor.role === 'super_admin' ? undefined : actor.tenantId!,
    );
    return { batches: rows.map(response) };
  }

  async get(actorId: string, number: string) {
    const actor = await this.actor(actorId);
    if (actor.role !== 'super_admin' && !actor.tenantId)
      throw new ForbiddenError();
    const row = await this.repository.find(
      number,
      actor.role === 'super_admin' ? undefined : (actor.tenantId ?? undefined),
    );
    if (!row) throw new NotFoundError('Batch not found');
    return { batch: response(row) };
  }

  async create(actorId: string, input: CreateBatchInput) {
    const actor = await this.actor(actorId);
    if (actor.role !== 'tenant_admin' || !actor.tenantId)
      throw new ForbiddenError('Only a tenant admin can create a batch');
    if (input.expiryDate <= input.manufactureDate) {
      throw new ConflictError('Expiry date must be after manufacture date');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const record: BatchRecord = {
        batchNumber: batchNumber(),
        tenantId: actor.tenantId,
        createdBy: actor.id,
        slug: slugFor(input.medicineName, input.medicineType),
        ...input,
        createdAt: new Date(),
      };
      try {
        await this.repository.create(record);
        const stored = await this.repository.find(
          record.batchNumber,
          actor.tenantId,
        );
        if (!stored) throw new Error('Created batch was not returned');
        return { batch: response(stored) };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictError(
      'Could not allocate a unique batch number; retry the request',
    );
  }
}

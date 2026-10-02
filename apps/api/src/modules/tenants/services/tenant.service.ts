import type { Tenant } from '@qrgenerator/contracts';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../../../errors/app-error.js';
import type { UserRepository } from '../../users/repositories/user.repository.js';
import type { TenantRepository } from '../repositories/tenant.repository.js';

function response(tenant: {
  id: string;
  name: string;
  createdAt: Date;
}): Tenant {
  return { ...tenant, createdAt: tenant.createdAt.toISOString() };
}

function uniqueViolation(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505',
  );
}

export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
  ) {}

  async list() {
    return { tenants: (await this.tenants.list()).map(response) };
  }

  async create(actorId: string, name: string) {
    const actor = await this.users.findById(actorId);
    if (!actor) throw new UnauthorizedError();
    if (actor.role !== 'super_admin') throw new ForbiddenError();
    try {
      return { tenant: response(await this.tenants.create(name)) };
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictError('A tenant with this name already exists');
      throw error;
    }
  }
}

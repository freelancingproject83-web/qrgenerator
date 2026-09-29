import type { User, UserRole } from '@qrgenerator/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../errors/app-error.js';
import { toUser } from '../auth/auth.service.js';
import type { UserRepository } from './user.repository.js';

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async getCurrentUser(userId: string): Promise<User> {
    const user = await this.repository.findById(userId);
    if (!user) throw new UnauthorizedError();
    return toUser(user);
  }

  async promoteUser(
    actorId: string,
    targetUserId: string,
    role: Extract<UserRole, 'tenant_admin' | 'super_admin'>,
  ): Promise<User> {
    const actor = await this.repository.findById(actorId);
    if (!actor) throw new UnauthorizedError();
    if (actor.role !== 'super_admin') throw new ForbiddenError();
    if (actorId === targetUserId) {
      throw new ConflictError('A super admin cannot change their own role');
    }

    const target = await this.repository.findById(targetUserId);
    if (!target) throw new NotFoundError('User not found');
    if (target.role !== 'tenant_user') {
      throw new ConflictError('Only tenant users can be promoted');
    }

    const updatedUser = await this.repository.updateRole(targetUserId, role);
    if (!updatedUser) throw new NotFoundError('User not found');
    return toUser(updatedUser);
  }
}

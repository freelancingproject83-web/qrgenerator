import type { UserRole } from '@qrgenerator/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../db/schema.js';
import { refreshSessions, tenants, users } from '../../../db/schema.js';

export type UserWithTenant = schema.UserRecord & { tenantName: string | null };

export interface NewRefreshSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshSessionWithUser {
  session: schema.RefreshSessionRecord;
  user: UserWithTenant;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserWithTenant | undefined>;
  findById(id: string): Promise<UserWithTenant | undefined>;
  list(): Promise<UserWithTenant[]>;
  createUser(input: {
    email: string;
    passwordHash: string;
    tenantId: string;
  }): Promise<UserWithTenant>;
  updateRole(id: string, role: UserRole): Promise<UserWithTenant | undefined>;
  createRefreshSession(input: NewRefreshSession): Promise<void>;
  findRefreshSession(
    tokenHash: string,
  ): Promise<RefreshSessionWithUser | undefined>;
  rotateRefreshSession(
    currentSessionId: string,
    nextSession: NewRefreshSession,
  ): Promise<boolean>;
  revokeRefreshSession(tokenHash: string): Promise<void>;
  revokeAllRefreshSessions(userId: string): Promise<void>;
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private async find(where: ReturnType<typeof eq>) {
    const [result] = await this.db
      .select({ user: users, tenantName: tenants.name })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(where)
      .limit(1);
    return result
      ? { ...result.user, tenantName: result.tenantName }
      : undefined;
  }

  findByEmail(email: string) {
    return this.find(eq(users.email, email));
  }

  findById(id: string) {
    return this.find(eq(users.id, id));
  }

  async list() {
    const rows = await this.db
      .select({ user: users, tenantName: tenants.name })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id));
    return rows.map((row) => ({ ...row.user, tenantName: row.tenantName }));
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
    tenantId: string;
  }) {
    const [user] = await this.db
      .insert(users)
      .values({ ...input, role: 'tenant_user' })
      .returning();

    if (!user) throw new Error('Database did not return the created user');
    const created = await this.findById(user.id);
    if (!created) throw new Error('Created user could not be read');
    return created;
  }

  async updateRole(id: string, role: UserRole) {
    const [user] = await this.db
      .update(users)
      .set({
        role,
        ...(role === 'super_admin' ? { tenantId: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user ? this.findById(user.id) : undefined;
  }

  async createRefreshSession(input: NewRefreshSession) {
    await this.db.insert(refreshSessions).values(input);
  }

  async findRefreshSession(tokenHash: string) {
    const [result] = await this.db
      .select({
        session: refreshSessions,
        user: users,
        tenantName: tenants.name,
      })
      .from(refreshSessions)
      .innerJoin(users, eq(refreshSessions.userId, users.id))
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(eq(refreshSessions.tokenHash, tokenHash))
      .limit(1);
    return result
      ? {
          session: result.session,
          user: { ...result.user, tenantName: result.tenantName },
        }
      : undefined;
  }

  async rotateRefreshSession(
    currentSessionId: string,
    nextSession: NewRefreshSession,
  ) {
    return this.db.transaction(async (transaction) => {
      const [revoked] = await transaction
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshSessions.id, currentSessionId),
            isNull(refreshSessions.revokedAt),
            gt(refreshSessions.expiresAt, new Date()),
          ),
        )
        .returning({ id: refreshSessions.id });

      if (!revoked) return false;
      await transaction.insert(refreshSessions).values(nextSession);
      return true;
    });
  }

  async revokeRefreshSession(tokenHash: string) {
    await this.db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshSessions.tokenHash, tokenHash),
          isNull(refreshSessions.revokedAt),
        ),
      );
  }

  async revokeAllRefreshSessions(userId: string) {
    await this.db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshSessions.userId, userId),
          isNull(refreshSessions.revokedAt),
        ),
      );
  }
}

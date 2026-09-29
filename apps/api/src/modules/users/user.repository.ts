import type { UserRole } from '@qrgenerator/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema.js';
import { refreshSessions, users } from '../../db/schema.js';

export interface NewRefreshSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshSessionWithUser {
  session: schema.RefreshSessionRecord;
  user: schema.UserRecord;
}

export interface UserRepository {
  findByEmail(email: string): Promise<schema.UserRecord | undefined>;
  findById(id: string): Promise<schema.UserRecord | undefined>;
  createUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<schema.UserRecord>;
  updateRole(
    id: string,
    role: UserRole,
  ): Promise<schema.UserRecord | undefined>;
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

  async findByEmail(email: string) {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }

  async findById(id: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async createUser(input: { email: string; passwordHash: string }) {
    const [user] = await this.db
      .insert(users)
      .values({ ...input, role: 'tenant_user' })
      .returning();

    if (!user) throw new Error('Database did not return the created user');
    return user;
  }

  async updateRole(id: string, role: UserRole) {
    const [user] = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createRefreshSession(input: NewRefreshSession) {
    await this.db.insert(refreshSessions).values(input);
  }

  async findRefreshSession(tokenHash: string) {
    const [result] = await this.db
      .select({ session: refreshSessions, user: users })
      .from(refreshSessions)
      .innerJoin(users, eq(refreshSessions.userId, users.id))
      .where(eq(refreshSessions.tokenHash, tokenHash))
      .limit(1);
    return result;
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

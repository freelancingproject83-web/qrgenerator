import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { USER_ROLES } from '@qrgenerator/contracts';
import type { CodePrintOptions, PrintReport } from '@qrgenerator/contracts';

export const userRoleEnum = pgEnum('user_role', USER_ROLES);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').default('tenant_user').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`),
    index('users_role_idx').on(table.role),
  ],
);

export const refreshSessions = pgTable(
  'refresh_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userAgent: varchar('user_agent', { length: 512 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('refresh_sessions_token_hash_unique').on(table.tokenHash),
    index('refresh_sessions_user_id_idx').on(table.userId),
    index('refresh_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type RefreshSessionRecord = typeof refreshSessions.$inferSelect;

export const codeStatusEnum = pgEnum('code_status', ['active', 'revoked']);

export const codeJobs = pgTable(
  'code_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    reference: varchar('reference', { length: 80 }),
    quantity: integer('quantity').notNull(),
    options: jsonb('options').$type<CodePrintOptions>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('code_jobs_owner_idempotency_unique').on(
      table.ownerId,
      table.idempotencyKey,
    ),
    check('code_jobs_quantity_range', sql`${table.quantity} between 1 and 50`),
  ],
);

export const codeUnits = pgTable(
  'code_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => codeJobs.id, { onDelete: 'restrict' }),
    token: varchar('token', { length: 26 }).notNull(),
    position: integer('position').notNull(),
    scanUrl: text('scan_url').notNull(),
    // The exact matrix is retained so a dependency upgrade cannot change an issued artifact.
    matrix: jsonb('matrix').$type<string[]>().notNull(),
    printReport: jsonb('print_report').$type<PrintReport>().notNull(),
    status: codeStatusEnum('status').default('active').notNull(),
    revokeReason: varchar('revoke_reason', { length: 300 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('code_units_token_unique').on(table.token),
    uniqueIndex('code_units_job_position_unique').on(
      table.jobId,
      table.position,
    ),
    check(
      'code_units_token_shape',
      sql`${table.token} ~ '^[A-Z2-7]{25}[AEIMQUY4]$'`,
    ),
    check('code_units_position_range', sql`${table.position} between 1 and 50`),
    check(
      'code_units_revocation_state',
      sql`(${table.status} = 'active' and ${table.revokedAt} is null and ${table.revokeReason} is null) or (${table.status} = 'revoked' and ${table.revokedAt} is not null and ${table.revokeReason} is not null)`,
    ),
  ],
);

export const codeEvents = pgTable(
  'code_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => codeJobs.id, { onDelete: 'restrict' }),
    unitId: uuid('unit_id').references(() => codeUnits.id, {
      onDelete: 'restrict',
    }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: varchar('action', { length: 40 }).notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('code_events_job_idx').on(table.jobId)],
);
export type CodeJobRecord = typeof codeJobs.$inferSelect;
export type CodeUnitRecord = typeof codeUnits.$inferSelect;

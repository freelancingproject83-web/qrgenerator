import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../db/schema.js';
import { codeEvents, codeJobs, codeUnits } from '../../../db/schema.js';

export interface StoredJob {
  job: schema.CodeJobRecord;
  units: schema.CodeUnitRecord[];
}
export interface CodeRepository {
  findIdempotent(ownerId: string, key: string): Promise<StoredJob | undefined>;
  findJob(ownerId: string, id: string): Promise<StoredJob | undefined>;
  findUnit(
    ownerId: string,
    id: string,
  ): Promise<schema.CodeUnitRecord | undefined>;
  findPublic(token: string): Promise<schema.CodeUnitRecord | undefined>;
  create(
    job: schema.CodeJobRecord,
    units: schema.CodeUnitRecord[],
  ): Promise<void>;
  revoke(
    ownerId: string,
    id: string,
    reason: string,
  ): Promise<schema.CodeUnitRecord | undefined>;
  recordDownload(
    ownerId: string,
    unit: schema.CodeUnitRecord,
    format: 'svg' | 'pdf',
  ): Promise<void>;
}

export class DrizzleCodeRepository implements CodeRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private async withUnits(
    job: schema.CodeJobRecord | undefined,
  ): Promise<StoredJob | undefined> {
    if (!job) return undefined;
    const units = await this.db
      .select()
      .from(codeUnits)
      .where(eq(codeUnits.jobId, job.id))
      .orderBy(asc(codeUnits.position));
    return { job, units };
  }
  async findIdempotent(ownerId: string, key: string) {
    const job = await this.db.query.codeJobs.findFirst({
      where: and(
        eq(codeJobs.ownerId, ownerId),
        eq(codeJobs.idempotencyKey, key),
      ),
    });
    return this.withUnits(job);
  }
  async findJob(ownerId: string, id: string) {
    return this.withUnits(
      await this.db.query.codeJobs.findFirst({
        where: and(eq(codeJobs.ownerId, ownerId), eq(codeJobs.id, id)),
      }),
    );
  }
  async findUnit(ownerId: string, id: string) {
    const [result] = await this.db
      .select({ unit: codeUnits })
      .from(codeUnits)
      .innerJoin(codeJobs, eq(codeJobs.id, codeUnits.jobId))
      .where(and(eq(codeJobs.ownerId, ownerId), eq(codeUnits.id, id)))
      .limit(1);
    return result?.unit;
  }
  async findPublic(token: string) {
    return this.db.query.codeUnits.findFirst({
      where: eq(codeUnits.token, token),
    });
  }
  async create(job: schema.CodeJobRecord, units: schema.CodeUnitRecord[]) {
    await this.db.transaction(async (tx) => {
      await tx.insert(codeJobs).values(job);
      await tx.insert(codeUnits).values(units);
      await tx
        .insert(codeEvents)
        .values({ jobId: job.id, actorId: job.ownerId, action: 'job_created' });
    });
  }
  async revoke(ownerId: string, id: string, reason: string) {
    return this.db.transaction(async (tx) => {
      // Owner check and row lock are in the same transaction as the state change.
      const [found] = await tx
        .select({ unit: codeUnits })
        .from(codeUnits)
        .innerJoin(codeJobs, eq(codeJobs.id, codeUnits.jobId))
        .where(and(eq(codeUnits.id, id), eq(codeJobs.ownerId, ownerId)))
        .for('update', { of: codeUnits });
      if (!found || found.unit.status === 'revoked') return found?.unit;
      const [unit] = await tx
        .update(codeUnits)
        .set({ status: 'revoked', revokedAt: new Date(), revokeReason: reason })
        .where(eq(codeUnits.id, id))
        .returning();
      await tx.insert(codeEvents).values({
        jobId: found.unit.jobId,
        unitId: id,
        actorId: ownerId,
        action: 'unit_revoked',
        detail: reason,
      });
      return unit;
    });
  }
  async recordDownload(
    ownerId: string,
    unit: schema.CodeUnitRecord,
    format: 'svg' | 'pdf',
  ) {
    await this.db.insert(codeEvents).values({
      jobId: unit.jobId,
      unitId: unit.id,
      actorId: ownerId,
      action: `download_${format}`,
    });
  }
}

import { and, countDistinct, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../db/schema.js';
import { batches, codeJobs, codeUnits, tenants } from '../../../db/schema.js';

export interface BatchWithCounts {
  batch: schema.BatchRecord;
  tenantName: string;
  codeJobCount: number;
  codeCount: number;
}

export interface BatchRepository {
  create(batch: schema.BatchRecord): Promise<void>;
  list(tenantId?: string): Promise<BatchWithCounts[]>;
  find(
    batchNumber: string,
    tenantId?: string,
  ): Promise<BatchWithCounts | undefined>;
}

export class DrizzleBatchRepository implements BatchRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(batch: schema.BatchRecord) {
    await this.db.insert(batches).values(batch);
  }

  private query(tenantId?: string, batchNumber?: string) {
    const conditions = [
      tenantId ? eq(batches.tenantId, tenantId) : undefined,
      batchNumber ? eq(batches.batchNumber, batchNumber) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );
    return this.db
      .select({
        batch: batches,
        tenantName: tenants.name,
        codeJobCount: countDistinct(codeJobs.id),
        codeCount: countDistinct(codeUnits.id),
      })
      .from(batches)
      .innerJoin(tenants, eq(batches.tenantId, tenants.id))
      .leftJoin(codeJobs, eq(codeJobs.batchNumber, batches.batchNumber))
      .leftJoin(codeUnits, eq(codeUnits.jobId, codeJobs.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(batches.batchNumber, tenants.name)
      .orderBy(desc(batches.createdAt));
  }

  async list(tenantId?: string) {
    const rows = await this.query(tenantId);
    return rows.map((row) => ({
      ...row,
      codeJobCount: Number(row.codeJobCount),
      codeCount: Number(row.codeCount),
    }));
  }

  async find(batchNumber: string, tenantId?: string) {
    const [row] = await this.query(tenantId, batchNumber).limit(1);
    return row
      ? {
          ...row,
          codeJobCount: Number(row.codeJobCount),
          codeCount: Number(row.codeCount),
        }
      : undefined;
  }
}

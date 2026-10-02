import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../db/schema.js';
import { tenants } from '../../../db/schema.js';

export interface TenantRepository {
  list(): Promise<schema.TenantRecord[]>;
  findById(id: string): Promise<schema.TenantRecord | undefined>;
  create(name: string): Promise<schema.TenantRecord>;
}

export class DrizzleTenantRepository implements TenantRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  list() {
    return this.db.select().from(tenants).orderBy(asc(tenants.name));
  }

  async findById(id: string) {
    return this.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  }

  async create(name: string) {
    const [tenant] = await this.db.insert(tenants).values({ name }).returning();
    if (!tenant) throw new Error('Database did not return the created tenant');
    return tenant;
  }
}

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function createDatabase(databaseUrl: string, maxConnections = 5) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: maxConnections,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  return { pool, db: drizzle({ client: pool, schema }) };
}

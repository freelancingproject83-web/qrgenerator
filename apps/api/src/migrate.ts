import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { z } from 'zod';
import { createDatabase } from './db/client.js';

const databaseUrl = z
  .url()
  .startsWith('postgres')
  .parse(process.env.DATABASE_URL);
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const { pool, db } = createDatabase(databaseUrl, 1);

try {
  await migrate(db, { migrationsFolder });
  console.info('Database migrations completed successfully.');
} finally {
  await pool.end();
}

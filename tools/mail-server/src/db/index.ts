import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from '../env.js';

const createDrizzle = (conn: postgres.Sql) => drizzle(conn, { schema });

let _db: ReturnType<typeof createDrizzle> | null = null;
let _conn: postgres.Sql | null = null;

export function getDb() {
  if (!_db) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    _conn = postgres(env.DATABASE_URL);
    _db = createDrizzle(_conn);
  }
  return _db;
}

export type DB = ReturnType<typeof createDrizzle>;
export { schema };

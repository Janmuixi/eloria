import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { resolveEnvVar } from '../utils/resolve-env-var'

const dbUrl = resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db')
const sqlite = new Database(dbUrl.replace('file:', '') || './db/eloria.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

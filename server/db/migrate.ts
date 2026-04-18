import Database from 'better-sqlite3'
import { runMigrations } from './migrate-runner'

const dbUrl = process.env.DATABASE_URL || 'file:./db/eloria.db'
const dbPath = dbUrl.replace('file:', '') || './db/eloria.db'
const migrationsFolder = 'server/db/migrations'

console.log(`[migrate] opening database at ${dbPath}`)
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

try {
  const result = runMigrations(sqlite, migrationsFolder)
  if (result.bootstrapped) {
    console.log(`[migrate] bootstrapped __drizzle_migrations with ${result.bootstrapEntries} existing entries`)
  }
  console.log('[migrate] done')
} catch (err) {
  console.error('[migrate] failed:', err)
  sqlite.close()
  process.exit(1)
}

sqlite.close()

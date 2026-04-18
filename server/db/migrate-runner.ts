import type Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

export type MigrationResult = {
  bootstrapped: boolean
  bootstrapEntries: number
}

export function runMigrations(
  sqlite: Database.Database,
  migrationsFolder: string,
): MigrationResult {
  const bootstrapped = needsBootstrap(sqlite)
  const bootstrapEntries = 0
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder })
  return { bootstrapped, bootstrapEntries }
}

function needsBootstrap(sqlite: Database.Database): boolean {
  return tableExists(sqlite, 'users') && !tableExists(sqlite, '__drizzle_migrations')
}

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name)
  return row !== undefined
}

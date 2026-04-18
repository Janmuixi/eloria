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
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder })
  return { bootstrapped: false, bootstrapEntries: 0 }
}

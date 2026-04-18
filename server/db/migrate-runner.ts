import type Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

export type MigrationResult = {
  bootstrapped: boolean
  bootstrapEntries: number
}

type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean }
type Journal = { version: string; dialect: string; entries: JournalEntry[] }

export function runMigrations(
  sqlite: Database.Database,
  migrationsFolder: string,
): MigrationResult {
  const bootstrapped = needsBootstrap(sqlite)
  let bootstrapEntries = 0
  if (bootstrapped) {
    bootstrapEntries = bootstrap(sqlite, migrationsFolder)
  }
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

function bootstrap(sqlite: Database.Database, migrationsFolder: string): number {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    );
  `)
  const journal: Journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf-8'),
  )
  const insert = sqlite.prepare(
    `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
  )
  const tx = sqlite.transaction((entries: JournalEntry[]) => {
    for (const entry of entries) {
      const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf-8')
      const hash = createHash('sha256').update(sql).digest('hex')
      insert.run(hash, entry.when)
    }
  })
  tx(journal.entries)
  return journal.entries.length
}

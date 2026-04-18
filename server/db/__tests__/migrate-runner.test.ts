import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { runMigrations } from '../migrate-runner'

describe('runMigrations', () => {
  it('returns a result object with bootstrapped and bootstrapEntries fields', () => {
    const sqlite = new Database(':memory:')
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result).toHaveProperty('bootstrapped')
    expect(result).toHaveProperty('bootstrapEntries')
    sqlite.close()
  })

  it('does not bootstrap a fresh empty database', () => {
    const sqlite = new Database(':memory:')
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(false)
    sqlite.close()
  })

  it('does not bootstrap a database that already has __drizzle_migrations', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      );
    `)
    const migrationSql = readFileSync('server/db/migrations/0000_many_krista_starr.sql', 'utf-8')
    for (const stmt of migrationSql.split('--> statement-breakpoint')) {
      sqlite.exec(stmt)
    }
    const hash = createHash('sha256').update(migrationSql).digest('hex')
    const journal = JSON.parse(readFileSync('server/db/migrations/meta/_journal.json', 'utf-8'))
    const folderMillis = journal.entries[0].when
    sqlite.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(hash, folderMillis)
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(false)
    sqlite.close()
  })

  it('bootstraps a database that has users table but no __drizzle_migrations', () => {
    const sqlite = new Database(':memory:')
    const migrationSql = readFileSync('server/db/migrations/0000_many_krista_starr.sql', 'utf-8')
    for (const stmt of migrationSql.split('--> statement-breakpoint')) {
      sqlite.exec(stmt)
    }
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(true)
    sqlite.close()
  })

  it('after bootstrap, __drizzle_migrations contains one row per journal entry with matching hash', () => {
    const sqlite = new Database(':memory:')
    const migrationSql = readFileSync('server/db/migrations/0000_many_krista_starr.sql', 'utf-8')
    for (const stmt of migrationSql.split('--> statement-breakpoint')) {
      sqlite.exec(stmt)
    }
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(true)
    expect(result.bootstrapEntries).toBe(1)
    const rows = sqlite
      .prepare(`SELECT hash, created_at FROM __drizzle_migrations`)
      .all() as { hash: string; created_at: number }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].hash).toBe(
      createHash('sha256').update(migrationSql).digest('hex'),
    )
    sqlite.close()
  })
})

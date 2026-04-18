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
    const count = sqlite.prepare(`SELECT COUNT(*) as c FROM __drizzle_migrations`).get() as { c: number }
    expect(count.c).toBe(1)
    sqlite.close()
  })

  it('on a fresh database, applies migrations from scratch and creates tracking', () => {
    const sqlite = new Database(':memory:')
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(false)
    expect(result.bootstrapEntries).toBe(0)
    // users table should exist now (created by 0000)
    const usersTable = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
      .get()
    expect(usersTable).toBeDefined()
    // tracking table should exist with at least one row
    const tracking = sqlite
      .prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`)
      .get() as { count: number }
    expect(tracking.count).toBeGreaterThanOrEqual(1)
    sqlite.close()
  })
})

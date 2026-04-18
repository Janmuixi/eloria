import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../migrate-runner'

describe('runMigrations', () => {
  it('returns a result object with bootstrapped and bootstrapEntries fields', () => {
    const sqlite = new Database(':memory:')
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result).toHaveProperty('bootstrapped')
    expect(result).toHaveProperty('bootstrapEntries')
    sqlite.close()
  })
})

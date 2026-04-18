# DB Migration Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run db:migrate` command that idempotently applies pending Drizzle migrations to the SQLite database, including a one-time bootstrap for production DBs that were originally provisioned via `db:push`.

**Architecture:** A pure-logic `runMigrations(sqlite, migrationsFolder)` function in `server/db/migrate-runner.ts` (testable with in-memory SQLite), and a thin entrypoint `server/db/migrate.ts` that opens the configured DB and calls it. The runner detects whether `__drizzle_migrations` tracking is missing on an already-provisioned DB and seeds it with sha256 hashes matching what drizzle's migrator computes, then delegates to drizzle's built-in `migrate()` from `drizzle-orm/better-sqlite3/migrator`.

**Tech Stack:** TypeScript, drizzle-orm, drizzle-orm/better-sqlite3/migrator, better-sqlite3, vitest, tsx.

---

## File Structure

- **Create:** `server/db/migrate-runner.ts` — pure migration logic (`runMigrations`, internal `needsBootstrap`/`bootstrap`/`tableExists` helpers).
- **Create:** `server/db/__tests__/migrate-runner.test.ts` — vitest unit tests using `:memory:` SQLite.
- **Create:** `server/db/migrate.ts` — entrypoint script: reads `DATABASE_URL` from env, opens the DB, calls `runMigrations`, logs, exits.
- **Modify:** `package.json` — add `"db:migrate": "tsx server/db/migrate.ts"` to `scripts`.

The runner is split from the entrypoint so the bootstrap + migration logic is unit-testable without touching the real filesystem DB or process env.

---

## Task 1: Create the migration runner module skeleton

**Files:**
- Create: `server/db/migrate-runner.ts`
- Create: `server/db/__tests__/migrate-runner.test.ts`

- [ ] **Step 1: Write the failing test for the public API shape**

Create `server/db/__tests__/migrate-runner.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: FAIL with module not found / `runMigrations` is not a function.

- [ ] **Step 3: Create the runner module with the minimal shape**

Create `server/db/migrate-runner.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrate-runner.ts server/db/__tests__/migrate-runner.test.ts
git commit -m "feat(db): add migrate-runner module skeleton"
```

---

## Task 2: Implement bootstrap detection

**Files:**
- Modify: `server/db/migrate-runner.ts`
- Modify: `server/db/__tests__/migrate-runner.test.ts`

**Note:** This task only covers the "no bootstrap needed" cases. The "bootstrap needed" case is added in Task 3 (where the seeding is implemented), because asserting `bootstrapped: true` from a state that drizzle's `migrate()` would then crash on is awkward to test in isolation.

- [ ] **Step 1: Write failing tests for the no-bootstrap cases**

Append to `server/db/__tests__/migrate-runner.test.ts` inside the same `describe`:

```ts
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
      CREATE TABLE users (id INTEGER PRIMARY KEY);
    `)
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(false)
    sqlite.close()
  })
```

- [ ] **Step 2: Run tests to verify behavior**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: All tests PASS. The first new test passes because we return `bootstrapped: false` and drizzle's `migrate()` happily sets up everything on a fresh DB. The second new test passes for the same reason — `migrate()` finds the tracking table already exists, sees no rows, applies the migration... wait, that crashes because `users` already exists. Adjust the second test to seed the tracking table with the right hash so `migrate()` skips re-applying:

```ts
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
    sqlite.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(hash, 1)
    const result = runMigrations(sqlite, 'server/db/migrations')
    expect(result.bootstrapped).toBe(false)
    sqlite.close()
  })
```

Add to the imports at the top of the test file:

```ts
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
```

Re-run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Implement detection helpers and wire them into runMigrations**

Replace the entire contents of `server/db/migrate-runner.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: All tests (the original API-shape test from Task 1 plus the two new no-bootstrap tests) PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrate-runner.ts server/db/__tests__/migrate-runner.test.ts
git commit -m "feat(db): detect when bootstrap is needed"
```

---

## Task 3: Implement bootstrap seeding

**Files:**
- Modify: `server/db/migrate-runner.ts`
- Modify: `server/db/__tests__/migrate-runner.test.ts`

- [ ] **Step 1: Write failing tests for bootstrap behavior**

Append to `server/db/__tests__/migrate-runner.test.ts` inside the same `describe`:

```ts
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
```

(The `readFileSync` and `createHash` imports were already added in Task 2.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: The new bootstrap-content test FAILS — `__drizzle_migrations` is empty (or missing) and `bootstrapEntries` is 0.

- [ ] **Step 3: Implement bootstrap seeding**

Replace the entire contents of `server/db/migrate-runner.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: All four tests PASS. Drizzle's `migrate()` sees the tracking table populated with the same hash it would compute and skips re-applying `0000`.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrate-runner.ts server/db/__tests__/migrate-runner.test.ts
git commit -m "feat(db): seed __drizzle_migrations during bootstrap"
```

---

## Task 4: Verify drizzle's migrator runs cleanly on a fresh DB

**Files:**
- Modify: `server/db/__tests__/migrate-runner.test.ts`

This task adds a regression test confirming the fresh-DB path (no bootstrap, drizzle creates everything from scratch) still works after the bootstrap logic was added.

- [ ] **Step 1: Write failing test**

Append to the `describe`:

```ts
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
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run server/db/__tests__/migrate-runner.test.ts`
Expected: PASS (no implementation change needed — drizzle's `migrate()` handles fresh DBs natively).

- [ ] **Step 3: Commit**

```bash
git add server/db/__tests__/migrate-runner.test.ts
git commit -m "test(db): cover fresh-database migration path"
```

---

## Task 5: Create the entrypoint script

**Files:**
- Create: `server/db/migrate.ts`

The entrypoint reads `DATABASE_URL` from `process.env` (NOT `resolveEnvVar` — that calls `useRuntimeConfig()` which is Nuxt-only and unavailable in a standalone tsx script), opens the DB the same way `server/db/index.ts` does, calls `runMigrations`, logs, and exits.

- [ ] **Step 1: Create the entrypoint**

Create `server/db/migrate.ts`:

```ts
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
```

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit server/db/migrate.ts`
Expected: No errors. (If your repo doesn't have a standalone tsc invocation working, run `npx vitest run server/db/__tests__/migrate-runner.test.ts` again to confirm the runner still imports cleanly — the entrypoint will be exercised in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add server/db/migrate.ts
git commit -m "feat(db): add migrate entrypoint script"
```

---

## Task 6: Wire up the npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

In `package.json`, inside `"scripts"`, add `db:migrate` next to the other `db:*` scripts. The resulting `scripts` block should look like:

```json
"scripts": {
  "build": "nuxt build",
  "dev": "nuxt dev",
  "generate": "nuxt generate",
  "preview": "nuxt preview",
  "postinstall": "nuxt prepare",
  "db:seed": "npx tsx server/db/seed.ts",
  "db:seed-templates": "npx tsx server/db/seed-templates.ts",
  "db:push": "mkdir -p db && npx drizzle-kit push",
  "db:generate": "npx drizzle-kit generate",
  "db:migrate": "tsx server/db/migrate.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Verify the script is wired up**

Run: `npm run db:migrate -- --help 2>&1 | head -5` (just to confirm npm finds the script — it'll actually execute, that's expected; cancel with Ctrl+C if it hangs).

Better verification: `npm run` (with no args) lists scripts. Confirm `db:migrate` appears.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add db:migrate npm script"
```

---

## Task 7: End-to-end verification on a throwaway DB

**Files:**
- None (verification only)

Verify the full flow against a real on-disk SQLite file before deploying.

- [ ] **Step 1: Set up a throwaway DB that mimics production state**

```bash
mkdir -p /tmp/migrate-test
cp server/db/migrations/0000_many_krista_starr.sql /tmp/migrate-test/0000.sql
sqlite3 /tmp/migrate-test/eloria.db < /tmp/migrate-test/0000.sql
```

This creates a DB with the original schema applied but no `__drizzle_migrations` table — exactly the production state.

- [ ] **Step 2: Confirm tracking table is missing**

Run:
```bash
sqlite3 /tmp/migrate-test/eloria.db "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations';"
```
Expected: empty output (no rows).

- [ ] **Step 3: Run the migrator against the throwaway DB**

Run:
```bash
DATABASE_URL=file:/tmp/migrate-test/eloria.db npm run db:migrate
```

Expected output (something like):
```
[migrate] opening database at /tmp/migrate-test/eloria.db
[migrate] bootstrapped __drizzle_migrations with 1 existing entries
[migrate] done
```

Exit code: `0`.

- [ ] **Step 4: Confirm tracking table now exists with the right hash**

Run:
```bash
sqlite3 /tmp/migrate-test/eloria.db "SELECT hash, created_at FROM __drizzle_migrations;"
```
Expected: one row whose `hash` equals `sha256(server/db/migrations/0000_many_krista_starr.sql contents)`. Verify with:
```bash
sha256sum server/db/migrations/0000_many_krista_starr.sql
```
The hex digest should match the `hash` column.

- [ ] **Step 5: Run again and confirm no-op**

Run:
```bash
DATABASE_URL=file:/tmp/migrate-test/eloria.db npm run db:migrate
```
Expected: no "bootstrapped" line this time, just `[migrate] done`. Exit code `0`. The tracking table should still have exactly one row.

- [ ] **Step 6: Confirm fresh-DB path also works**

Run:
```bash
rm /tmp/migrate-test/eloria.db
DATABASE_URL=file:/tmp/migrate-test/eloria.db npm run db:migrate
sqlite3 /tmp/migrate-test/eloria.db "SELECT name FROM sqlite_master WHERE type='table';"
```
Expected: all schema tables present (`events`, `guests`, `templates`, `tiers`, `users`, `__drizzle_migrations`). Exit code `0` from the migrate command. No "bootstrapped" log line (it wasn't needed).

- [ ] **Step 7: Clean up**

```bash
rm -rf /tmp/migrate-test
```

- [ ] **Step 8: Final commit (no code changes — skip if no diff)**

This task is verification-only; if no files changed, no commit is needed. Run `git status` to confirm clean.

---

## Self-Review Notes

- Spec covered: bootstrap detection ✓ (Task 2), bootstrap seeding with sha256 hashes ✓ (Task 3), drizzle migrator delegation ✓ (Task 1, refined through Task 3), npm script ✓ (Task 6), entrypoint reading `DATABASE_URL` ✓ (Task 5), behavior matrix all four cases ✓ (Tasks 2-4 cover them in unit tests, Task 7 covers them end-to-end).
- Out of spec scope (correctly not in this plan): generating the missing `0001_*.sql` for the subscriptions schema, deploy documentation. These are listed in the spec's Followup section.
- The `resolveEnvVar` Nuxt-vs-standalone gotcha is called out in Task 5 to prevent the engineer from copy-pasting from `server/db/index.ts`.

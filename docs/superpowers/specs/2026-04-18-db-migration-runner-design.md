# Database Migration Runner

## Problem

The project uses Drizzle ORM with SQLite migrations stored in `server/db/migrations/`, but has no way to apply pending migrations to a database. Migrations are generated with `npm run db:generate`, but applying them requires either `npm run db:push` (which compares schema and applies, unsuitable for production) or manual `sqlite3 db < file.sql` execution.

This caused a production incident: schema changes for the subscriptions feature (adding `users.stripe_customer_id` and a new `subscriptions` table) were merged without a corresponding migration file. Production deployed the new code but the database schema was never updated, causing `SqliteError: no such column: "stripe_customer_id"` on every registration attempt.

## Goal

Provide an `npm run db:migrate` command that applies any pending migrations to the configured database, safely and idempotently. Operators run this as part of the deploy step.

## Non-Goals

- Auto-running migrations on app startup. (Mixes deploy concerns with runtime, causes races across multiple booting instances, complicates failure diagnosis.)
- Concurrent invocation safety. The script is a deploy-step tool; ensuring it isn't run twice in parallel is the operator's responsibility.
- Down migrations / rollback. Drizzle doesn't support these natively, and the project hasn't needed them.

## Solution Overview

A standalone TypeScript script at `server/db/migrate.ts`, invoked via a new `db:migrate` script in `package.json`. It:

1. Opens the SQLite database using the same `DATABASE_URL` resolution as `server/db/index.ts`.
2. Runs a one-time bootstrap if needed (see below).
3. Delegates to drizzle-orm's built-in `migrate()` function from `drizzle-orm/better-sqlite3/migrator`, which reads `server/db/migrations/meta/_journal.json`, compares each entry's hash against a `__drizzle_migrations` tracking table, and applies any whose hash is missing.
4. Logs a summary and exits with code `0` on success, `1` on error.

## Bootstrap

Production was originally provisioned with `npm run db:push`, which applies the schema directly without writing to `__drizzle_migrations`. This means the existing production database has the `0000_many_krista_starr.sql` schema applied but no Drizzle migration tracking table exists. If we naively call `migrate()`, drizzle will see an empty tracking table, try to re-run `0000`, and crash with "table already exists."

The bootstrap step makes drizzle's migrator see the existing state as a normal migration history:

1. Query `sqlite_master` for `__drizzle_migrations` and for `users` (a canary table from migration `0000`).
2. If `users` exists and `__drizzle_migrations` does NOT:
   - Create `__drizzle_migrations` with the same schema drizzle would create:
     ```sql
     CREATE TABLE IF NOT EXISTS __drizzle_migrations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       hash text NOT NULL,
       created_at numeric
     );
     ```
   - Read `_journal.json`. For each entry, read the corresponding `<tag>.sql` file, compute `sha256(fileContents)` (hex), and insert one row: `(hash, created_at)` where `created_at` is the entry's `when` field.
3. Otherwise (fresh DB with no tables, or already-tracked DB), do nothing — drizzle's `migrate()` will create the tracking table itself if needed.

The hash must match what drizzle computes internally (it uses `crypto.createHash('sha256').update(fileContents).digest('hex')` against the raw file contents). Bootstrap is invisible to the migrator: it just sees a tracking table whose hashes match the on-disk migrations.

After bootstrap (or skipping it), `migrate()` runs and applies anything new.

## Behavior Matrix

| DB state                                                | Bootstrap action               | Migrator action                        |
|---------------------------------------------------------|--------------------------------|----------------------------------------|
| File doesn't exist (fresh)                              | Skipped (no `users` table)     | Creates tracking table, applies all    |
| Tables exist, no `__drizzle_migrations`                 | Seeds tracking with all journal entries | Sees all hashes match, applies new only |
| Tables exist, `__drizzle_migrations` populated          | Skipped                        | Applies any pending                    |
| Up to date                                              | Skipped                        | No-op, logs "no pending migrations"    |

## Output

On success, log:
- Whether bootstrap ran (and how many entries it seeded).
- Each migration applied (by tag) or "no pending migrations."
- Final "done" line.

On failure, print the error and exit `1`. Drizzle's migrator wraps each migration in a transaction, so a mid-run failure leaves the DB in a consistent pre-migration state.

## Files Touched

- **New:** `server/db/migrate.ts` — the script.
- **Modified:** `package.json` — add `"db:migrate": "tsx server/db/migrate.ts"` to `scripts`.

## Followup (out of scope)

- Generate the missing `0001_*.sql` migration for the subscriptions schema drift (`npm run db:generate`).
- Document the deploy flow: `npm run db:migrate` after pulling new code, before restarting the app.

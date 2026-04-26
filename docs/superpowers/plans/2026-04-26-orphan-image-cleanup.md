# Orphan Custom-Invitation Image Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop leaking custom-invitation image files. (1) Make event-deletion remove the on-disk image and its event directory. (2) Add a manual cleanup script that prunes both event-directories whose event row no longer exists and stale files inside existing event directories, with a grace period to avoid racing in-flight uploads.

**Architecture:** Two changes in the existing Nuxt/Drizzle codebase. The event DELETE handler gains a post-DB `deleteImage()` call plus an `rmdir` of the event directory. A new pure helper `cleanupOrphanImages({ db, ... })` lives in its own module so its DB dependency is injectable for tests; a thin `tsx` CLI in `scripts/` wraps it for ops use.

**Tech Stack:** TypeScript, Nuxt 3 (h3 server handlers), Drizzle ORM, better-sqlite3 (tests use `:memory:`), Vitest, sharp, `tsx`.

**Reference spec:** `docs/superpowers/specs/2026-04-26-orphan-image-cleanup-design.md`

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `server/api/events/[id].delete.ts` | Modify | After DB delete, unlink `customImagePath` and rmdir empty event dir |
| `server/utils/cleanup-orphan-images.ts` | Create | Pure helper: scan UPLOAD_ROOT, join against DB, delete orphans/stale files |
| `server/utils/__tests__/cleanup-orphan-images.test.ts` | Create | Vitest unit tests for the helper (in-memory db + temp UPLOAD_ROOT) |
| `scripts/cleanup-orphan-images.ts` | Create | CLI: parse flags, call helper with prod db, print summary |
| `server/api/__tests__/events.test.ts` | Modify | Add 2 cases for the DELETE handler image cleanup |
| `package.json` | Modify | Add `"cleanup:images"` script |

The helper lives in its own file (not `image-storage.ts`) because it has a DB dependency that the existing FS-only helpers do not. Keeping them separate keeps `image-storage.ts` test setup as-is and gives the cleanup helper its own focused test file.

---

## Task 1: Wire `deleteImage()` into the event DELETE handler

**Files:**
- Modify: `server/api/events/[id].delete.ts`
- Test: `server/api/__tests__/events.test.ts` (add cases inside `describe('DELETE /api/events/:id', ...)`, around line 211)

- [ ] **Step 1: Add the failing tests**

Append the following two `it` blocks **inside** the existing `describe('DELETE /api/events/:id', () => { ... })` block in `server/api/__tests__/events.test.ts` (i.e. before its closing `})` near line 250):

```ts
    it('deletes the customImagePath file from disk and rmdirs the event dir', async () => {
      const { saveImage, imageAbsolutePath } = await import('../../utils/image-storage')
      const { existsSync, mkdtempSync, rmSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const sharp = (await import('sharp')).default
      const { events: eventsTable } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')

      const root = mkdtempSync(join(tmpdir(), 'el-del-'))
      process.env.UPLOAD_ROOT = root
      try {
        const user = await createTestUser(testDb, { email: 'fdel@test.com', name: 'FDel' })
        const evt = createTestEvent(testDb, user!.id, { invitationType: 'upload' })
        const buf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer()
        const saved = await saveImage(evt!.id, buf)
        await testDb.update(eventsTable).set({ customImagePath: saved.relativePath }).where(eq(eventsTable.id, evt!.id))

        const fullPath = imageAbsolutePath(saved.relativePath)
        expect(existsSync(fullPath)).toBe(true)

        const httpEv = authEvent(user!.id, user!.email, {
          method: 'DELETE',
          params: { id: String(evt!.id) },
        })
        const result = await deleteHandler(httpEv)
        expect(result).toEqual({ success: true })

        expect(existsSync(fullPath)).toBe(false)
        expect(existsSync(join(root, String(evt!.id)))).toBe(false)
      } finally {
        rmSync(root, { recursive: true, force: true })
        delete process.env.UPLOAD_ROOT
      }
    })

    it('succeeds when customImagePath file is already missing on disk', async () => {
      const { mkdtempSync, rmSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { events: eventsTable } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')

      const root = mkdtempSync(join(tmpdir(), 'el-del-'))
      process.env.UPLOAD_ROOT = root
      try {
        const user = await createTestUser(testDb, { email: 'fmissdel@test.com', name: 'FMissDel' })
        const evt = createTestEvent(testDb, user!.id, { invitationType: 'upload' })
        // Set a path that points to a file we never wrote
        await testDb.update(eventsTable).set({ customImagePath: `${evt!.id}/never-existed.jpg` }).where(eq(eventsTable.id, evt!.id))

        const httpEv = authEvent(user!.id, user!.email, {
          method: 'DELETE',
          params: { id: String(evt!.id) },
        })
        const result = await deleteHandler(httpEv)
        expect(result).toEqual({ success: true })
      } finally {
        rmSync(root, { recursive: true, force: true })
        delete process.env.UPLOAD_ROOT
      }
    })
```

- [ ] **Step 2: Run the new tests — they must fail**

Run:

```bash
npm run test -- server/api/__tests__/events.test.ts
```

Expected: the new "deletes the customImagePath file from disk and rmdirs the event dir" test fails because the file still exists after delete. (The "already missing" test may incidentally pass; that's fine.)

- [ ] **Step 3: Implement the cleanup in the DELETE handler**

Replace the entire contents of `server/api/events/[id].delete.ts` with:

```ts
import { rmdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { deleteImage, imageAbsolutePath } from '~/server/utils/image-storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  // Delete guests first (foreign key)
  await db.delete(guests).where(eq(guests.eventId, id))

  // Delete the event
  await db.delete(events).where(and(eq(events.id, id), eq(events.userId, user.id)))

  if (existing.customImagePath) {
    await deleteImage(existing.customImagePath).catch(() => {})
    const dirPath = dirname(imageAbsolutePath(existing.customImagePath))
    await rmdir(dirPath).catch(() => {})
  }

  return { success: true }
})
```

Notes:
- Errors from `deleteImage` and `rmdir` are swallowed: the DB is the source of truth and the API response should not depend on FS state. Same pattern as `server/api/events/[id].put.ts:51-53`.
- `rmdir` without `recursive` deliberately fails (and is silenced) if the directory still contains files — those leftovers are picked up by the cleanup script in later tasks.

- [ ] **Step 4: Run the tests — they pass**

Run:

```bash
npm run test -- server/api/__tests__/events.test.ts
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add server/api/events/\[id\].delete.ts server/api/__tests__/events.test.ts
git commit -m "fix(events): delete uploaded custom image when event is deleted"
```

---

## Task 2: Implement `cleanupOrphanImages` helper (orphan event-dirs)

**Files:**
- Create: `server/utils/cleanup-orphan-images.ts`
- Test: `server/utils/__tests__/cleanup-orphan-images.test.ts`

This task covers the first half of the cleanup logic: dropping directories whose event row no longer exists. Stale-file logic lands in Task 3.

- [ ] **Step 1: Write the failing test**

Create `server/utils/__tests__/cleanup-orphan-images.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDb, createTestUser, createTestEvent, type TestDb } from '../../__helpers__/db'
import { cleanupOrphanImages } from '../cleanup-orphan-images'

let testDb: TestDb
let testRoot: string

beforeEach(() => {
  testDb = createTestDb()
  testRoot = mkdtempSync(join(tmpdir(), 'eloria-cleanup-'))
  process.env.UPLOAD_ROOT = testRoot
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  delete process.env.UPLOAD_ROOT
})

function writeFakeUpload(eventId: number, filename: string, bytes = 'data') {
  const dir = join(testRoot, String(eventId))
  mkdirSync(dir, { recursive: true })
  const path = join(dir, filename)
  writeFileSync(path, bytes)
  return path
}

describe('cleanupOrphanImages', () => {
  it('removes directories whose event row does not exist', async () => {
    // Pre-condition: dir for event id 999 exists but no DB row
    const orphanFile = writeFakeUpload(999, 'a.jpg')
    expect(existsSync(orphanFile)).toBe(true)

    const result = await cleanupOrphanImages({ db: testDb })

    expect(existsSync(orphanFile)).toBe(false)
    expect(existsSync(join(testRoot, '999'))).toBe(false)
    expect(result.dirsDeleted).toBe(1)
    expect(result.filesDeleted).toBe(1)
    expect(result.bytesFreed).toBeGreaterThan(0)
    expect(result.dryRun).toBe(false)
  })

  it('returns zero counts when UPLOAD_ROOT is empty', async () => {
    const result = await cleanupOrphanImages({ db: testDb })
    expect(result).toEqual({ dirsDeleted: 0, filesDeleted: 0, bytesFreed: 0, dryRun: false })
  })

  it('returns zero counts when UPLOAD_ROOT does not exist', async () => {
    rmSync(testRoot, { recursive: true, force: true })
    const result = await cleanupOrphanImages({ db: testDb })
    expect(result).toEqual({ dirsDeleted: 0, filesDeleted: 0, bytesFreed: 0, dryRun: false })
  })

  it('skips non-numeric directory names', async () => {
    const dir = join(testRoot, 'not-a-number')
    mkdirSync(dir)
    writeFileSync(join(dir, 'x.jpg'), 'data')

    const result = await cleanupOrphanImages({ db: testDb })

    expect(existsSync(join(dir, 'x.jpg'))).toBe(true)
    expect(result.dirsDeleted).toBe(0)
    expect(result.filesDeleted).toBe(0)
  })

  it('leaves an existing event\'s directory untouched when no stale files', async () => {
    const user = await createTestUser(testDb, { email: 'k@test.com', name: 'K' })
    const evt = createTestEvent(testDb, user!.id, {})
    const dir = join(testRoot, String(evt!.id))
    mkdirSync(dir)
    // No files: cleanup should not rmdir an existing event's directory.

    const result = await cleanupOrphanImages({ db: testDb })

    expect(existsSync(dir)).toBe(true)
    expect(result.dirsDeleted).toBe(0)
    expect(result.filesDeleted).toBe(0)
  })

  it('dryRun does not delete the orphan directory', async () => {
    const orphanFile = writeFakeUpload(777, 'a.jpg')

    const result = await cleanupOrphanImages({ db: testDb, dryRun: true })

    expect(existsSync(orphanFile)).toBe(true)
    expect(result.dirsDeleted).toBe(1)
    expect(result.filesDeleted).toBe(1)
    expect(result.bytesFreed).toBeGreaterThan(0)
    expect(result.dryRun).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```bash
npm run test -- server/utils/__tests__/cleanup-orphan-images.test.ts
```

Expected: all tests fail with `Cannot find module '../cleanup-orphan-images'`.

- [ ] **Step 3: Implement the helper (orphan-dir half only)**

Create `server/utils/cleanup-orphan-images.ts`:

```ts
import { readdir, stat, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { events } from '~/server/db/schema'
import { getUploadRoot, imageAbsolutePath } from './image-storage'

export interface CleanupOptions {
  db: any  // drizzle DB instance with .select() — typed loosely so tests can pass a TestDb
  dryRun?: boolean
  graceMinutes?: number
}

export interface CleanupResult {
  dirsDeleted: number
  filesDeleted: number
  bytesFreed: number
  dryRun: boolean
}

export async function cleanupOrphanImages(opts: CleanupOptions): Promise<CleanupResult> {
  const { db, dryRun = false } = opts
  const root = getUploadRoot()

  let entries: string[]
  try {
    entries = await readdir(root)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { dirsDeleted: 0, filesDeleted: 0, bytesFreed: 0, dryRun }
    }
    throw err
  }

  const existingEventIds = new Set<number>(
    (await db.select({ id: events.id }).from(events)).map((r: { id: number }) => r.id),
  )

  let dirsDeleted = 0
  let filesDeleted = 0
  let bytesFreed = 0

  for (const entry of entries) {
    const eventId = Number.parseInt(entry, 10)
    if (!Number.isInteger(eventId) || String(eventId) !== entry) continue

    const dirPath = join(root, entry)
    const dirStat = await stat(dirPath).catch(() => null)
    if (!dirStat || !dirStat.isDirectory()) continue

    if (existingEventIds.has(eventId)) {
      // Stale-file pruning lands in Task 3.
      continue
    }

    // Orphan dir: delete every file, then rmdir.
    const files = await readdir(dirPath)
    for (const file of files) {
      const full = imageAbsolutePath(`${entry}/${file}`)
      const fileStat = await stat(full).catch(() => null)
      if (!fileStat || !fileStat.isFile()) continue
      bytesFreed += fileStat.size
      filesDeleted += 1
      if (!dryRun) {
        await unlink(full).catch(() => {})
      }
    }
    dirsDeleted += 1
    if (!dryRun) {
      await rmdir(dirPath).catch(() => {})
    }
  }

  return { dirsDeleted, filesDeleted, bytesFreed, dryRun }
}
```

- [ ] **Step 4: Run the tests — they pass**

Run:

```bash
npm run test -- server/utils/__tests__/cleanup-orphan-images.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/cleanup-orphan-images.ts server/utils/__tests__/cleanup-orphan-images.test.ts
git commit -m "feat(cleanup): add cleanupOrphanImages helper for orphan event dirs"
```

---

## Task 3: Extend `cleanupOrphanImages` to prune stale files in existing event dirs

**Files:**
- Modify: `server/utils/cleanup-orphan-images.ts`
- Modify: `server/utils/__tests__/cleanup-orphan-images.test.ts`

- [ ] **Step 1: Add the failing tests**

Append the following inside the `describe('cleanupOrphanImages', ...)` block in `server/utils/__tests__/cleanup-orphan-images.test.ts`, before its closing `})`:

```ts
  it('deletes a stale file in an existing event dir when older than the grace window', async () => {
    const { utimesSync } = await import('node:fs')
    const user = await createTestUser(testDb, { email: 's1@test.com', name: 'S1' })
    const evt = createTestEvent(testDb, user!.id, {})
    const { events: eventsTable } = await import('../../db/schema')
    const { eq } = await import('drizzle-orm')
    // Active path = "<evt.id>/active.jpg"
    await testDb.update(eventsTable).set({ customImagePath: `${evt!.id}/active.jpg` }).where(eq(eventsTable.id, evt!.id))

    const stalePath = writeFakeUpload(evt!.id, 'stale.jpg')
    const activePath = writeFakeUpload(evt!.id, 'active.jpg')

    // Backdate stale.jpg to 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    utimesSync(stalePath, twoHoursAgo, twoHoursAgo)

    const result = await cleanupOrphanImages({ db: testDb, graceMinutes: 60 })

    expect(existsSync(stalePath)).toBe(false)
    expect(existsSync(activePath)).toBe(true)
    expect(result.filesDeleted).toBe(1)
    expect(result.dirsDeleted).toBe(0)
    expect(result.bytesFreed).toBeGreaterThan(0)
  })

  it('skips a stale-named file whose mtime is inside the grace window', async () => {
    const user = await createTestUser(testDb, { email: 's2@test.com', name: 'S2' })
    const evt = createTestEvent(testDb, user!.id, {})
    const { events: eventsTable } = await import('../../db/schema')
    const { eq } = await import('drizzle-orm')
    await testDb.update(eventsTable).set({ customImagePath: `${evt!.id}/active.jpg` }).where(eq(eventsTable.id, evt!.id))

    const inFlightPath = writeFakeUpload(evt!.id, 'in-flight.jpg')
    // mtime is "now", inside default 60-min grace window

    const result = await cleanupOrphanImages({ db: testDb, graceMinutes: 60 })

    expect(existsSync(inFlightPath)).toBe(true)
    expect(result.filesDeleted).toBe(0)
  })

  it('never deletes the file at the row\'s customImagePath, even when stale', async () => {
    const { utimesSync } = await import('node:fs')
    const user = await createTestUser(testDb, { email: 's3@test.com', name: 'S3' })
    const evt = createTestEvent(testDb, user!.id, {})
    const { events: eventsTable } = await import('../../db/schema')
    const { eq } = await import('drizzle-orm')
    await testDb.update(eventsTable).set({ customImagePath: `${evt!.id}/active.jpg` }).where(eq(eventsTable.id, evt!.id))

    const activePath = writeFakeUpload(evt!.id, 'active.jpg')
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    utimesSync(activePath, longAgo, longAgo)

    const result = await cleanupOrphanImages({ db: testDb, graceMinutes: 60 })

    expect(existsSync(activePath)).toBe(true)
    expect(result.filesDeleted).toBe(0)
  })

  it('dryRun does not delete stale files', async () => {
    const { utimesSync } = await import('node:fs')
    const user = await createTestUser(testDb, { email: 's4@test.com', name: 'S4' })
    const evt = createTestEvent(testDb, user!.id, {})

    const stalePath = writeFakeUpload(evt!.id, 'stale.jpg')
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    utimesSync(stalePath, twoHoursAgo, twoHoursAgo)

    const result = await cleanupOrphanImages({ db: testDb, graceMinutes: 60, dryRun: true })

    expect(existsSync(stalePath)).toBe(true)
    expect(result.filesDeleted).toBe(1)
    expect(result.dryRun).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```bash
npm run test -- server/utils/__tests__/cleanup-orphan-images.test.ts
```

Expected: the four new tests fail (e.g. stale file is not deleted because the existing-event branch is currently a `continue`).

- [ ] **Step 3: Replace the helper with the full version**

Replace the entire contents of `server/utils/cleanup-orphan-images.ts` with:

```ts
import { readdir, stat, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { events } from '~/server/db/schema'
import { getUploadRoot, imageAbsolutePath } from './image-storage'

export interface CleanupOptions {
  db: any  // drizzle DB instance with .select() — typed loosely so tests can pass a TestDb
  dryRun?: boolean
  graceMinutes?: number
}

export interface CleanupResult {
  dirsDeleted: number
  filesDeleted: number
  bytesFreed: number
  dryRun: boolean
}

const DEFAULT_GRACE_MINUTES = 60

export async function cleanupOrphanImages(opts: CleanupOptions): Promise<CleanupResult> {
  const { db, dryRun = false, graceMinutes = DEFAULT_GRACE_MINUTES } = opts
  const root = getUploadRoot()
  const cutoffMs = Date.now() - graceMinutes * 60 * 1000

  let entries: string[]
  try {
    entries = await readdir(root)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { dirsDeleted: 0, filesDeleted: 0, bytesFreed: 0, dryRun }
    }
    throw err
  }

  const rows = await db.select({ id: events.id, customImagePath: events.customImagePath }).from(events)
  const eventActivePath = new Map<number, string | null>()
  for (const row of rows as Array<{ id: number; customImagePath: string | null }>) {
    eventActivePath.set(row.id, row.customImagePath)
  }

  let dirsDeleted = 0
  let filesDeleted = 0
  let bytesFreed = 0

  for (const entry of entries) {
    const eventId = Number.parseInt(entry, 10)
    if (!Number.isInteger(eventId) || String(eventId) !== entry) continue

    const dirPath = join(root, entry)
    const dirStat = await stat(dirPath).catch(() => null)
    if (!dirStat || !dirStat.isDirectory()) continue

    const exists = eventActivePath.has(eventId)

    if (!exists) {
      // Orphan dir: delete every file, then rmdir.
      const files = await readdir(dirPath)
      for (const file of files) {
        const full = imageAbsolutePath(`${entry}/${file}`)
        const fileStat = await stat(full).catch(() => null)
        if (!fileStat || !fileStat.isFile()) continue
        bytesFreed += fileStat.size
        filesDeleted += 1
        if (!dryRun) {
          await unlink(full).catch(() => {})
        }
      }
      dirsDeleted += 1
      if (!dryRun) {
        await rmdir(dirPath).catch(() => {})
      }
      continue
    }

    // Existing event: prune stale files (skip the active one and anything inside grace window).
    const activePath = eventActivePath.get(eventId)
    const files = await readdir(dirPath)
    for (const file of files) {
      const relPath = `${entry}/${file}`
      if (relPath === activePath) continue
      const full = imageAbsolutePath(relPath)
      const fileStat = await stat(full).catch(() => null)
      if (!fileStat || !fileStat.isFile()) continue
      if (fileStat.mtimeMs > cutoffMs) continue  // inside grace window
      bytesFreed += fileStat.size
      filesDeleted += 1
      if (!dryRun) {
        await unlink(full).catch(() => {})
      }
    }
  }

  return { dirsDeleted, filesDeleted, bytesFreed, dryRun }
}
```

- [ ] **Step 4: Run the tests — they pass**

Run:

```bash
npm run test -- server/utils/__tests__/cleanup-orphan-images.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/cleanup-orphan-images.ts server/utils/__tests__/cleanup-orphan-images.test.ts
git commit -m "feat(cleanup): prune stale files inside existing event dirs with grace period"
```

---

## Task 4: CLI script and `npm run cleanup:images`

**Files:**
- Create: `scripts/cleanup-orphan-images.ts`
- Modify: `package.json`

No tests — this is a thin shell that calls the helper. It is verified by manual smoke test in Task 5.

- [ ] **Step 1: Verify the `scripts/` directory state**

Run:

```bash
ls /home/jmg/projects/weddingplanner/scripts 2>&1 || echo "no scripts dir"
```

If the directory does not exist, create it:

```bash
mkdir -p /home/jmg/projects/weddingplanner/scripts
```

- [ ] **Step 2: Create the CLI script**

Create `scripts/cleanup-orphan-images.ts`:

```ts
import { db } from '~/server/db'
import { cleanupOrphanImages } from '~/server/utils/cleanup-orphan-images'
import { getUploadRoot } from '~/server/utils/image-storage'

interface ParsedArgs {
  dryRun: boolean
  graceMinutes: number
}

function parseArgs(argv: string[]): ParsedArgs {
  let dryRun = false
  let graceMinutes = 60
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg.startsWith('--grace-minutes=')) {
      const n = Number.parseInt(arg.slice('--grace-minutes='.length), 10)
      if (!Number.isInteger(n) || n < 0) {
        console.error(`Invalid --grace-minutes value: ${arg}`)
        process.exit(2)
      }
      graceMinutes = n
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: tsx scripts/cleanup-orphan-images.ts [--dry-run] [--grace-minutes=N]')
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return { dryRun, graceMinutes }
}

async function main() {
  const { dryRun, graceMinutes } = parseArgs(process.argv.slice(2))
  console.log(`UPLOAD_ROOT: ${getUploadRoot()}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no deletes)' : 'LIVE'}`)
  console.log(`Grace window: ${graceMinutes} minutes`)

  const result = await cleanupOrphanImages({ db, dryRun, graceMinutes })

  console.log('---')
  console.log(`Dirs ${dryRun ? 'would be ' : ''}deleted:  ${result.dirsDeleted}`)
  console.log(`Files ${dryRun ? 'would be ' : ''}deleted: ${result.filesDeleted}`)
  console.log(`Bytes ${dryRun ? 'would be ' : ''}freed:   ${result.bytesFreed}`)
}

main().catch((err) => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Add the npm script**

Read `package.json` and add `"cleanup:images": "tsx scripts/cleanup-orphan-images.ts"` to the `"scripts"` object. Place it next to the other `tsx`-based scripts. The diff (target lines around the existing `db:migrate`/`templates:screenshots` entries):

```diff
     "db:migrate": "tsx server/db/migrate.ts",
     "templates:screenshots": "tsx server/db/templates-screenshots.ts",
+    "cleanup:images": "tsx scripts/cleanup-orphan-images.ts",
     "test": "vitest run",
     "test:watch": "vitest"
```

- [ ] **Step 4: Verify the script parses flags and rejects bad input**

Run (using a temp UPLOAD_ROOT so the real one is never touched):

```bash
UPLOAD_ROOT=/tmp/eloria-cleanup-smoke npm run cleanup:images -- --help
```

Expected: usage string printed, exit 0.

```bash
UPLOAD_ROOT=/tmp/eloria-cleanup-smoke npm run cleanup:images -- --bogus
```

Expected: `Unknown argument: --bogus`, exit 2.

- [ ] **Step 5: Commit**

```bash
git add scripts/cleanup-orphan-images.ts package.json
git commit -m "feat(cleanup): add cleanup:images script for orphan image pruning"
```

---

## Task 5: End-to-end smoke test

This task does not write code — it confirms the script behaves correctly against a real (empty/synthetic) UPLOAD_ROOT, including dry-run.

- [ ] **Step 1: Set up a synthetic UPLOAD_ROOT**

Run:

```bash
SMOKE_ROOT=$(mktemp -d -t eloria-cleanup-smoke-XXXX)
echo "Using $SMOKE_ROOT"
mkdir -p "$SMOKE_ROOT/999"
echo "fake-jpeg" > "$SMOKE_ROOT/999/orphan.jpg"
ls -la "$SMOKE_ROOT/999"
```

Expected: `orphan.jpg` listed in `$SMOKE_ROOT/999/`.

(Event id `999` is chosen as one extremely unlikely to exist in the dev DB. If it does exist on your machine, pick a different number throughout.)

- [ ] **Step 2: Dry run — confirm no FS changes**

Run:

```bash
UPLOAD_ROOT="$SMOKE_ROOT" npm run cleanup:images -- --dry-run
ls -la "$SMOKE_ROOT/999" 2>&1
```

Expected: output reports `Dirs would be deleted: 1`, `Files would be deleted: 1`, `Bytes would be freed: > 0`. The file at `$SMOKE_ROOT/999/orphan.jpg` still exists.

- [ ] **Step 3: Live run — confirm orphan dir is gone**

Run:

```bash
UPLOAD_ROOT="$SMOKE_ROOT" npm run cleanup:images
ls -la "$SMOKE_ROOT/999" 2>&1 || echo "directory gone (expected)"
```

Expected: output reports `Dirs deleted: 1`, `Files deleted: 1`. `$SMOKE_ROOT/999/` no longer exists. `ls` reports "No such file or directory" or our explicit "directory gone" message.

- [ ] **Step 4: Re-run on empty root — zero counts**

Run:

```bash
UPLOAD_ROOT="$SMOKE_ROOT" npm run cleanup:images
```

Expected: `Dirs deleted: 0`, `Files deleted: 0`, `Bytes freed: 0`.

- [ ] **Step 5: Tear down**

Run:

```bash
rm -rf "$SMOKE_ROOT"
```

- [ ] **Step 6: Run the full test suite**

Run:

```bash
npm run test
```

Expected: full Vitest run is green. No previously-passing test regresses.

- [ ] **Step 7: No commit**

This task wrote no files. Nothing to commit.

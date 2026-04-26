# Orphan Custom-Invitation Image Cleanup — Design

**Date:** 2026-04-26
**Branch:** `feat/custom-invitation-upload`

## Problem

Custom invitation images uploaded by users are stored on the local filesystem at `<UPLOAD_ROOT>/<eventId>/<uuid>.jpg` (default `UPLOAD_ROOT=/var/lib/eloria/uploads`). The DB column `events.customImagePath` is the only authoritative reference.

Two leak paths exist today:

1. **Event deletion** — `server/api/events/[id].delete.ts` removes the event row but never calls `deleteImage()`. Files become true orphans (no DB reference).
2. **Stale uploads** — files inside an event's directory that aren't the row's current `customImagePath` (template-switch races, partial failures, etc.).

There is no cleanup job, no TTL, no expiry. Disk grows monotonically.

## Goals

- Files are removed from disk when their event is deleted.
- A standalone, ops-runnable script reclaims disk used by orphaned files.
- Cleanup is safe against in-flight uploads (grace period) and supports dry-run inspection before destructive runs.

## Non-Goals

- Admin API endpoint or in-app UI for cleanup. (Out of scope; can be added later if needed.)
- Scheduled cron wiring. The script is runnable manually or from an external scheduler; we are not adding a cron config in this change.
- Migration of historical orphans on first run is just a normal invocation — no special bootstrap path.

## Architecture

### 1. Wire `deleteImage()` into event delete

File: `server/api/events/[id].delete.ts`

After the DB rows are removed, if `existing.customImagePath` is set, call `deleteImage(existing.customImagePath)`. Errors are swallowed (DB is the source of truth — the same pattern used in `server/api/events/[id].put.ts:51-53` when clearing the image on template switch).

After the file is removed, attempt to `rmdir` the `<eventId>/` directory. If non-empty (shouldn't happen in normal flow but possible from prior orphans), leave it for the cleanup script.

### 2. Orphan-cleanup helper + CLI

#### Helper: `cleanupOrphanImages()` in `server/utils/image-storage.ts`

```ts
interface CleanupOptions {
  dryRun?: boolean       // default false
  graceMinutes?: number  // default 60
}

interface CleanupResult {
  dirsDeleted: number
  filesDeleted: number
  bytesFreed: number
  dryRun: boolean
}

export async function cleanupOrphanImages(opts?: CleanupOptions): Promise<CleanupResult>
```

#### CLI: `scripts/cleanup-orphan-images.ts`

A thin wrapper that parses CLI flags (`--dry-run`, `--grace-minutes=N`), invokes the helper, prints a human-readable summary, and exits with code 0 on success / 1 on error.

Wired into `package.json`:

```json
"scripts": {
  "cleanup:images": "tsx scripts/cleanup-orphan-images.ts"
}
```

(`tsx` matches the runner already used by `db:migrate` and `templates:screenshots` in `package.json`.)

### Cleanup algorithm

```
load all events with customImagePath set → Map<eventId, customImagePath>
load all event ids that exist → Set<eventId>
cutoff = now - graceMinutes * 60_000

for each entry in UPLOAD_ROOT (readdir, dirs only):
  eventId = parseInt(dirname); skip if NaN
  if eventId not in existing-event set:
    for each file in dir:
      delete file (or log if dry-run); accumulate bytes
    rmdir
    dirsDeleted++
  else:
    activePath = events[eventId]   // may be undefined if event has no custom image
    for each file in dir:
      relPath = `${eventId}/${file}`
      if activePath === relPath: skip
      if file.mtime > cutoff: skip   // grace period
      delete file (or log if dry-run); accumulate bytes
      filesDeleted++
    // do not rmdir an existing event's directory even if it ends up empty
```

Notes:
- The DB query is a single `SELECT id, customImagePath FROM events`. No streaming required at current scale.
- Path safety reuses `imageAbsolutePath()` to keep the existing path-traversal check.
- The grace check uses fs `mtime`. Newly-written files have mtime = write time, so an in-flight upload that finishes within the grace window is safe.

## Data Flow

```
User deletes event
  └─> [id].delete.ts
        ├─ db.delete(guests)
        ├─ db.delete(events)
        └─ deleteImage(existing.customImagePath)  ← new
            └─ rmdir(<eventId>/) if empty         ← new

Operator runs `npm run cleanup:images [--dry-run] [--grace-minutes=N]`
  └─> scripts/cleanup-orphan-images.ts
        └─ cleanupOrphanImages({ dryRun, graceMinutes })
            ├─ scan UPLOAD_ROOT
            ├─ join against DB
            └─ unlink/rmdir per algorithm
```

## Error Handling

- `deleteImage()` already handles `ENOENT` silently. The delete handler swallows other errors so the API response isn't affected by FS state.
- `cleanupOrphanImages()` continues on per-file errors, accumulating them into a returned `errors` list (logged by the CLI). A failure on one file does not abort the run.
- Missing `UPLOAD_ROOT` directory is treated as "nothing to clean" (returns zero counts), not an error.

## Testing

Extend existing test files — no new test scaffolding.

**`server/utils/__tests__/image-storage.test.ts`**
- `cleanupOrphanImages` deletes the directory of a non-existent event.
- Leaves the active `customImagePath` file untouched.
- Deletes stale files in an existing event's dir whose mtime is older than the grace window.
- Skips stale-looking files whose mtime is inside the grace window.
- `dryRun: true` logs/returns counts but mutates nothing.
- Returns accurate `dirsDeleted` / `filesDeleted` / `bytesFreed` counts.

**`server/api/__tests__/events.test.ts`**
- DELETE `/api/events/:id` removes the file at `customImagePath` from disk.
- DELETE removes the now-empty `<eventId>/` directory.
- DELETE succeeds even if the file is already missing on disk.

Tests use the existing test DB helper and a temp `UPLOAD_ROOT` (matching the pattern already used in `server/api/__tests__/custom-image.test.ts`).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Race with in-flight upload | 60-min default grace period on mtime |
| Path traversal via crafted dir name | Reuse `imageAbsolutePath()` which already rejects traversal |
| Accidental mass-delete during dev | `--dry-run` flag for inspection; defaults are conservative |
| DB and FS scan diverge mid-run | Acceptable — worst case is a leftover file picked up next run |

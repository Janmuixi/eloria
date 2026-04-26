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

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

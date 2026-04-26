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
})

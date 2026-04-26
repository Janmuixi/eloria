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

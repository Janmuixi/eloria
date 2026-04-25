import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb
let testRoot: string

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const uploadHandler = (await import('../events/[id]/custom-image.put')).default
const { createToken } = await import('../../utils/auth')

async function jpegBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 0, g: 200, b: 200 } } })
    .jpeg()
    .toBuffer()
}

function authedMultipart(userId: number, email: string, eventId: string, parts: Array<{ name: string; data: Buffer; filename?: string; type?: string }>) {
  const token = createToken({ userId, email })
  const ev = createMockEvent({
    method: 'PUT',
    cookies: { auth_token: token },
    params: { id: eventId },
  })
  ;(ev.context as any).__multipart = parts
  return ev
}

vi.mock('h3', async (orig) => {
  const actual = await orig<typeof import('h3')>()
  return {
    ...actual,
    readMultipartFormData: async (event: any) => event.context?.__multipart || null,
  }
})

beforeEach(() => {
  testDb = createTestDb()
  testRoot = mkdtempSync(join(tmpdir(), 'eloria-test-uploads-'))
  process.env.UPLOAD_ROOT = testRoot
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  delete process.env.UPLOAD_ROOT
})

describe('PUT /api/events/:id/custom-image', () => {
  it('rejects when not authenticated', async () => {
    const ev = createMockEvent({ method: 'PUT', params: { id: '1' } })
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects when event belongs to another user', async () => {
    const owner = await createTestUser(testDb, { email: 'owner@test.com', name: 'Owner' })
    const other = await createTestUser(testDb, { email: 'other@test.com', name: 'Other' })
    const evt = createTestEvent(testDb, owner!.id, {})
    const buf = await jpegBuffer()
    const ev = authedMultipart(other!.id, other!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 'test.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects when event is already paid', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, { paymentStatus: 'paid' })
    const buf = await jpegBuffer()
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 'test.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects unsupported MIME types', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: Buffer.from('PDF data'), filename: 'x.pdf', type: 'application/pdf' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 415 })
  })

  it('rejects HEIC with explicit message', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: Buffer.from('heic'), filename: 'p.heic', type: 'image/heic' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({
      statusCode: 415,
      statusMessage: expect.stringContaining('HEIC'),
    })
  })

  it('rejects files over 10MB', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0)
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: oversized, filename: 'big.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 413 })
  })

  it('saves image, sets invitationType=upload, clears templateId', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, { templateId: null })
    const buf = await jpegBuffer()
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 'test.jpg', type: 'image/jpeg' },
    ])
    const result = await uploadHandler(ev)
    expect(result.invitationType).toBe('upload')
    expect(result.customImagePath).toMatch(/^[0-9]+\/[0-9a-f-]+\.jpg$/)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)

    const reloaded = await testDb.query.events.findFirst({ where: (e: any, { eq }: any) => eq(e.id, evt!.id) })
    expect(reloaded?.invitationType).toBe('upload')
    expect(reloaded?.customImagePath).toBe(result.customImagePath)
    expect(reloaded?.templateId).toBeNull()
  })

  it('rejects bytes that are not a valid image with 400', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: Buffer.from('not-a-real-jpeg'), filename: 'fake.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('valid image'),
    })
  })

  it('replaces an existing upload (deletes old file)', async () => {
    const { existsSync } = await import('node:fs')
    const { imageAbsolutePath } = await import('../../utils/image-storage')
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const buf = await jpegBuffer()

    const ev1 = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 't.jpg', type: 'image/jpeg' },
    ])
    const first = await uploadHandler(ev1)
    expect(existsSync(imageAbsolutePath(first.customImagePath))).toBe(true)

    const ev2 = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 't2.jpg', type: 'image/jpeg' },
    ])
    const second = await uploadHandler(ev2)
    expect(second.customImagePath).not.toBe(first.customImagePath)
    expect(existsSync(imageAbsolutePath(first.customImagePath))).toBe(false)
    expect(existsSync(imageAbsolutePath(second.customImagePath))).toBe(true)
  })
})

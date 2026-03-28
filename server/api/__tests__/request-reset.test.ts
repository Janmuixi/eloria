import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestUser, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function (this: any) {
    this.emails = { send: vi.fn().mockResolvedValue({ id: 'mock' }) }
  }),
}))

vi.mock('~/server/utils/email', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
}))

const requestResetHandler = (await import('../auth/request-reset.post')).default

describe('POST /api/auth/request-reset', () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires email', async () => {
    const event = createMockEvent({
      method: 'POST',
      body: {},
    })

    await expect(requestResetHandler(event)).rejects.toThrow('Email is required')
  })

  it('returns 404 if email not found', async () => {
    const event = createMockEvent({
      method: 'POST',
      body: { email: 'nonexistent@example.com' },
    })

    await expect(requestResetHandler(event)).rejects.toThrow('If your email is registered')
  })

  it('generates token and updates database for valid user', async () => {
    const user = await createTestUser(testDb, {
      email: 'test-request-reset@example.com',
      name: 'Test User',
    })

    const event = createMockEvent({
      method: 'POST',
      body: { email: 'test-request-reset@example.com' },
    })

    const result = await requestResetHandler(event)

    expect(result.message).toContain('If your email is registered')

    const updatedUser = testDb.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.id, user.id),
    })

    expect((await updatedUser)?.resetToken).toBeTruthy()
    expect((await updatedUser)?.resetTokenExpiresAt).toBeTruthy()
  })

  it('normalizes email address', async () => {
    const user = await createTestUser(testDb, {
      email: 'test-normalize@example.com',
      name: 'Test User',
    })

    const event = createMockEvent({
      method: 'POST',
      body: { email: '  TEST-NORMALIZE@EXAMPLE.COM  ' },
    })

    const result = await requestResetHandler(event)

    expect(result.message).toContain('If your email is registered')

    const updatedUser = testDb.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.id, user.id),
    })

    expect((await updatedUser)?.resetToken).toBeTruthy()
  })
})

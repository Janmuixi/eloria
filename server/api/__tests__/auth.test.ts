import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
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

const registerHandler = (await import('../auth/register.post')).default
const loginHandler = (await import('../auth/login.post')).default
const logoutHandler = (await import('../auth/logout.post')).default
const meHandler = (await import('../auth/me.get')).default
const verifyHandler = (await import('../auth/verify.post')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('Auth API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('POST /api/auth/register', () => {
    it('registers a new user successfully', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'alice@example.com', password: 'password123', name: 'Alice Smith' },
      })

      const result = await registerHandler(event)

      expect(result.user).toBeDefined()
      expect(result.user.email).toBe('alice@example.com')
      expect(result.user.name).toBe('Alice Smith')
      expect(result.user.id).toBeTypeOf('number')
    })

    it('rejects duplicate email (409)', async () => {
      await createTestUser(testDb, { email: 'dup@example.com' })

      const event = createMockEvent({
        method: 'POST',
        body: { email: 'dup@example.com', password: 'password123', name: 'Dup User' },
      })

      await expect(registerHandler(event)).rejects.toMatchObject({
        statusCode: 409,
      })
    })

    it('rejects short password < 8 chars (400)', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'short@example.com', password: 'short', name: 'Short' },
      })

      await expect(registerHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('rejects missing fields (400)', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'missing@example.com' },
      })

      await expect(registerHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('normalizes email to lowercase', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'UPPER@EXAMPLE.COM', password: 'password123', name: 'Upper' },
      })

      const result = await registerHandler(event)

      expect(result.user.email).toBe('upper@example.com')
    })
  })

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      await createTestUser(testDb, {
        email: 'login@example.com',
        password: 'password123',
        name: 'Login User',
      })

      const event = createMockEvent({
        method: 'POST',
        body: { email: 'login@example.com', password: 'password123' },
      })

      const result = await loginHandler(event)

      expect(result.user).toBeDefined()
      expect(result.user.email).toBe('login@example.com')
      expect(result.user.name).toBe('Login User')
    })

    it('rejects wrong password (401)', async () => {
      await createTestUser(testDb, {
        email: 'wrong@example.com',
        password: 'correctpass',
      })

      const event = createMockEvent({
        method: 'POST',
        body: { email: 'wrong@example.com', password: 'wrongpass1' },
      })

      await expect(loginHandler(event)).rejects.toMatchObject({
        statusCode: 401,
      })
    })

    it('rejects nonexistent email (401)', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'noexist@example.com', password: 'password123' },
      })

      await expect(loginHandler(event)).rejects.toMatchObject({
        statusCode: 401,
      })
    })

    it('rejects missing fields (400)', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'only@example.com' },
      })

      await expect(loginHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('returns success: true', async () => {
      const event = createMockEvent({ method: 'POST' })

      const result = await logoutHandler(event)

      expect(result).toEqual({ success: true })
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns user when authenticated', async () => {
      const dbUser = await createTestUser(testDb, {
        email: 'me@example.com',
        name: 'Me User',
      })

      const event = authEvent(dbUser.id, dbUser.email)

      const result = await meHandler(event)

      expect(result.user).toBeDefined()
      expect(result.user.id).toBe(dbUser.id)
      expect(result.user.email).toBe('me@example.com')
      expect(result.user.name).toBe('Me User')
    })

    it('rejects unauthenticated (401)', async () => {
      const event = createMockEvent()

      await expect(meHandler(event)).rejects.toMatchObject({
        statusCode: 401,
      })
    })
  })

  describe('POST /api/auth/verify', () => {
    it('verifies email with valid token', async () => {
      const dbUser = await createTestUser(testDb, {
        email: 'verify@example.com',
        name: 'Verify User',
      })

      const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
      const token = jwt.sign(
        { email: dbUser.email, purpose: 'email-verification' },
        JWT_SECRET,
        { expiresIn: '24h' },
      )

      const event = createMockEvent({
        method: 'POST',
        body: { token },
      })

      const result = await verifyHandler(event)

      expect(result.message).toBe('Email verified successfully')
    })

    it('rejects missing token (400)', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: {},
      })

      await expect(verifyHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('rejects wrong purpose token (400)', async () => {
      const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
      const token = jwt.sign(
        { email: 'verify@example.com', purpose: 'password-reset' },
        JWT_SECRET,
        { expiresIn: '24h' },
      )

      const event = createMockEvent({
        method: 'POST',
        body: { token },
      })

      await expect(verifyHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })
})

# Password Reset Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add secure password reset feature allowing users to reset password via email link with token-based authentication

**Architecture:** Token-based password reset with 24-hour expiration. Three new API endpoints: request reset (generates token), reset password page (validates token), and update password (validates and updates database). Two new database fields on users table: resetToken and resetTokenExpiresAt.

**Tech Stack:** Nuxt 3, H3, Drizzle ORM, SQLite, TypeScript, Vitest, crypto utility

---

## Task 1: Add database schema fields for password reset

**Files:**
- Modify: `server/db/schema.ts`

**Step 1: Add reset token fields to users table**

Add to `users` table definition:
```typescript
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  createdAt: text('created_at').default(new Date().toISOString()),
})
```

**Step 2: Run database migration**

Run: `npx drizzle-kit generate:sqlite`
Expected: Migration SQL generated

**Step 3: Run migration to update database**

Run: `npx drizzle-kit push`
Expected: Database schema updated

**Step 4: Commit**

```bash
git add server/db/schema.ts
git add drizzle/migrations/*
git commit -m "schema: add reset token fields to users table"
```

---

## Task 2: Create token generation utility

**Files:**
- Create: `server/utils/reset-token.ts`

**Step 1: Write token generation utility**

```typescript
import crypto from 'crypto'

interface GenerateResetTokenParams {
  email: string
}

export interface ResetTokenResult {
  token: string
  expiresAt: Date
}

export function generateResetToken(params: GenerateResetTokenParams): ResetTokenResult {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  return {
    token,
    expiresAt,
  }
}
```

**Step 2: Write unit tests**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateResetToken } from '../reset-token'

describe('generateResetToken', () => {
  it('generates a 32-character hex token', () => {
    const result = generateResetToken({ email: 'test@example.com' })

    expect(result.token).toHaveLength(32)
    expect(result.token).toMatch(/^[0-9a-f]+$/)
  })

  it('sets expiration 24 hours in future', () => {
    const result = generateResetToken({ email: 'test@example.com' })
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(now)
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(now + twentyFourHours)
  })

  it('generates unique tokens each time', () => {
    const token1 = generateResetToken({ email: 'test@example.com' })
    const token2 = generateResetToken({ email: 'test@example.com' })

    expect(token1.token).not.toBe(token2.token)
  })
})
```

**Step 3: Run tests to verify they pass**

Run: `npm run test -- server/utils/__tests__/reset-token.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/utils/reset-token.ts
git add server/utils/__tests__/reset-token.test.ts
git commit -m "feat: add reset token generation utility with tests"
```

---

## Task 3: Create password reset request endpoint

**Files:**
- Create: `server/api/auth/request-reset.post.ts`

**Step 1: Write the endpoint handler**

```typescript
import { db } from '../../db'
import { users } from '../../db/schema'
import { generateResetToken } from '~/server/utils/reset-token'
import { sendVerificationEmail } from '~/server/utils/email'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email } = body || {}

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required',
    })
  }

  const normalizedEmail = email.toLowerCase().trim()

  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  })

  if (!user) {
    // Security: don't reveal whether email exists
    throw createError({
      statusCode: 404,
      statusMessage: 'If your email is registered, you can request a password reset link',
    })
  }

  const { token, expiresAt } = generateResetToken({ email: normalizedEmail })

  await db
    .update(users)
    .set({
      resetToken: token,
      resetTokenExpiresAt: expiresAt.toISOString(),
    })
    .where(eq(users.id, user.id))

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')

  await sendVerificationEmail({
    to: user.email,
    userName: user.name || 'User',
    verificationUrl: `${baseUrl}/reset-password?token=${token}`,
  })

  return {
    message: 'If your email is registered, you will receive a password reset link',
  }
})
```

**Step 2: Write unit tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

describe('POST /api/auth/request-reset', () => {
  beforeAll(() => {
    vi.resetModules()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('requires email', async () => {
    const response = await $fetch('/api/auth/request-reset', {
      method: 'POST',
      body: {},
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('Email is required')
  })

  it('returns 404 if email not found', async () => {
    const response = await $fetch('/api/auth/request-reset', {
      method: 'POST',
      body: { email: 'notfound@example.com' },
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.message).toContain('If your email is registered')
  })

  it('generates token and updates database', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
    })

    const response = await $fetch('/api/auth/request-reset', {
      method: 'POST',
      body: { email: 'test@example.com' },
    })

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, testUser.id),
    })

    expect(updatedUser.resetToken).toBeTruthy()
    expect(updatedUser.resetTokenExpiresAt).toBeTruthy()
    expect(response.status).toBe(200)
  })

  it('sends email with reset link', async () => {
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      BASE_URL: 'http://localhost:3000',
    })))

    vi.mock('~/server/utils/email', 'sendVerificationEmail')

    await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
    })

    const response = await $fetch('/api/auth/request-reset', {
      method: 'POST',
      body: { email: 'test@example.com' },
    })

    expect(sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        verificationUrl: expect.stringContaining('reset-password?token='),
      })
    )

    vi.unstubAllGlobals()
  })
})
```

**Step 3: Run tests to verify they pass**

Run: `npm run test -- server/api/__tests__/request-reset.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/api/auth/request-reset.post.ts
git add server/api/__tests__/request-reset.test.ts
git commit -m "feat: add password reset request endpoint with tests"
```

---

## Task 4: Create password reset page endpoint

**Files:**
- Create: `server/api/auth/reset-password.get.ts`

**Step 1: Write the page handler**

```typescript
import { db } from '../../db'
import { users } from '../../db/schema'
import { eq, lt, or } from 'drizzle-orm'
import { hashPassword } from '~/server/utils/password'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reset token is required',
    })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.resetToken, token),
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Invalid or expired reset link',
    })
  }

  const resetTokenExpiresAt = new Date(user.resetTokenExpiresAt || '')

  if (resetTokenExpiresAt && new Date(resetTokenExpiresAt) < new Date()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reset link has expired',
    })
  }

  // Clear the token after it's been viewed (one-time use)
  await db
    .update(users)
    .set({
      resetToken: null,
      resetTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id))

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  }
})
```

**Step 2: Write unit tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

describe('GET /api/auth/reset-password', () => {
  beforeAll(() => {
    vi.resetModules()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('requires token', async () => {
    const response = await $fetch('/api/auth/reset-password')
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('Reset token is required')
  })

  it('returns 404 for invalid token', async () => {
    const response = await $fetch('/api/auth/reset-password', {
      method: 'GET',
      query: { token: 'invalid' },
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.message).toContain('Invalid or expired reset link')
  })

  it('returns 404 for expired token', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'expired-token',
      resetTokenExpiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
    })

    const response = await $fetch('/api/auth/reset-password', {
      method: 'GET',
      query: { token: 'expired-token' },
    })

    expect(response.status).toBe(404)
  })

  it('clears token after viewing', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'test-token',
      resetTokenExpiresAt: new Date(Date.now() + 1000 * 1000).toISOString(), // 1 hour in future
    })

    const response = await $fetch('/api/auth/reset-password', {
      method: 'GET',
      query: { token: 'test-token' },
    })

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, testUser.id),
    })

    expect(updatedUser.resetToken).toBeNull()
    expect(updatedUser.resetTokenExpiresAt).toBeNull()
    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({ user: expect.objectContaining({ id: testUser.id }) }))
  })

  it('returns user data', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'test-token',
      resetTokenExpiresAt: new Date(Date.now() + 1000 * 1000).toISOString(),
    })

    const response = await $fetch('/api/auth/reset-password', {
      method: 'GET',
      query: { token: 'test-token' },
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.user).toEqual(expect.objectContaining({ id: testUser.id, email: testUser.email }))
  })
})
```

**Step 3: Run tests to verify they pass**

Run: `npm run test -- server/api/__tests__/reset-password.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/api/auth/reset-password.get.ts
git add server/api/__tests__/reset-password.test.ts
git commit -m "feat: add password reset page endpoint with tests"
```

---

## Task 5: Create password update endpoint

**Files:**
- Create: `server/api/auth/reset-password.post.ts`

**Step 1: Write the update endpoint handler**

```typescript
import { db } from '../../db'
import { users } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import { hashPassword } from '~/server/utils/password'
import { createToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token, newPassword } = body || {}

  if (!token || !newPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token and new password are required',
    })
  }

  if (newPassword.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
    })
  }

  const user = await db.query.users.findFirst({
    where: and(
      eq(users.resetToken, token),
      or(
        eq(users.resetTokenExpiresAt, null), // Token already used
        lt(users.resetTokenExpiresAt, new Date().toISOString()), // Token expired
      ),
    ),
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Invalid or expired reset link',
    })
  }

  const passwordHash = await hashPassword(newPassword)

  await db
    .update(users)
    .set({
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id))

  const newToken = createToken({ userId: user.id, email: user.email })

  // Return the token so user is logged in after password reset
  return {
    token: newToken,
  }
})
```

**Step 2: Write unit tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { eq, lt, or, and } from 'drizzle-orm'

describe('POST /api/auth/reset-password', () => {
  beforeAll(() => {
    vi.resetModules()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('requires token and new password', async () => {
    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: {},
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('Token and new password are required')
  })

  it('validates password length', async () => {
    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'valid-token', newPassword: 'short' },
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('Password must be at least 8 characters')
  })

  it('returns 404 for invalid token', async () => {
    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'invalid-token', newPassword: 'newpassword123' },
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.message).toContain('Invalid or expired reset link')
  })

  it('returns 404 for expired token', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'expired-token',
      resetTokenExpiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
    })

    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'expired-token', newPassword: 'newpassword123' },
    })

    expect(response.status).toBe(404)
  })

  it('returns 404 if token already used', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: null,
      resetTokenExpiresAt: null,
    })

    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'valid-token', newPassword: 'newpassword123' },
    })

    expect(response.status).toBe(404)
  })

  it('updates password and clears reset token', async () => {
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      passwordHash: 'old-hash',
      name: 'Test User',
      resetToken: 'test-token',
      resetTokenExpiresAt: new Date(Date.now() + 1000 * 1000).toISOString(),
    })

    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'test-token', newPassword: 'newpassword123' },
    })

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, testUser.id),
    })

    expect(updatedUser.passwordHash).not.toBe('old-hash')
    expect(updatedUser.resetToken).toBeNull()
    expect(updatedUser.resetTokenExpiresAt).toBeNull()
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.token).toBeTruthy()
  })
})
```

**Step 3: Run tests to verify they pass**

Run: `npm run test -- server/api/__tests__/reset-password-update.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/api/auth/reset-password.post.ts
git add server/api/__tests__/reset-password-update.test.ts
git commit -m "feat: add password update endpoint with tests"
```

---

## Task 6: Run full test suite

**Files:**
- No files to modify

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests PASS (including new password reset tests)

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run linter if configured**

Run: `npm run lint` (if exists in package.json)
Expected: No errors

**NOTE:** Do NOT commit - user will review changes first

---

## Summary

This plan adds a complete password reset feature with:
- Secure token-based authentication (24-hour expiration)
- Three new API endpoints
- Database schema migration
- Comprehensive test coverage
- One-time use tokens
- User authentication after password reset

All changes follow existing patterns in the codebase (H3, Drizzle ORM, TypeScript).

# Server Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive server-side test coverage for all API routes and utilities using Vitest with in-memory SQLite.

**Architecture:** Unit tests for server utilities (password, auth, email) with mocked externals. Integration tests for all 27 API route handlers against real in-memory SQLite databases. Each test file gets a fresh DB instance to prevent pollution.

**Tech Stack:** Vitest, better-sqlite3 (in-memory), h3 (mock events), vi.mock (Resend, Stripe, OpenAI, Puppeteer)

---

### Task 1: Install Vitest and Create Configuration

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install vitest**

Run: `npm install -D vitest`

**Step 2: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    setupFiles: ['./server/__helpers__/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
    },
  },
})
```

**Step 4: Verify vitest runs (will fail — no tests yet)**

Run: `npx vitest run`
Expected: "No test files found"

---

### Task 2: Create Test Helpers — Global Setup

**Files:**
- Create: `server/__helpers__/setup.ts`

**Step 1: Create setup file with h3 globals**

The API route handlers use Nuxt auto-imported h3 functions (`readBody`, `createError`, `getCookie`, etc.). These must be available as globals in the test environment.

```ts
import {
  defineEventHandler,
  createError,
  readBody,
  readRawBody,
  getCookie,
  setCookie,
  deleteCookie,
  getRouterParam,
  getQuery,
  getHeader,
  getRequestHeaders,
  setResponseHeaders,
  setResponseStatus,
} from 'h3'

const globals: Record<string, unknown> = {
  defineEventHandler,
  createError,
  readBody,
  readRawBody,
  getCookie,
  setCookie,
  deleteCookie,
  getRouterParam,
  getQuery,
  getHeader,
  getRequestHeaders,
  setResponseHeaders,
  setResponseStatus,
}

for (const [name, fn] of Object.entries(globals)) {
  ;(globalThis as Record<string, unknown>)[name] = fn
}
```

---

### Task 3: Create Test Helpers — Database

**Files:**
- Create: `server/__helpers__/db.ts`

**Step 1: Create the test DB factory**

Creates in-memory SQLite databases with the full schema, plus factory functions for seeding test data.

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { tiers, users, templates, events, guests } from '../db/schema'

export type TestDb = ReturnType<typeof createTestDb>

export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      guest_limit INTEGER,
      has_email_delivery INTEGER DEFAULT 0,
      has_pdf_export INTEGER DEFAULT 0,
      has_ai_text_generation INTEGER DEFAULT 0,
      remove_branding INTEGER DEFAULT 0,
      has_multiple_variants INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      preview_image_url TEXT NOT NULL,
      html_template TEXT NOT NULL,
      css_template TEXT NOT NULL,
      color_scheme TEXT NOT NULL,
      font_pairings TEXT NOT NULL,
      tags TEXT NOT NULL,
      minimum_tier_id INTEGER NOT NULL REFERENCES tiers(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      couple_name_1 TEXT NOT NULL,
      couple_name_2 TEXT NOT NULL,
      date TEXT NOT NULL,
      venue TEXT NOT NULL,
      venue_address TEXT NOT NULL,
      venue_map_url TEXT,
      description TEXT,
      template_id INTEGER REFERENCES templates(id),
      customization TEXT,
      tier_id INTEGER REFERENCES tiers(id),
      payment_status TEXT NOT NULL DEFAULT 'pending',
      stripe_payment_id TEXT,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      rsvp_status TEXT NOT NULL DEFAULT 'pending',
      plus_one INTEGER DEFAULT 0,
      plus_one_name TEXT,
      token TEXT NOT NULL UNIQUE,
      email_sent_at TEXT,
      email_opened_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  return drizzle(sqlite, { schema })
}

export function seedTiers(db: TestDb) {
  return db.insert(tiers).values([
    {
      name: 'Basic',
      slug: 'basic',
      price: 1500,
      sortOrder: 1,
      guestLimit: 50,
      hasEmailDelivery: false,
      hasPdfExport: false,
      hasAiTextGeneration: false,
      removeBranding: false,
      hasMultipleVariants: false,
    },
    {
      name: 'Premium',
      slug: 'premium',
      price: 3000,
      sortOrder: 2,
      guestLimit: 200,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: false,
    },
    {
      name: 'Pro',
      slug: 'pro',
      price: 4500,
      sortOrder: 3,
      guestLimit: null,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: true,
    },
  ])
}

export function seedTemplate(db: TestDb, tierId: number) {
  const [template] = db.insert(templates).values({
    name: 'Test Template',
    category: 'classic',
    previewImageUrl: '/test.png',
    htmlTemplate: '<div>{{coupleName1}} & {{coupleName2}}</div>',
    cssTemplate: 'body { font-family: serif; }',
    colorScheme: '{"primary":"#333"}',
    fontPairings: '{"heading":"serif"}',
    tags: '["classic","elegant"]',
    minimumTierId: tierId,
  }).returning()
  return template
}

export async function createTestUser(db: TestDb, overrides?: Partial<{
  email: string; name: string; password: string; emailVerified: boolean
}>) {
  const { hashPassword } = await import('../utils/password')
  const passwordHash = await hashPassword(overrides?.password || 'testpass123')
  const [user] = db.insert(users).values({
    email: overrides?.email || 'test@example.com',
    name: overrides?.name || 'Test User',
    passwordHash,
    emailVerified: overrides?.emailVerified ?? false,
  }).returning()
  return user
}

export function createTestEvent(db: TestDb, userId: number, overrides?: Partial<{
  title: string; coupleName1: string; coupleName2: string; date: string;
  venue: string; venueAddress: string; slug: string; tierId: number;
  templateId: number; paymentStatus: string; customization: string;
}>) {
  const [evt] = db.insert(events).values({
    userId,
    title: overrides?.title || 'Test Wedding',
    coupleName1: overrides?.coupleName1 || 'Alice',
    coupleName2: overrides?.coupleName2 || 'Bob',
    date: overrides?.date || '2026-06-15',
    venue: overrides?.venue || 'Grand Hotel',
    venueAddress: overrides?.venueAddress || '123 Main St',
    slug: overrides?.slug || `test-slug-${Math.random().toString(36).substring(2, 6)}`,
    tierId: overrides?.tierId ?? null,
    templateId: overrides?.templateId ?? null,
    paymentStatus: overrides?.paymentStatus || 'pending',
    customization: overrides?.customization ?? null,
  }).returning()
  return evt
}

export function createTestGuest(db: TestDb, eventId: number, overrides?: Partial<{
  name: string; email: string; phone: string; token: string;
  rsvpStatus: string; plusOne: boolean; plusOneName: string;
}>) {
  const [guest] = db.insert(guests).values({
    eventId,
    name: overrides?.name || 'Guest User',
    email: overrides?.email ?? 'guest@example.com',
    phone: overrides?.phone ?? null,
    token: overrides?.token || crypto.randomUUID(),
    rsvpStatus: overrides?.rsvpStatus || 'pending',
    plusOne: overrides?.plusOne ?? false,
    plusOneName: overrides?.plusOneName ?? null,
  }).returning()
  return guest
}
```

---

### Task 4: Create Test Helpers — Mock H3 Event

**Files:**
- Create: `server/__helpers__/event.ts`

**Step 1: Create the mock event factory**

```ts
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'

interface MockEventOptions {
  method?: string
  url?: string
  body?: unknown
  params?: Record<string, string>
  cookies?: Record<string, string>
  headers?: Record<string, string>
}

export function createMockEvent(options: MockEventOptions = {}) {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.method = options.method || 'GET'
  req.url = options.url || '/'
  req.headers = {}

  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      req.headers[key.toLowerCase()] = value
    }
  }

  if (options.cookies) {
    req.headers.cookie = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  if (options.body) {
    req.headers['content-type'] = 'application/json'
  }

  const res = new ServerResponse(req)
  const event = createEvent(req, res)

  // Pre-populate parsed body cache for readBody()
  if (options.body !== undefined) {
    ;(event as any)._body = options.body
  }

  // Set router params for getRouterParam()
  if (options.params) {
    event.context.params = options.params
  }

  return event
}
```

**Step 2: Run vitest to check helpers compile**

Run: `npx vitest run`
Expected: "No test files found" (no tests yet, but no compile errors)

**Step 3: Commit**

```
git add -A && git commit -m "test: add vitest config and test helpers (db, event, setup)"
```

---

### Task 5: Utility Tests — password.test.ts

**Files:**
- Create: `server/utils/__tests__/password.test.ts`

**Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('password utils', () => {
  it('hashPassword returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mysecretpass')
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('mysecretpass')
    const result = await verifyPassword('mysecretpass', hash)
    expect(result).toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('mysecretpass')
    const result = await verifyPassword('wrongpassword', hash)
    expect(result).toBe(false)
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/utils/__tests__/password.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add password utility tests"
```

---

### Task 6: Utility Tests — auth.test.ts

**Files:**
- Create: `server/utils/__tests__/auth.test.ts`

**Step 1: Write the tests**

Tests `createToken` and `verifyToken` (pure JWT functions — no DB needed). Tests `requireAuth` with a mocked DB.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDb, createTestUser, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

// Import AFTER mock setup (vitest hoists vi.mock)
const { createToken, verifyToken, getAuthUser, requireAuth } = await import('../auth')

describe('auth utils', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('createToken / verifyToken', () => {
    it('round-trips a payload', () => {
      const token = createToken({ userId: 1, email: 'a@b.com' })
      const payload = verifyToken(token)
      expect(payload.userId).toBe(1)
      expect(payload.email).toBe('a@b.com')
    })

    it('rejects a tampered token', () => {
      const token = createToken({ userId: 1, email: 'a@b.com' })
      expect(() => verifyToken(token + 'x')).toThrow()
    })
  })

  describe('getAuthUser', () => {
    it('returns null when no cookie', async () => {
      const event = createMockEvent()
      const user = await getAuthUser(event)
      expect(user).toBeNull()
    })

    it('returns user when valid cookie', async () => {
      const user = await createTestUser(testDb)
      const token = createToken({ userId: user.id, email: user.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      const result = await getAuthUser(event)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(user.id)
    })

    it('returns null for invalid token', async () => {
      const event = createMockEvent({ cookies: { auth_token: 'garbage' } })
      const result = await getAuthUser(event)
      expect(result).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('throws 401 when no user', async () => {
      const event = createMockEvent()
      await expect(requireAuth(event)).rejects.toMatchObject({
        statusCode: 401,
      })
    })

    it('returns user when authenticated', async () => {
      const user = await createTestUser(testDb)
      const token = createToken({ userId: user.id, email: user.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      const result = await requireAuth(event)
      expect(result.id).toBe(user.id)
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/utils/__tests__/auth.test.ts`
Expected: 6 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add auth utility tests"
```

---

### Task 7: Utility Tests — email.test.ts

**Files:**
- Create: `server/utils/__tests__/email.test.ts`

**Step 1: Write the tests**

Mock the `resend` npm package to avoid real API calls.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn().mockResolvedValue({ id: 'mock-id' })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

describe('email utils', () => {
  const originalEnv = process.env.RESEND_API_KEY

  beforeEach(() => {
    mockSend.mockClear()
    // Reset the module singleton between tests
    vi.resetModules()
    process.env.RESEND_API_KEY = 're_test_key'
  })

  afterEach(() => {
    process.env.RESEND_API_KEY = originalEnv
  })

  it('sendVerificationEmail calls Resend with correct params', async () => {
    const { sendVerificationEmail } = await import('../email')
    await sendVerificationEmail({
      to: 'user@example.com',
      userName: 'Alice',
      verificationUrl: 'https://example.com/verify?token=abc',
    })

    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe('Eloria <noreply@muixisoftware.tech>')
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toBe('Verify your email - Eloria')
    expect(call.html).toContain('Alice')
    expect(call.html).toContain('https://example.com/verify?token=abc')
  })

  it('sendInvitationEmail calls Resend with correct params', async () => {
    const { sendInvitationEmail } = await import('../email')
    await sendInvitationEmail({
      to: 'guest@example.com',
      guestName: 'Charlie',
      coupleName1: 'Alice',
      coupleName2: 'Bob',
      date: 'June 15, 2026',
      invitationUrl: 'https://example.com/i/test-slug',
    })

    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe('Eloria <invitations@muixisoftware.tech>')
    expect(call.to).toBe('guest@example.com')
    expect(call.subject).toContain('Alice')
    expect(call.subject).toContain('Bob')
    expect(call.html).toContain('Charlie')
    expect(call.html).toContain('https://example.com/i/test-slug')
  })

  it('throws when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY
    const { sendVerificationEmail } = await import('../email')
    await expect(
      sendVerificationEmail({
        to: 'user@example.com',
        userName: 'Alice',
        verificationUrl: 'https://example.com/verify',
      }),
    ).rejects.toThrow('RESEND_API_KEY is not configured')
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/utils/__tests__/email.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add email utility tests"
```

---

### Task 8: API Tests — auth.test.ts

**Files:**
- Create: `server/api/__tests__/auth.test.ts`

**Step 1: Write the tests**

Tests register, login, logout, me, send-verification, and verify endpoints.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDb, createTestUser, seedTiers, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { createToken } from '../../utils/auth'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: 'mock' }) },
  })),
}))

const registerHandler = (await import('../auth/register.post')).default
const loginHandler = (await import('../auth/login.post')).default
const logoutHandler = (await import('../auth/logout.post')).default
const meHandler = (await import('../auth/me.get')).default
const sendVerificationHandler = (await import('../auth/send-verification.post')).default
const verifyHandler = (await import('../auth/verify.post')).default

describe('Auth API', () => {
  beforeEach(() => {
    testDb = createTestDb()
    seedTiers(testDb)
  })

  describe('POST /api/auth/register', () => {
    it('registers a new user and sets cookie', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'new@example.com', password: 'password123', name: 'New User' },
      })
      const result = await registerHandler(event)
      expect(result.user.email).toBe('new@example.com')
      expect(result.user.name).toBe('New User')
    })

    it('rejects duplicate email', async () => {
      await createTestUser(testDb, { email: 'dup@example.com' })
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'dup@example.com', password: 'password123', name: 'Dup' },
      })
      await expect(registerHandler(event)).rejects.toMatchObject({ statusCode: 409 })
    })

    it('rejects short password', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'new@example.com', password: 'short', name: 'Test' },
      })
      await expect(registerHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })

    it('rejects missing fields', async () => {
      const event = createMockEvent({ method: 'POST', body: { email: 'a@b.com' } })
      await expect(registerHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })

    it('normalizes email to lowercase', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'UPPER@Example.COM', password: 'password123', name: 'Test' },
      })
      const result = await registerHandler(event)
      expect(result.user.email).toBe('upper@example.com')
    })
  })

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      await createTestUser(testDb, { email: 'user@example.com', password: 'password123' })
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'user@example.com', password: 'password123' },
      })
      const result = await loginHandler(event)
      expect(result.user.email).toBe('user@example.com')
    })

    it('rejects wrong password', async () => {
      await createTestUser(testDb, { email: 'user@example.com', password: 'password123' })
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'user@example.com', password: 'wrongpass' },
      })
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('rejects nonexistent email', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: { email: 'nobody@example.com', password: 'password123' },
      })
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('rejects missing fields', async () => {
      const event = createMockEvent({ method: 'POST', body: {} })
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('returns success', async () => {
      const event = createMockEvent({ method: 'POST' })
      const result = await logoutHandler(event)
      expect(result.success).toBe(true)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns user when authenticated', async () => {
      const user = await createTestUser(testDb)
      const token = createToken({ userId: user.id, email: user.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      const result = await meHandler(event)
      expect(result.user.id).toBe(user.id)
      expect(result.user.email).toBe(user.email)
    })

    it('rejects unauthenticated request', async () => {
      const event = createMockEvent()
      await expect(meHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })
  })

  describe('POST /api/auth/verify', () => {
    it('verifies email with valid token', async () => {
      const user = await createTestUser(testDb, { email: 'verify@example.com' })
      const jwt = await import('jsonwebtoken')
      const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
      const token = jwt.default.sign(
        { email: user.email, purpose: 'email-verification' },
        secret,
        { expiresIn: '24h' },
      )
      const event = createMockEvent({ method: 'POST', body: { token } })
      const result = await verifyHandler(event)
      expect(result.message).toBe('Email verified successfully')
    })

    it('rejects missing token', async () => {
      const event = createMockEvent({ method: 'POST', body: {} })
      await expect(verifyHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })

    it('rejects wrong purpose token', async () => {
      const jwt = await import('jsonwebtoken')
      const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
      const token = jwt.default.sign({ email: 'a@b.com', purpose: 'password-reset' }, secret)
      const event = createMockEvent({ method: 'POST', body: { token } })
      await expect(verifyHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/auth.test.ts`
Expected: 13 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add auth API route tests"
```

---

### Task 9: API Tests — events.test.ts

**Files:**
- Create: `server/api/__tests__/events.test.ts`

**Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTestDb, createTestUser, createTestEvent, createTestGuest,
  seedTiers, seedTemplate, type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { createToken } from '../../utils/auth'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const listHandler = (await import('../events/index.get')).default
const createHandler = (await import('../events/index.post')).default
const getHandler = (await import('../events/[id]/index.get')).default
const updateHandler = (await import('../events/[id].put')).default
const deleteHandler = (await import('../events/[id].delete')).default

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token, ...overrides?.cookies } })
}

describe('Events API', () => {
  let user: any

  beforeEach(async () => {
    testDb = createTestDb()
    seedTiers(testDb)
    user = await createTestUser(testDb)
  })

  describe('GET /api/events', () => {
    it('lists only own events', async () => {
      const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
      createTestEvent(testDb, user.id, { title: 'My Wedding' })
      createTestEvent(testDb, otherUser.id, { title: 'Their Wedding' })

      const event = authEvent(user.id, user.email)
      const result = await listHandler(event)
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('My Wedding')
    })

    it('returns empty array when no events', async () => {
      const event = authEvent(user.id, user.email)
      const result = await listHandler(event)
      expect(result).toEqual([])
    })
  })

  describe('POST /api/events', () => {
    it('creates an event with auto-generated slug', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: {
          title: 'Our Wedding',
          coupleName1: 'Alice',
          coupleName2: 'Bob',
          date: '2026-06-15',
          venue: 'Grand Hotel',
          venueAddress: '123 Main St',
        },
      })
      const result = await createHandler(event)
      expect(result.title).toBe('Our Wedding')
      expect(result.slug).toMatch(/^alice-and-bob-[a-z0-9]{4}$/)
      expect(result.userId).toBe(user.id)
    })

    it('rejects missing required fields', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { title: 'Incomplete' },
      })
      await expect(createHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('GET /api/events/:id', () => {
    it('returns event with relations', async () => {
      const tiers = testDb.query.tiers.findMany()
      const template = seedTemplate(testDb, tiers[0].id)
      const evt = createTestEvent(testDb, user.id, {
        tierId: tiers[0].id,
        templateId: template.id,
      })

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const result = await getHandler(event)
      expect(result.id).toBe(evt.id)
      expect(result.tier).toBeDefined()
      expect(result.template).toBeDefined()
    })

    it('rejects access to another user event', async () => {
      const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
      const evt = createTestEvent(testDb, otherUser.id)

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      await expect(getHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('PUT /api/events/:id', () => {
    it('updates event fields', async () => {
      const evt = createTestEvent(testDb, user.id, { title: 'Old Title' })
      const event = authEvent(user.id, user.email, {
        method: 'PUT',
        params: { id: String(evt.id) },
        body: { title: 'New Title' },
      })
      const result = await updateHandler(event)
      expect(result.title).toBe('New Title')
    })

    it('rejects update of another user event', async () => {
      const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
      const evt = createTestEvent(testDb, otherUser.id)
      const event = authEvent(user.id, user.email, {
        method: 'PUT',
        params: { id: String(evt.id) },
        body: { title: 'Hacked' },
      })
      await expect(updateHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('DELETE /api/events/:id', () => {
    it('deletes event and its guests', async () => {
      const evt = createTestEvent(testDb, user.id)
      createTestGuest(testDb, evt.id, { name: 'Guest 1' })
      createTestGuest(testDb, evt.id, { name: 'Guest 2' })

      const event = authEvent(user.id, user.email, {
        method: 'DELETE',
        params: { id: String(evt.id) },
      })
      const result = await deleteHandler(event)
      expect(result.success).toBe(true)

      // Verify event and guests are gone
      const events = testDb.query.events.findMany()
      const guests = testDb.query.guests.findMany()
      expect(events).toHaveLength(0)
      expect(guests).toHaveLength(0)
    })

    it('rejects delete of another user event', async () => {
      const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
      const evt = createTestEvent(testDb, otherUser.id)
      const event = authEvent(user.id, user.email, {
        method: 'DELETE',
        params: { id: String(evt.id) },
      })
      await expect(deleteHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/events.test.ts`
Expected: 9 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add events API route tests"
```

---

### Task 10: API Tests — guests.test.ts

**Files:**
- Create: `server/api/__tests__/guests.test.ts`

**Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTestDb, createTestUser, createTestEvent, createTestGuest,
  seedTiers, type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { createToken } from '../../utils/auth'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const listGuestsHandler = (await import('../events/[id]/guests/index.get')).default
const addGuestHandler = (await import('../events/[id]/guests/index.post')).default
const deleteGuestHandler = (await import('../events/[id]/guests/[guestId].delete')).default
const importGuestsHandler = (await import('../events/[id]/guests/import.post')).default

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token, ...overrides?.cookies } })
}

describe('Guests API', () => {
  let user: any
  let evt: any

  beforeEach(async () => {
    testDb = createTestDb()
    seedTiers(testDb)
    user = await createTestUser(testDb)
    evt = createTestEvent(testDb, user.id)
  })

  describe('GET /api/events/:id/guests', () => {
    it('lists guests for an event', async () => {
      createTestGuest(testDb, evt.id, { name: 'Guest 1' })
      createTestGuest(testDb, evt.id, { name: 'Guest 2' })

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const result = await listGuestsHandler(event)
      expect(result).toHaveLength(2)
    })

    it('rejects access to another user event guests', async () => {
      const other = await createTestUser(testDb, { email: 'other@example.com' })
      const otherEvt = createTestEvent(testDb, other.id)
      const event = authEvent(user.id, user.email, { params: { id: String(otherEvt.id) } })
      await expect(listGuestsHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('POST /api/events/:id/guests', () => {
    it('adds a guest with a generated token', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { name: 'New Guest', email: 'new@guest.com' },
      })
      const result = await addGuestHandler(event)
      expect(result.name).toBe('New Guest')
      expect(result.email).toBe('new@guest.com')
      expect(result.token).toBeDefined()
      expect(result.token.length).toBeGreaterThan(0)
    })

    it('rejects missing guest name', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { email: 'no-name@guest.com' },
      })
      await expect(addGuestHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('DELETE /api/events/:id/guests/:guestId', () => {
    it('deletes a guest', async () => {
      const guest = createTestGuest(testDb, evt.id)
      const event = authEvent(user.id, user.email, {
        method: 'DELETE',
        params: { id: String(evt.id), guestId: String(guest.id) },
      })
      const result = await deleteGuestHandler(event)
      expect(result.success).toBe(true)
    })

    it('rejects deleting nonexistent guest', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'DELETE',
        params: { id: String(evt.id), guestId: '9999' },
      })
      await expect(deleteGuestHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('POST /api/events/:id/guests/import', () => {
    it('imports guests from CSV', async () => {
      const csv = 'Alice,alice@example.com\nBob,bob@example.com\nCharlie'
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { csv },
      })
      const result = await importGuestsHandler(event)
      expect(result.imported).toBe(3)

      const guests = testDb.query.guests.findMany()
      expect(guests).toHaveLength(3)
      expect(guests.find((g: any) => g.name === 'Charlie')?.email).toBeNull()
    })

    it('rejects empty CSV', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { csv: '' },
      })
      await expect(importGuestsHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/guests.test.ts`
Expected: 7 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add guests API route tests"
```

---

### Task 11: API Tests — rsvp.test.ts

**Files:**
- Create: `server/api/__tests__/rsvp.test.ts`

**Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTestDb, createTestUser, createTestEvent, createTestGuest,
  seedTiers, type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const getHandler = (await import('../rsvp/[token].get')).default
const postHandler = (await import('../rsvp/[token].post')).default

describe('RSVP API', () => {
  let guest: any

  beforeEach(async () => {
    testDb = createTestDb()
    seedTiers(testDb)
    const user = await createTestUser(testDb)
    const evt = createTestEvent(testDb, user.id)
    guest = createTestGuest(testDb, evt.id, { token: 'test-rsvp-token' })
  })

  describe('GET /api/rsvp/:token', () => {
    it('returns guest RSVP data', async () => {
      const event = createMockEvent({ params: { token: 'test-rsvp-token' } })
      const result = await getHandler(event)
      expect(result.name).toBe(guest.name)
      expect(result.rsvpStatus).toBe('pending')
    })

    it('rejects invalid token', async () => {
      const event = createMockEvent({ params: { token: 'nonexistent' } })
      await expect(getHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('POST /api/rsvp/:token', () => {
    it('confirms RSVP', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'test-rsvp-token' },
        body: { rsvpStatus: 'confirmed' },
      })
      const result = await postHandler(event)
      expect(result.success).toBe(true)
      expect(result.rsvpStatus).toBe('confirmed')
    })

    it('declines RSVP', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'test-rsvp-token' },
        body: { rsvpStatus: 'declined' },
      })
      const result = await postHandler(event)
      expect(result.rsvpStatus).toBe('declined')
    })

    it('handles plus-one', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'test-rsvp-token' },
        body: { rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner' },
      })
      await postHandler(event)

      const updated = testDb.query.guests.findFirst({
        where: (g: any, { eq }: any) => eq(g.token, 'test-rsvp-token'),
      })
      expect(updated?.plusOne).toBe(true)
      expect(updated?.plusOneName).toBe('Partner')
    })

    it('clears plus-one name when plusOne is false', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'test-rsvp-token' },
        body: { rsvpStatus: 'confirmed', plusOne: false, plusOneName: 'Should be cleared' },
      })
      await postHandler(event)

      const updated = testDb.query.guests.findFirst({
        where: (g: any, { eq }: any) => eq(g.token, 'test-rsvp-token'),
      })
      expect(updated?.plusOneName).toBeNull()
    })

    it('rejects invalid RSVP status', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'test-rsvp-token' },
        body: { rsvpStatus: 'invalid' },
      })
      await expect(postHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })

    it('rejects nonexistent token', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'nonexistent' },
        body: { rsvpStatus: 'confirmed' },
      })
      await expect(postHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/rsvp.test.ts`
Expected: 7 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add RSVP API route tests"
```

---

### Task 12: API Tests — invitations.test.ts

**Files:**
- Create: `server/api/__tests__/invitations.test.ts`

**Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTestDb, createTestUser, createTestEvent,
  seedTiers, seedTemplate, type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const handler = (await import('../invitations/[slug].get')).default

describe('Invitations API', () => {
  beforeEach(async () => {
    testDb = createTestDb()
    seedTiers(testDb)
  })

  it('returns paid invitation data with template', async () => {
    const user = await createTestUser(testDb)
    const tiersList = testDb.query.tiers.findMany()
    const premiumTier = tiersList.find((t: any) => t.slug === 'premium')!
    const template = seedTemplate(testDb, premiumTier.id)
    const evt = createTestEvent(testDb, user.id, {
      slug: 'alice-and-bob-1234',
      paymentStatus: 'paid',
      tierId: premiumTier.id,
      templateId: template.id,
    })

    const event = createMockEvent({ params: { slug: 'alice-and-bob-1234' } })
    const result = await handler(event)
    expect(result.coupleName1).toBe('Alice')
    expect(result.coupleName2).toBe('Bob')
    expect(result.template).toBeDefined()
    expect(result.removeBranding).toBe(true)
  })

  it('rejects unpaid event (returns 404)', async () => {
    const user = await createTestUser(testDb)
    createTestEvent(testDb, user.id, { slug: 'unpaid-event', paymentStatus: 'pending' })

    const event = createMockEvent({ params: { slug: 'unpaid-event' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects nonexistent slug', async () => {
    const event = createMockEvent({ params: { slug: 'nonexistent' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/invitations.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add invitations API route tests"
```

---

### Task 13: API Tests — payments.test.ts

**Files:**
- Create: `server/api/__tests__/payments.test.ts`

**Step 1: Write the tests**

Mock Stripe to avoid real API calls. Test the business logic: ownership checks, payment status updates, webhook handling.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createTestDb, createTestUser, createTestEvent, seedTiers, type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { createToken } from '../../utils/auth'

let testDb: TestDb
const originalEnv = { ...process.env }

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const mockCheckoutCreate = vi.fn().mockResolvedValue({
  url: 'https://checkout.stripe.com/test',
  id: 'cs_test_123',
})

const mockSessionRetrieve = vi.fn()

const mockConstructEvent = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutCreate,
        retrieve: mockSessionRetrieve,
      },
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
}))

const createCheckoutHandler = (await import('../payments/create-checkout.post')).default
const verifyHandler = (await import('../payments/verify.post')).default
const webhookHandler = (await import('../payments/webhook.post')).default

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token, ...overrides?.cookies } })
}

describe('Payments API', () => {
  let user: any
  let evt: any

  beforeEach(async () => {
    testDb = createTestDb()
    seedTiers(testDb)
    user = await createTestUser(testDb)
    evt = createTestEvent(testDb, user.id)
    process.env.STRIPE_SECRET_KEY = 'sk_test_real_key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.BASE_URL = 'http://localhost:3000'
    mockCheckoutCreate.mockClear()
    mockSessionRetrieve.mockClear()
    mockConstructEvent.mockClear()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('POST /api/payments/create-checkout', () => {
    it('creates a Stripe checkout session', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { eventId: evt.id, tierSlug: 'premium' },
      })
      const result = await createCheckoutHandler(event)
      expect(result.url).toBe('https://checkout.stripe.com/test')
      expect(mockCheckoutCreate).toHaveBeenCalledOnce()
    })

    it('rejects nonexistent event', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { eventId: 9999, tierSlug: 'premium' },
      })
      await expect(createCheckoutHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('rejects invalid tier slug', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { eventId: evt.id, tierSlug: 'nonexistent' },
      })
      await expect(createCheckoutHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('POST /api/payments/verify', () => {
    it('marks event as paid when Stripe confirms payment', async () => {
      mockSessionRetrieve.mockResolvedValue({
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: { eventId: String(evt.id), tierId: '1' },
      })

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { sessionId: 'cs_test_123', eventId: evt.id },
      })
      const result = await verifyHandler(event)
      expect(result.status).toBe('paid')

      const updated = testDb.query.events.findFirst()
      expect(updated?.paymentStatus).toBe('paid')
    })

    it('returns existing paid status without calling Stripe', async () => {
      // Set event to already paid
      const { events } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')
      testDb.update(events).set({ paymentStatus: 'paid' }).where(eq(events.id, evt.id)).run()

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { sessionId: 'cs_test_123', eventId: evt.id },
      })
      const result = await verifyHandler(event)
      expect(result.status).toBe('paid')
      expect(mockSessionRetrieve).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/payments/webhook', () => {
    it('processes checkout.session.completed event', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { eventId: String(evt.id), tierId: '2' },
            payment_intent: 'pi_test_webhook',
          },
        },
      })

      const event = createMockEvent({
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
      })
      // readRawBody needs special handling — set raw body
      ;(event as any)._body = 'raw-webhook-body'

      const result = await webhookHandler(event)
      expect(result.received).toBe(true)

      const updated = testDb.query.events.findFirst()
      expect(updated?.paymentStatus).toBe('paid')
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/payments.test.ts`
Expected: 6 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add payments API route tests"
```

---

### Task 14: API Tests — templates.test.ts and tiers.test.ts

**Files:**
- Create: `server/api/__tests__/templates.test.ts`
- Create: `server/api/__tests__/tiers.test.ts`

**Step 1: Write templates tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDb, seedTiers, seedTemplate, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const handler = (await import('../templates/index.get')).default

describe('Templates API', () => {
  beforeEach(() => {
    testDb = createTestDb()
    seedTiers(testDb)
  })

  it('lists all templates', async () => {
    const tiers = testDb.query.tiers.findMany()
    seedTemplate(testDb, tiers[0].id)

    const event = createMockEvent({ url: '/api/templates' })
    const result = await handler(event)
    expect(result).toHaveLength(1)
    expect(result[0].tier).toBeDefined()
  })

  it('filters by category', async () => {
    const tiers = testDb.query.tiers.findMany()
    seedTemplate(testDb, tiers[0].id) // category: 'classic'

    // Add a template with different category
    const { templates } = await import('../../db/schema')
    testDb.insert(templates).values({
      name: 'Modern Template',
      category: 'modern',
      previewImageUrl: '/modern.png',
      htmlTemplate: '<div>Modern</div>',
      cssTemplate: 'body {}',
      colorScheme: '{}',
      fontPairings: '{}',
      tags: '[]',
      minimumTierId: tiers[0].id,
    }).run()

    const event = createMockEvent({ url: '/api/templates?category=modern' })
    const result = await handler(event)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('modern')
  })

  it('returns empty array when no templates', async () => {
    const event = createMockEvent({ url: '/api/templates' })
    const result = await handler(event)
    expect(result).toHaveLength(0)
  })
})
```

**Step 2: Write tiers tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDb, seedTiers, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const handler = (await import('../tiers/index.get')).default

describe('Tiers API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  it('lists tiers in sort order', async () => {
    seedTiers(testDb)
    const event = createMockEvent({ url: '/api/tiers' })
    const result = await handler(event)
    expect(result).toHaveLength(3)
    expect(result[0].slug).toBe('basic')
    expect(result[1].slug).toBe('premium')
    expect(result[2].slug).toBe('pro')
  })

  it('returns empty when no tiers', async () => {
    const event = createMockEvent({ url: '/api/tiers' })
    const result = await handler(event)
    expect(result).toHaveLength(0)
  })
})
```

**Step 3: Run and verify**

Run: `npx vitest run server/api/__tests__/templates.test.ts server/api/__tests__/tiers.test.ts`
Expected: 5 tests PASS

**Step 4: Commit**

```
git add -A && git commit -m "test: add templates and tiers API route tests"
```

---

### Task 15: API Tests — ai.test.ts

**Files:**
- Create: `server/api/__tests__/ai.test.ts`

**Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createTestDb, createTestUser, seedTiers, seedTemplate, type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { createToken } from '../../utils/auth'

let testDb: TestDb
const originalEnv = { ...process.env }

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))

const wordingHandler = (await import('../ai/generate-wording.post')).default
const recommendHandler = (await import('../ai/recommend-templates.post')).default

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token, ...overrides?.cookies } })
}

describe('AI API', () => {
  let user: any

  beforeEach(async () => {
    testDb = createTestDb()
    seedTiers(testDb)
    user = await createTestUser(testDb)
    mockCreate.mockClear()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('POST /api/ai/generate-wording', () => {
    it('returns fallback wording when no API key', async () => {
      delete process.env.OPENAI_API_KEY
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: {
          coupleName1: 'Alice', coupleName2: 'Bob',
          date: 'June 15', venue: 'Grand Hotel', tone: 'formal',
        },
      })
      const result = await wordingHandler(event)
      expect(result.variations).toHaveLength(3)
      expect(result.variations[0]).toContain('Alice')
      expect(result.variations[0]).toContain('Bob')
    })

    it('calls OpenAI when key is configured', async () => {
      process.env.OPENAI_API_KEY = 'sk-real-key'
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          variations: ['Variation 1', 'Variation 2', 'Variation 3'],
        })}}],
      })

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: {
          coupleName1: 'Alice', coupleName2: 'Bob',
          date: 'June 15', venue: 'Grand Hotel',
        },
      })
      const result = await wordingHandler(event)
      expect(result.variations).toHaveLength(3)
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    it('rejects unauthenticated request', async () => {
      const event = createMockEvent({ method: 'POST', body: {} })
      await expect(wordingHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })
  })

  describe('POST /api/ai/recommend-templates', () => {
    it('returns first 5 templates as fallback when no API key', async () => {
      delete process.env.OPENAI_API_KEY
      const tiersList = testDb.query.tiers.findMany()
      seedTemplate(testDb, tiersList[0].id)

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: { coupleName1: 'Alice', coupleName2: 'Bob' },
      })
      const result = await recommendHandler(event)
      expect(result.recommended).toBeDefined()
      expect(result.all).toBeDefined()
    })
  })
})
```

**Step 2: Run and verify**

Run: `npx vitest run server/api/__tests__/ai.test.ts`
Expected: 4 tests PASS

**Step 3: Commit**

```
git add -A && git commit -m "test: add AI API route tests"
```

---

### Task 16: Run Full Suite and Verify

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (~55+ tests across 12 files)

**Step 2: Commit final state**

```
git add -A && git commit -m "test: complete server-side test suite"
```

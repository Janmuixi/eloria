# Admin Console (Read-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only admin console at `/dashboard/admin` so the project owner can inspect every row in the SQLite database — users, events with full guest detail, subscriptions, tiers, and templates — gated by an `ADMIN_EMAILS` env-var allow-list.

**Architecture:** A small `requireAdmin` util (env-based allow-list, no schema change) guards a tree of `/api/admin/*` JSON endpoints. Each endpoint returns raw Drizzle rows (with relevant joins/counts). A new `pages/dashboard/admin/*` tree of Vue pages consumes them. Client-side `middleware/admin.ts` provides UX-level gating; server endpoints enforce 403 independently. No mutations, no i18n.

**Tech Stack:** Nuxt 3, Vue 3, h3 event handlers, Drizzle ORM over better-sqlite3, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-05-18-admin-console-read-only-design.md`

---

## File Structure

### New server files

- `server/utils/admin.ts` — `isAdmin(user)` + `requireAdmin(event)`.
- `server/utils/__tests__/admin.test.ts` — unit tests for the util.
- `server/api/admin/stats/index.get.ts` — counters for the landing page.
- `server/api/admin/users/index.get.ts` — paginated users list with event count + active subscription.
- `server/api/admin/users/[id].get.ts` — user detail (events + subscriptions + redacted user row).
- `server/api/admin/events/index.get.ts` — paginated events list with owner/tier/template/guestCount.
- `server/api/admin/events/[id].get.ts` — event detail (owner, tier, template, guests via `loadEventGuests`, menu tree).
- `server/api/admin/subscriptions/index.get.ts` — paginated subscriptions list with owner.
- `server/api/admin/tiers/index.get.ts` — full tiers table.
- `server/api/admin/templates/index.get.ts` — templates with `minimumTier` slug joined (html/css omitted).
- `server/api/__tests__/admin.test.ts` — endpoint tests (one file, describe-per-endpoint).

### New client files

- `middleware/admin.ts` — client-side admin gate.
- `pages/dashboard/admin/index.vue` — landing page (stats + nav cards).
- `pages/dashboard/admin/users/index.vue` — users list.
- `pages/dashboard/admin/users/[id].vue` — user detail.
- `pages/dashboard/admin/events/index.vue` — events list.
- `pages/dashboard/admin/events/[id].vue` — event detail.
- `pages/dashboard/admin/subscriptions/index.vue` — subscriptions list.
- `pages/dashboard/admin/tiers/index.vue` — tiers list.
- `pages/dashboard/admin/templates/index.vue` — templates list.

### Modified files

- `nuxt.config.ts` — register `ADMIN_EMAILS` in `runtimeConfig`.
- `.env.example` — add `ADMIN_EMAILS=` line.
- `server/api/auth/me.get.ts` — return `isAdmin: boolean`.
- `composables/useAuth.ts` — widen the local `User` interface with `isAdmin: boolean`.
- `layouts/dashboard.vue` — admin nav link in both the mobile and desktop sidebars, guarded by `v-if="user?.isAdmin"`.

---

## Test command

The project uses Vitest. Run a single test file with:

```bash
npx vitest run path/to/file.test.ts
```

Run all tests with `npm test`.

---

## Task 1: Admin auth util

**Files:**
- Create: `server/utils/admin.ts`
- Create: `server/utils/__tests__/admin.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `server/utils/__tests__/admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, createTestUser, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const { isAdmin, requireAdmin } = await import('../admin')
const { createToken } = await import('../auth')

describe('admin util', () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.stubGlobal('useRuntimeConfig', () => ({ ADMIN_EMAILS: 'admin@test.com' }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('isAdmin', () => {
    it('returns false for null user', () => {
      expect(isAdmin(null)).toBe(false)
    })

    it('returns false when ADMIN_EMAILS is unset', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({}))
      expect(isAdmin({ email: 'admin@test.com' })).toBe(false)
    })

    it('returns true on case-insensitive match', () => {
      expect(isAdmin({ email: 'ADMIN@TEST.com' })).toBe(true)
    })

    it('handles comma-separated allow-list with whitespace', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ ADMIN_EMAILS: '  a@b.c , admin@test.com  ' }))
      expect(isAdmin({ email: 'a@b.c' })).toBe(true)
      expect(isAdmin({ email: 'admin@test.com' })).toBe(true)
      expect(isAdmin({ email: 'nope@test.com' })).toBe(false)
    })
  })

  describe('requireAdmin', () => {
    it('throws 401 without auth cookie', async () => {
      const event = createMockEvent({})
      await expect(requireAdmin(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('throws 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'other@test.com', name: 'Other' })
      const token = createToken({ userId: user!.id, email: user!.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      await expect(requireAdmin(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns the user when in allow-list', async () => {
      const user = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const token = createToken({ userId: user!.id, email: user!.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      const result = await requireAdmin(event)
      expect(result.email).toBe('admin@test.com')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/utils/__tests__/admin.test.ts
```

Expected: FAIL — `Cannot find module '../admin'` (the util file does not exist yet).

- [ ] **Step 3: Create the admin util**

Create `server/utils/admin.ts`:

```ts
import type { H3Event } from 'h3'
import { requireAuth } from './auth'
import { resolveEnvVar } from './resolve-env-var'

function adminEmails(): string[] {
  const raw = resolveEnvVar('ADMIN_EMAILS', '')
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false
  return adminEmails().includes(user.email.toLowerCase())
}

export async function requireAdmin(event: H3Event) {
  const user = await requireAuth(event)
  if (!isAdmin(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/utils/__tests__/admin.test.ts
```

Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/admin.ts server/utils/__tests__/admin.test.ts
git commit -m "feat(admin): add requireAdmin util gated by ADMIN_EMAILS env var"
```

---

## Task 2: Wire `isAdmin` through `/api/auth/me` and the composable

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Modify: `server/api/auth/me.get.ts`
- Modify: `composables/useAuth.ts`

- [ ] **Step 1: Add `ADMIN_EMAILS` to `.env.example`**

Append a line at the end of `.env.example`:

```
ADMIN_EMAILS=
```

- [ ] **Step 2: Register the env var in `runtimeConfig`**

Edit `nuxt.config.ts`. Find the `runtimeConfig` block (currently ends with `GOOGLE_CLIENT_SECRET`) and add one line:

```ts
runtimeConfig: {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  BASE_URL: process.env.BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  UPLOAD_ROOT: process.env.UPLOAD_ROOT,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
},
```

- [ ] **Step 3: Return `isAdmin` from `/api/auth/me`**

Replace the body of `server/api/auth/me.get.ts`:

```ts
import { requireAuth } from '../../utils/auth'
import { isAdmin } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdmin(user),
    },
  }
})
```

- [ ] **Step 4: Widen the `User` interface in the composable**

Edit `composables/useAuth.ts`. Replace the interface at the top:

```ts
interface User {
  id: number
  email: string
  name: string
  isAdmin: boolean
}
```

(Everything else stays the same — the composable already spreads `data.user` into `user.value` so the field flows through automatically.)

- [ ] **Step 5: Run the auth tests to confirm nothing regressed**

```bash
npx vitest run server/api/__tests__/auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add nuxt.config.ts .env.example server/api/auth/me.get.ts composables/useAuth.ts
git commit -m "feat(admin): expose isAdmin flag via /api/auth/me"
```

---

## Task 3: Stats endpoint + admin test scaffolding

This task introduces the shared scaffolding all subsequent admin endpoint tests will extend.

**Files:**
- Create: `server/api/admin/stats/index.get.ts`
- Create: `server/api/__tests__/admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/api/__tests__/admin.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestSubscription,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const statsHandler = (await import('../admin/stats/index.get')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('Admin API', () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.stubGlobal('useRuntimeConfig', () => ({ ADMIN_EMAILS: 'admin@test.com' }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('GET /api/admin/stats', () => {
    it('returns 401 without auth', async () => {
      const event = createMockEvent({})
      await expect(statsHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('returns 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
      const event = authEvent(user!.id, user!.email)
      await expect(statsHandler(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns correct counters for admin', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
      const u2 = await createTestUser(testDb, { email: 'b@test.com', name: 'B' })
      createTestEvent(testDb, u1!.id, { paymentStatus: 'paid' })
      createTestEvent(testDb, u1!.id, { paymentStatus: 'pending' })
      createTestEvent(testDb, u2!.id, { paymentStatus: 'paid' })
      createTestSubscription(testDb, u1!.id, { status: 'active' })
      createTestSubscription(testDb, u2!.id, { status: 'canceled' })

      const event = authEvent(admin!.id, admin!.email)
      const result = await statsHandler(event)

      expect(result).toEqual({
        users: 3,
        events: 3,
        paidEvents: 2,
        activeSubscriptions: 1,
      })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts
```

Expected: FAIL — `Cannot find module '../admin/stats/index.get'`.

- [ ] **Step 3: Implement the stats endpoint**

Create `server/api/admin/stats/index.get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions } from '~/server/db/schema'
import { sql, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [usersRow] = await db.select({ n: sql<number>`count(*)` }).from(users)
  const [eventsRow] = await db.select({ n: sql<number>`count(*)` }).from(events)
  const [paidRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.paymentStatus, 'paid'))
  const [activeSubRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'))

  return {
    users: Number(usersRow.n),
    events: Number(eventsRow.n),
    paidEvents: Number(paidRow.n),
    activeSubscriptions: Number(activeSubRow.n),
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/api/__tests__/admin.test.ts
```

Expected: PASS — all 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/stats/index.get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/stats"
```

---

## Task 4: Users list endpoint

**Files:**
- Create: `server/api/admin/users/index.get.ts`
- Modify: `server/api/__tests__/admin.test.ts` (add describe block)

- [ ] **Step 1: Append the failing tests**

Append inside the `describe('Admin API', () => { ... })` block in `server/api/__tests__/admin.test.ts`:

```ts
const usersListHandler = (await import('../admin/users/index.get')).default

describe('GET /api/admin/users', () => {
  it('returns 401 without auth', async () => {
    const event = createMockEvent({})
    await expect(usersListHandler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns 403 for non-admin user', async () => {
    const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const event = authEvent(user!.id, user!.email)
    await expect(usersListHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns paginated rows with eventCount and activeSubscription', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    createTestEvent(testDb, u1!.id, { title: 'E1' })
    createTestEvent(testDb, u1!.id, { title: 'E2' })
    createTestSubscription(testDb, u1!.id, { status: 'active', price: 4900 })

    const event = authEvent(admin!.id, admin!.email)
    const result = await usersListHandler(event)

    expect(result.total).toBe(2)
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(0)
    expect(result.rows).toHaveLength(2)
    const u1Row = result.rows.find((r: any) => r.email === 'a@test.com')
    expect(u1Row.eventCount).toBe(2)
    expect(u1Row.activeSubscription).toMatchObject({ status: 'active', price: 4900 })
    const adminRow = result.rows.find((r: any) => r.email === 'admin@test.com')
    expect(adminRow.eventCount).toBe(0)
    expect(adminRow.activeSubscription).toBeNull()
  })

  it('filters by q substring against email or name (case-insensitive)', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    await createTestUser(testDb, { email: 'alice@example.com', name: 'Alice' })
    await createTestUser(testDb, { email: 'bob@example.com', name: 'Bob' })

    const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/users?q=ALICE' })
    const result = await usersListHandler(event)

    expect(result.total).toBe(1)
    expect(result.rows[0].email).toBe('alice@example.com')
  })

  it('respects limit and offset', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    for (let i = 0; i < 5; i++) {
      await createTestUser(testDb, { email: `u${i}@test.com`, name: `U${i}` })
    }
    const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/users?limit=2&offset=1' })
    const result = await usersListHandler(event)

    expect(result.total).toBe(6)
    expect(result.limit).toBe(2)
    expect(result.offset).toBe(1)
    expect(result.rows).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "Admin API > GET /api/admin/users"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `server/api/admin/users/index.get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions } from '~/server/db/schema'
import { sql, eq, desc, and, or, like } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase() : ''

  const where = search
    ? or(
        like(sql`lower(${users.email})`, `%${search}%`),
        like(sql`lower(${users.name})`, `%${search}%`),
      )
    : undefined

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(where)

  const baseRows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset)

  const ids = baseRows.map((r) => r.id)
  const eventCounts = ids.length
    ? await db
        .select({ userId: events.userId, n: sql<number>`count(*)` })
        .from(events)
        .where(sql`${events.userId} in ${ids}`)
        .groupBy(events.userId)
    : []
  const activeSubs = ids.length
    ? await db
        .select()
        .from(subscriptions)
        .where(and(sql`${subscriptions.userId} in ${ids}`, eq(subscriptions.status, 'active')))
    : []

  const countByUser = new Map(eventCounts.map((c) => [c.userId, Number(c.n)]))
  const subByUser = new Map(activeSubs.map((s) => [s.userId, s]))

  const rows = baseRows.map((u) => {
    const sub = subByUser.get(u.id)
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
      googleId: u.googleId,
      stripeCustomerId: u.stripeCustomerId,
      createdAt: u.createdAt,
      eventCount: countByUser.get(u.id) ?? 0,
      activeSubscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            price: sub.price,
            currentPeriodEnd: sub.currentPeriodEnd,
            canceledAt: sub.canceledAt,
          }
        : null,
    }
  })

  return { rows, total: Number(totalRow.n), limit, offset }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "Admin API > GET /api/admin/users"
```

Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/users/index.get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/users"
```

---

## Task 5: User detail endpoint

**Files:**
- Create: `server/api/admin/users/[id].get.ts`
- Modify: `server/api/__tests__/admin.test.ts`

- [ ] **Step 1: Append the failing tests**

Append inside the `describe('Admin API', () => { ... })` block:

```ts
const userDetailHandler = (await import('../admin/users/[id].get')).default

describe('GET /api/admin/users/[id]', () => {
  it('returns 403 for non-admin user', async () => {
    const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const event = authEvent(user!.id, user!.email, { params: { id: String(user!.id) } })
    await expect(userDetailHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns 404 for unknown user', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const event = authEvent(admin!.id, admin!.email, { params: { id: '999' } })
    await expect(userDetailHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns redacted user + events + subscriptions', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const target = await createTestUser(testDb, { email: 'target@test.com', name: 'Target', password: 'secret' })
    const evt = createTestEvent(testDb, target!.id, { title: 'T-Evt' })
    createTestSubscription(testDb, target!.id, { status: 'active' })

    const event = authEvent(admin!.id, admin!.email, { params: { id: String(target!.id) } })
    const result = await userDetailHandler(event)

    expect(result.user.email).toBe('target@test.com')
    expect(result.user.passwordHash).toBeNull()
    expect(result.user.hasPassword).toBe(true)
    expect(result.user.resetToken).toBeNull()
    expect(result.user.hasResetToken).toBe(false)
    expect(result.events).toHaveLength(1)
    expect(result.events[0].id).toBe(evt!.id)
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].status).toBe('active')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/users/\[id\]"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `server/api/admin/users/[id].get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions, tiers } from '~/server/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = parseInt(getRouterParam(event, 'id')!, 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const eventRows = await db
    .select({
      id: events.id,
      title: events.title,
      date: events.date,
      slug: events.slug,
      paymentStatus: events.paymentStatus,
      tierSlug: tiers.slug,
      tierName: tiers.name,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(tiers, eq(tiers.id, events.tierId))
    .where(eq(events.userId, id))
    .orderBy(desc(events.createdAt))

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, id))
    .orderBy(desc(subscriptions.createdAt))

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      googleId: user.googleId,
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
      passwordHash: null,
      hasPassword: !!user.passwordHash,
      resetToken: null,
      hasResetToken: !!user.resetToken,
      resetTokenExpiresAt: user.resetTokenExpiresAt,
    },
    events: eventRows.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      slug: e.slug,
      paymentStatus: e.paymentStatus,
      tier: e.tierSlug ? { slug: e.tierSlug, name: e.tierName! } : null,
      createdAt: e.createdAt,
    })),
    subscriptions: subRows,
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/users/\[id\]"
```

Expected: PASS — all 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/users/[id].get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/users/[id]"
```

---

## Task 6: Events list endpoint

**Files:**
- Create: `server/api/admin/events/index.get.ts`
- Modify: `server/api/__tests__/admin.test.ts`

- [ ] **Step 1: Append the failing tests**

Append inside `describe('Admin API', () => { ... })`:

```ts
const eventsListHandler = (await import('../admin/events/index.get')).default

describe('GET /api/admin/events', () => {
  it('returns 403 for non-admin user', async () => {
    const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const event = authEvent(user!.id, user!.email)
    await expect(eventsListHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns rows joined with owner email and guestCount', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, u1!.id, { title: 'My Event' })
    const { createTestGuest } = await import('../../__helpers__/db')
    createTestGuest(testDb, evt!.id, { name: 'G1' })
    createTestGuest(testDb, evt!.id, { name: 'G2' })

    const event = authEvent(admin!.id, admin!.email)
    const result = await eventsListHandler(event)

    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].title).toBe('My Event')
    expect(result.rows[0].user.email).toBe('a@test.com')
    expect(result.rows[0].guestCount).toBe(2)
  })

  it('filters by paymentStatus', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    createTestEvent(testDb, u1!.id, { title: 'Paid', paymentStatus: 'paid' })
    createTestEvent(testDb, u1!.id, { title: 'Pending', paymentStatus: 'pending' })

    const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/events?paymentStatus=paid' })
    const result = await eventsListHandler(event)

    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('Paid')
  })

  it('filters by q against title or owner email', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const u1 = await createTestUser(testDb, { email: 'alice@test.com', name: 'Alice' })
    const u2 = await createTestUser(testDb, { email: 'bob@test.com', name: 'Bob' })
    createTestEvent(testDb, u1!.id, { title: 'Alpha Wedding' })
    createTestEvent(testDb, u2!.id, { title: 'Beta Wedding' })

    const byTitle = authEvent(admin!.id, admin!.email, { url: '/api/admin/events?q=alpha' })
    expect((await eventsListHandler(byTitle)).total).toBe(1)

    const byEmail = authEvent(admin!.id, admin!.email, { url: '/api/admin/events?q=bob@' })
    const result = await eventsListHandler(byEmail)
    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('Beta Wedding')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/events"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `server/api/admin/events/index.get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { events, users, tiers, templates, guests } from '~/server/db/schema'
import { sql, eq, desc, and, or, like } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase() : ''
  const paymentStatus = typeof q.paymentStatus === 'string' && q.paymentStatus.trim()
    ? q.paymentStatus.trim()
    : null

  const filters = [] as any[]
  if (paymentStatus) filters.push(eq(events.paymentStatus, paymentStatus))
  if (search) {
    filters.push(
      or(
        like(sql`lower(${events.title})`, `%${search}%`),
        like(sql`lower(${users.email})`, `%${search}%`),
      ),
    )
  }
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(events)
    .innerJoin(users, eq(users.id, events.userId))
    .where(where)

  const baseRows = await db
    .select({
      id: events.id,
      title: events.title,
      coupleName1: events.coupleName1,
      coupleName2: events.coupleName2,
      date: events.date,
      venue: events.venue,
      slug: events.slug,
      paymentStatus: events.paymentStatus,
      invitationType: events.invitationType,
      language: events.language,
      createdAt: events.createdAt,
      userId: events.userId,
      userEmail: users.email,
      userName: users.name,
      tierId: tiers.id,
      tierSlug: tiers.slug,
      tierName: tiers.name,
      templateId: templates.id,
      templateSlug: templates.slug,
      templateName: templates.name,
    })
    .from(events)
    .innerJoin(users, eq(users.id, events.userId))
    .leftJoin(tiers, eq(tiers.id, events.tierId))
    .leftJoin(templates, eq(templates.id, events.templateId))
    .where(where)
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .offset(offset)

  const ids = baseRows.map((r) => r.id)
  const guestCounts = ids.length
    ? await db
        .select({ eventId: guests.eventId, n: sql<number>`count(*)` })
        .from(guests)
        .where(sql`${guests.eventId} in ${ids}`)
        .groupBy(guests.eventId)
    : []
  const countByEvent = new Map(guestCounts.map((c) => [c.eventId, Number(c.n)]))

  const rows = baseRows.map((r) => ({
    id: r.id,
    title: r.title,
    coupleName1: r.coupleName1,
    coupleName2: r.coupleName2,
    date: r.date,
    venue: r.venue,
    slug: r.slug,
    paymentStatus: r.paymentStatus,
    invitationType: r.invitationType,
    language: r.language,
    createdAt: r.createdAt,
    user: { id: r.userId, email: r.userEmail, name: r.userName },
    tier: r.tierId ? { id: r.tierId, slug: r.tierSlug!, name: r.tierName! } : null,
    template: r.templateId ? { id: r.templateId, slug: r.templateSlug!, name: r.templateName! } : null,
    guestCount: countByEvent.get(r.id) ?? 0,
  }))

  return { rows, total: Number(totalRow.n), limit, offset }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/events"
```

Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/events/index.get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/events"
```

---

## Task 7: Event detail endpoint

**Files:**
- Create: `server/api/admin/events/[id].get.ts`
- Modify: `server/api/__tests__/admin.test.ts`

- [ ] **Step 1: Append the failing tests**

Append inside `describe('Admin API', () => { ... })`:

```ts
const eventDetailHandler = (await import('../admin/events/[id].get')).default

describe('GET /api/admin/events/[id]', () => {
  it('returns 403 for non-admin', async () => {
    const u = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const ev = createTestEvent(testDb, u!.id)
    const event = authEvent(u!.id, u!.email, { params: { id: String(ev!.id) } })
    await expect(eventDetailHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns 404 for unknown event', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const event = authEvent(admin!.id, admin!.email, { params: { id: '999' } })
    await expect(eventDetailHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns event + owner + guests + menu tree', async () => {
    const { seedTiers, seedTemplate, createTestGuest } = await import('../../__helpers__/db')
    const { tiers, menuCourses, menuOptions } = await import('../../db/schema')

    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const owner = await createTestUser(testDb, { email: 'owner@test.com', name: 'Owner' })
    seedTiers(testDb)
    const tier = (testDb.select().from(tiers).all() as any[])[0]
    const tmpl = seedTemplate(testDb, tier.id)
    const ev = createTestEvent(testDb, owner!.id, { title: 'Detail', tierId: tier.id, templateId: tmpl.id })
    createTestGuest(testDb, ev!.id, { name: 'Guest A' })

    const courseRow = testDb.insert(menuCourses).values({ eventId: ev!.id, name: 'Main', sortOrder: 0 }).returning().all()[0]
    testDb.insert(menuOptions).values({ courseId: courseRow.id, name: 'Beef', sortOrder: 0 }).run()

    const event = authEvent(admin!.id, admin!.email, { params: { id: String(ev!.id) } })
    const result = await eventDetailHandler(event)

    expect(result.event.id).toBe(ev!.id)
    expect(result.owner.email).toBe('owner@test.com')
    expect(result.tier?.slug).toBe(tier.slug)
    expect(result.template?.slug).toBe(tmpl.slug)
    expect(result.guests).toHaveLength(1)
    expect(result.guests[0].name).toBe('Guest A')
    expect(result.menu).toHaveLength(1)
    expect(result.menu[0].name).toBe('Main')
    expect(result.menu[0].options[0].name).toBe('Beef')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/events/\[id\]"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `server/api/admin/events/[id].get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { events, users, tiers, templates, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
import { loadEventGuests } from '~/server/utils/event-guests'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = parseInt(getRouterParam(event, 'id')!, 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const evt = await db.query.events.findFirst({ where: eq(events.id, id) })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const owner = await db.query.users.findFirst({ where: eq(users.id, evt.userId) })
  const tier = evt.tierId
    ? await db.query.tiers.findFirst({ where: eq(tiers.id, evt.tierId) })
    : null
  const template = evt.templateId
    ? await db.query.templates.findFirst({ where: eq(templates.id, evt.templateId) })
    : null

  const courses = await db
    .select()
    .from(menuCourses)
    .where(eq(menuCourses.eventId, id))
    .orderBy(asc(menuCourses.sortOrder))
  const courseIds = courses.map((c) => c.id)
  const optionsAll = courseIds.length
    ? await db
        .select()
        .from(menuOptions)
        .where(inArray(menuOptions.courseId, courseIds))
        .orderBy(asc(menuOptions.sortOrder))
    : []

  const optsByCourse = new Map<number, typeof optionsAll>()
  for (const o of optionsAll) {
    if (!optsByCourse.has(o.courseId)) optsByCourse.set(o.courseId, [])
    optsByCourse.get(o.courseId)!.push(o)
  }

  const guests = await loadEventGuests(id)

  return {
    event: evt,
    owner: owner ? { id: owner.id, email: owner.email, name: owner.name } : null,
    tier: tier ?? null,
    template: template
      ? { id: template.id, slug: template.slug, name: template.name, category: template.category }
      : null,
    guests,
    menu: courses.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: (optsByCourse.get(c.id) ?? []).map((o) => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/events/\[id\]"
```

Expected: PASS — all 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/events/[id].get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/events/[id]"
```

---

## Task 8: Subscriptions list endpoint

**Files:**
- Create: `server/api/admin/subscriptions/index.get.ts`
- Modify: `server/api/__tests__/admin.test.ts`

- [ ] **Step 1: Append the failing tests**

Append inside `describe('Admin API', () => { ... })`:

```ts
const subsListHandler = (await import('../admin/subscriptions/index.get')).default

describe('GET /api/admin/subscriptions', () => {
  it('returns 403 for non-admin', async () => {
    const u = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const event = authEvent(u!.id, u!.email)
    await expect(subsListHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns rows joined with owner', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    createTestSubscription(testDb, u1!.id, { status: 'active', price: 4900 })

    const event = authEvent(admin!.id, admin!.email)
    const result = await subsListHandler(event)

    expect(result.total).toBe(1)
    expect(result.rows[0].status).toBe('active')
    expect(result.rows[0].user.email).toBe('a@test.com')
  })

  it('filters by status', async () => {
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
    const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    createTestSubscription(testDb, u1!.id, { status: 'active' })
    createTestSubscription(testDb, u1!.id, { status: 'canceled' })

    const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/subscriptions?status=canceled' })
    const result = await subsListHandler(event)

    expect(result.total).toBe(1)
    expect(result.rows[0].status).toBe('canceled')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/subscriptions"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

Create `server/api/admin/subscriptions/index.get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { subscriptions, users } from '~/server/db/schema'
import { sql, eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const status = typeof q.status === 'string' && q.status.trim() ? q.status.trim() : null

  const where = status ? eq(subscriptions.status, status) : undefined

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(subscriptions)
    .where(where)

  const baseRows = await db
    .select({
      id: subscriptions.id,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      status: subscriptions.status,
      price: subscriptions.price,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      canceledAt: subscriptions.canceledAt,
      createdAt: subscriptions.createdAt,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(where)
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit)
    .offset(offset)

  const rows = baseRows.map((r) => ({
    id: r.id,
    stripeSubscriptionId: r.stripeSubscriptionId,
    stripeCustomerId: r.stripeCustomerId,
    status: r.status,
    price: r.price,
    currentPeriodStart: r.currentPeriodStart,
    currentPeriodEnd: r.currentPeriodEnd,
    canceledAt: r.canceledAt,
    createdAt: r.createdAt,
    user: { id: r.userId, email: r.userEmail, name: r.userName },
  }))

  return { rows, total: Number(totalRow.n), limit, offset }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/subscriptions"
```

Expected: PASS — all 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/subscriptions/index.get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/subscriptions"
```

---

## Task 9: Tiers and Templates endpoints

**Files:**
- Create: `server/api/admin/tiers/index.get.ts`
- Create: `server/api/admin/templates/index.get.ts`
- Modify: `server/api/__tests__/admin.test.ts`

- [ ] **Step 1: Append the failing tests**

Append inside `describe('Admin API', () => { ... })`:

```ts
const tiersHandler = (await import('../admin/tiers/index.get')).default
const templatesHandler = (await import('../admin/templates/index.get')).default

describe('GET /api/admin/tiers', () => {
  it('returns 403 for non-admin', async () => {
    const u = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const event = authEvent(u!.id, u!.email)
    await expect(tiersHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns all tiers ordered by sortOrder', async () => {
    const { seedTiers } = await import('../../__helpers__/db')
    seedTiers(testDb)
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })

    const event = authEvent(admin!.id, admin!.email)
    const result = await tiersHandler(event)

    expect(result).toHaveLength(2)
    expect(result[0].slug).toBe('basic')
    expect(result[1].slug).toBe('premium')
  })
})

describe('GET /api/admin/templates', () => {
  it('returns 403 for non-admin', async () => {
    const u = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
    const event = authEvent(u!.id, u!.email)
    await expect(templatesHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns templates with minimumTier slug, html/css omitted', async () => {
    const { seedTiers, seedTemplate } = await import('../../__helpers__/db')
    const { tiers } = await import('../../db/schema')
    seedTiers(testDb)
    const tier = (testDb.select().from(tiers).all() as any[])[0]
    seedTemplate(testDb, tier.id)
    const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })

    const event = authEvent(admin!.id, admin!.email)
    const result = await templatesHandler(event)

    expect(result).toHaveLength(1)
    expect(result[0].minimumTier.slug).toBe(tier.slug)
    expect(result[0].htmlTemplate).toBeUndefined()
    expect(result[0].cssTemplate).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/api/__tests__/admin.test.ts -t "GET /api/admin/tiers"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tiers endpoint**

Create `server/api/admin/tiers/index.get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { tiers } from '~/server/db/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return db.select().from(tiers).orderBy(asc(tiers.sortOrder))
})
```

- [ ] **Step 4: Implement the templates endpoint**

Create `server/api/admin/templates/index.get.ts`:

```ts
import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { templates, tiers } from '~/server/db/schema'
import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      slug: templates.slug,
      category: templates.category,
      colorScheme: templates.colorScheme,
      fontPairings: templates.fontPairings,
      tags: templates.tags,
      createdAt: templates.createdAt,
      tierId: tiers.id,
      tierSlug: tiers.slug,
      tierName: tiers.name,
    })
    .from(templates)
    .innerJoin(tiers, eq(tiers.id, templates.minimumTierId))
    .orderBy(asc(templates.category), asc(templates.name))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    category: r.category,
    colorScheme: r.colorScheme,
    fontPairings: r.fontPairings,
    tags: r.tags,
    createdAt: r.createdAt,
    minimumTier: { id: r.tierId, slug: r.tierSlug, name: r.tierName },
  }))
})
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run server/api/__tests__/admin.test.ts
```

Expected: PASS — all admin test cases green.

- [ ] **Step 6: Commit**

```bash
git add server/api/admin/tiers/index.get.ts server/api/admin/templates/index.get.ts server/api/__tests__/admin.test.ts
git commit -m "feat(admin): add GET /api/admin/tiers and GET /api/admin/templates"
```

---

## Task 10: Admin middleware + dashboard layout link

**Files:**
- Create: `middleware/admin.ts`
- Modify: `layouts/dashboard.vue`

- [ ] **Step 1: Create the middleware**

Create `middleware/admin.ts`:

```ts
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchUser, loading } = useAuth()
  if (loading.value) await fetchUser()

  const localePath = useLocalePath()
  if (!user.value) return navigateTo(localePath('/auth/login'))
  if (!user.value.isAdmin) return navigateTo(localePath('/dashboard'))
})
```

- [ ] **Step 2: Add the admin link to the desktop sidebar**

Edit `layouts/dashboard.vue`. In the desktop sidebar `<nav class="px-4 space-y-1">` block (around lines 56-72), append a new link after the "My Account" link and before `</nav>`:

```vue
<NuxtLinkLocale v-if="user?.isAdmin" to="/dashboard/admin"
  class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
  active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
  Admin
</NuxtLinkLocale>
```

- [ ] **Step 3: Add the same link to the mobile sidebar**

Inside the mobile `<nav class="px-4 space-y-1">` block (around lines 29-45), append the same link block after the "My Account" link. Add `@click="sidebarOpen = false"` to match the surrounding pattern:

```vue
<NuxtLinkLocale v-if="user?.isAdmin" to="/dashboard/admin" @click="sidebarOpen = false"
  class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
  active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
  Admin
</NuxtLinkLocale>
```

- [ ] **Step 4: Smoke-check the build**

```bash
npx nuxt prepare
```

Expected: completes without TS errors.

- [ ] **Step 5: Commit**

```bash
git add middleware/admin.ts layouts/dashboard.vue
git commit -m "feat(admin): add admin route middleware and dashboard nav link"
```

---

## Task 11: Admin landing page

**Files:**
- Create: `pages/dashboard/admin/index.vue`

- [ ] **Step 1: Create the page**

Create `pages/dashboard/admin/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { data: stats, status } = await useFetch<{
  users: number; events: number; paidEvents: number; activeSubscriptions: number
}>('/api/admin/stats')

const cards = [
  { to: '/dashboard/admin/users', label: 'Users', description: 'Inspect user accounts, their events, and subscriptions.' },
  { to: '/dashboard/admin/events', label: 'Events', description: 'Browse every event with owner, tier, and guest detail.' },
  { to: '/dashboard/admin/subscriptions', label: 'Subscriptions', description: 'Stripe subscription rows joined with owner.' },
  { to: '/dashboard/admin/tiers', label: 'Tiers', description: 'Tier configuration (read-only).' },
  { to: '/dashboard/admin/templates', label: 'Templates', description: 'Template metadata (HTML/CSS omitted).' },
]
</script>

<template>
  <div>
    <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-6">Admin</h1>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Users</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.users ?? 0 }}</p>
      </div>
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Events</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.events ?? 0 }}</p>
      </div>
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Paid events</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.paidEvents ?? 0 }}</p>
      </div>
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Active subscriptions</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.activeSubscriptions ?? 0 }}</p>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <NuxtLinkLocale v-for="card in cards" :key="card.to" :to="card.to"
        class="block bg-ivory-100 border border-charcoal-200 rounded-2xl p-5 hover:border-champagne-400 hover:shadow-md transition-all duration-200">
        <h3 class="font-display font-semibold text-lg text-charcoal-900">{{ card.label }}</h3>
        <p class="text-sm text-charcoal-500 mt-1">{{ card.description }}</p>
      </NuxtLinkLocale>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Smoke-check the build**

```bash
npx nuxt prepare
```

Expected: completes without TS errors.

- [ ] **Step 3: Commit**

```bash
git add pages/dashboard/admin/index.vue
git commit -m "feat(admin): add landing page with stats and nav cards"
```

---

## Task 12: Users list page

**Files:**
- Create: `pages/dashboard/admin/users/index.vue`

- [ ] **Step 1: Create the page**

Create `pages/dashboard/admin/users/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Row = {
  id: number; email: string; name: string; emailVerified: boolean | null;
  googleId: string | null; stripeCustomerId: string | null; createdAt: string | null;
  eventCount: number;
  activeSubscription: { id: number; status: string; price: number; currentPeriodEnd: string | null; canceledAt: string | null } | null;
}

const PAGE_SIZE = 50
const offset = ref(0)
const qInput = ref('')
const qApplied = ref('')

let debounce: ReturnType<typeof setTimeout> | null = null
watch(qInput, (v) => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    qApplied.value = v
    offset.value = 0
  }, 300)
})

const url = computed(() => {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset.value))
  if (qApplied.value) params.set('q', qApplied.value)
  return `/api/admin/users?${params.toString()}`
})

const { data, status, refresh } = await useFetch<{ rows: Row[]; total: number; limit: number; offset: number }>(url)
watch(url, () => refresh())

const showingFrom = computed(() => (data.value ? offset.value + 1 : 0))
const showingTo = computed(() => Math.min(offset.value + PAGE_SIZE, data.value?.total ?? 0))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Users</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <div class="mb-4">
      <input v-model="qInput" type="search" placeholder="Search email or name"
        class="w-full md:w-80 px-4 py-2 border border-charcoal-200 rounded-full text-sm focus:outline-none focus:border-champagne-400" />
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.rows.length" class="text-center py-12 text-charcoal-500">No users.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Email</th>
            <th class="text-left px-4 py-2">Name</th>
            <th class="text-left px-4 py-2">Verified</th>
            <th class="text-left px-4 py-2">Events</th>
            <th class="text-left px-4 py-2">Active sub</th>
            <th class="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.rows" :key="row.id" class="border-t border-charcoal-100 hover:bg-ivory-50">
            <td class="px-4 py-2 text-charcoal-500">{{ row.id }}</td>
            <td class="px-4 py-2">
              <NuxtLinkLocale :to="`/dashboard/admin/users/${row.id}`" class="text-charcoal-900 hover:underline">
                {{ row.email }}
              </NuxtLinkLocale>
            </td>
            <td class="px-4 py-2 text-charcoal-700">{{ row.name }}</td>
            <td class="px-4 py-2">{{ row.emailVerified ? '✓' : '—' }}</td>
            <td class="px-4 py-2">{{ row.eventCount }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ row.activeSubscription?.status ?? '—' }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ row.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && data.total > 0" class="flex items-center justify-between mt-4 text-sm text-charcoal-500">
      <span>Showing {{ showingFrom }}–{{ showingTo }} of {{ data.total }}</span>
      <div class="flex gap-2">
        <button :disabled="offset === 0" @click="offset = Math.max(0, offset - PAGE_SIZE)"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Prev</button>
        <button :disabled="offset + PAGE_SIZE >= data.total" @click="offset = offset + PAGE_SIZE"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Next</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/admin/users/index.vue
git commit -m "feat(admin): add users list page with search and pagination"
```

---

## Task 13: User detail page

**Files:**
- Create: `pages/dashboard/admin/users/[id].vue`

- [ ] **Step 1: Create the page**

Create `pages/dashboard/admin/users/[id].vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type DetailResponse = {
  user: {
    id: number; email: string; name: string; avatarUrl: string | null;
    emailVerified: boolean | null; googleId: string | null; stripeCustomerId: string | null;
    createdAt: string | null;
    passwordHash: null; hasPassword: boolean;
    resetToken: null; hasResetToken: boolean; resetTokenExpiresAt: string | null;
  };
  events: Array<{ id: number; title: string; date: string; slug: string; paymentStatus: string; tier: { slug: string; name: string } | null; createdAt: string | null }>;
  subscriptions: Array<{ id: number; stripeSubscriptionId: string; status: string; price: number; currentPeriodStart: string | null; currentPeriodEnd: string | null; canceledAt: string | null; createdAt: string | null }>;
}

const route = useRoute()
const { data, status } = await useFetch<DetailResponse>(`/api/admin/users/${route.params.id}`)

const fields = computed(() => {
  if (!data.value) return [] as Array<[string, string]>
  const u = data.value.user
  return [
    ['ID', String(u.id)],
    ['Email', u.email],
    ['Name', u.name],
    ['Email verified', u.emailVerified ? 'yes' : 'no'],
    ['Has password', u.hasPassword ? 'yes' : 'no'],
    ['Has reset token', u.hasResetToken ? 'yes' : 'no'],
    ['Google ID', u.googleId ?? '—'],
    ['Stripe customer ID', u.stripeCustomerId ?? '—'],
    ['Avatar URL', u.avatarUrl ?? '—'],
    ['Created at', u.createdAt ?? '—'],
  ] as Array<[string, string]>
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">User detail</h1>
      <NuxtLinkLocale to="/dashboard/admin/users" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to users</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <template v-else-if="data">
      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">User</h2>
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div v-for="[label, value] in fields" :key="label">
            <dt class="text-charcoal-500">{{ label }}</dt>
            <dd class="text-charcoal-900 font-medium break-all">{{ value }}</dd>
          </div>
        </dl>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Subscriptions</h2>
        <p v-if="!data.subscriptions.length" class="text-charcoal-500 text-sm">None.</p>
        <table v-else class="w-full text-sm">
          <thead class="text-charcoal-700 text-xs uppercase">
            <tr>
              <th class="text-left py-2">ID</th>
              <th class="text-left py-2">Stripe ID</th>
              <th class="text-left py-2">Status</th>
              <th class="text-left py-2">Price</th>
              <th class="text-left py-2">Period end</th>
              <th class="text-left py-2">Canceled at</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data.subscriptions" :key="s.id" class="border-t border-charcoal-100">
              <td class="py-2 text-charcoal-500">{{ s.id }}</td>
              <td class="py-2 text-charcoal-700 text-xs break-all">{{ s.stripeSubscriptionId }}</td>
              <td class="py-2">{{ s.status }}</td>
              <td class="py-2">{{ s.price }}</td>
              <td class="py-2 text-charcoal-500 text-xs">{{ s.currentPeriodEnd ?? '—' }}</td>
              <td class="py-2 text-charcoal-500 text-xs">{{ s.canceledAt ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Events</h2>
        <p v-if="!data.events.length" class="text-charcoal-500 text-sm">None.</p>
        <table v-else class="w-full text-sm">
          <thead class="text-charcoal-700 text-xs uppercase">
            <tr>
              <th class="text-left py-2">ID</th>
              <th class="text-left py-2">Title</th>
              <th class="text-left py-2">Date</th>
              <th class="text-left py-2">Payment</th>
              <th class="text-left py-2">Tier</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in data.events" :key="e.id" class="border-t border-charcoal-100 hover:bg-ivory-50">
              <td class="py-2 text-charcoal-500">{{ e.id }}</td>
              <td class="py-2">
                <NuxtLinkLocale :to="`/dashboard/admin/events/${e.id}`" class="text-charcoal-900 hover:underline">
                  {{ e.title }}
                </NuxtLinkLocale>
              </td>
              <td class="py-2 text-charcoal-700">{{ e.date }}</td>
              <td class="py-2">{{ e.paymentStatus }}</td>
              <td class="py-2 text-charcoal-700">{{ e.tier?.slug ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/admin/users/[id].vue
git commit -m "feat(admin): add user detail page with events and subscriptions"
```

---

## Task 14: Events list page

**Files:**
- Create: `pages/dashboard/admin/events/index.vue`

- [ ] **Step 1: Create the page**

Create `pages/dashboard/admin/events/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Row = {
  id: number; title: string; date: string; venue: string; slug: string;
  paymentStatus: string; invitationType: string; language: string; createdAt: string | null;
  user: { id: number; email: string; name: string };
  tier: { slug: string; name: string } | null;
  template: { slug: string; name: string } | null;
  guestCount: number;
}

const PAGE_SIZE = 50
const offset = ref(0)
const qInput = ref('')
const qApplied = ref('')
const paymentStatus = ref('')

let debounce: ReturnType<typeof setTimeout> | null = null
watch(qInput, (v) => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    qApplied.value = v
    offset.value = 0
  }, 300)
})
watch(paymentStatus, () => { offset.value = 0 })

const url = computed(() => {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset.value))
  if (qApplied.value) params.set('q', qApplied.value)
  if (paymentStatus.value) params.set('paymentStatus', paymentStatus.value)
  return `/api/admin/events?${params.toString()}`
})

const { data, status, refresh } = await useFetch<{ rows: Row[]; total: number; limit: number; offset: number }>(url)
watch(url, () => refresh())

const showingFrom = computed(() => (data.value ? offset.value + 1 : 0))
const showingTo = computed(() => Math.min(offset.value + PAGE_SIZE, data.value?.total ?? 0))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Events</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <div class="flex flex-wrap gap-3 mb-4">
      <input v-model="qInput" type="search" placeholder="Search title or owner email"
        class="w-full md:w-80 px-4 py-2 border border-charcoal-200 rounded-full text-sm focus:outline-none focus:border-champagne-400" />
      <select v-model="paymentStatus"
        class="px-4 py-2 border border-charcoal-200 rounded-full text-sm">
        <option value="">All payment statuses</option>
        <option value="pending">pending</option>
        <option value="paid">paid</option>
        <option value="locked">locked</option>
      </select>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.rows.length" class="text-center py-12 text-charcoal-500">No events.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Title</th>
            <th class="text-left px-4 py-2">Owner</th>
            <th class="text-left px-4 py-2">Date</th>
            <th class="text-left px-4 py-2">Payment</th>
            <th class="text-left px-4 py-2">Tier</th>
            <th class="text-left px-4 py-2">Guests</th>
            <th class="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.rows" :key="row.id" class="border-t border-charcoal-100 hover:bg-ivory-50">
            <td class="px-4 py-2 text-charcoal-500">{{ row.id }}</td>
            <td class="px-4 py-2">
              <NuxtLinkLocale :to="`/dashboard/admin/events/${row.id}`" class="text-charcoal-900 hover:underline">
                {{ row.title }}
              </NuxtLinkLocale>
            </td>
            <td class="px-4 py-2">
              <NuxtLinkLocale :to="`/dashboard/admin/users/${row.user.id}`" class="text-charcoal-700 hover:underline">
                {{ row.user.email }}
              </NuxtLinkLocale>
            </td>
            <td class="px-4 py-2 text-charcoal-700">{{ row.date }}</td>
            <td class="px-4 py-2">{{ row.paymentStatus }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ row.tier?.slug ?? '—' }}</td>
            <td class="px-4 py-2">{{ row.guestCount }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ row.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && data.total > 0" class="flex items-center justify-between mt-4 text-sm text-charcoal-500">
      <span>Showing {{ showingFrom }}–{{ showingTo }} of {{ data.total }}</span>
      <div class="flex gap-2">
        <button :disabled="offset === 0" @click="offset = Math.max(0, offset - PAGE_SIZE)"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Prev</button>
        <button :disabled="offset + PAGE_SIZE >= data.total" @click="offset = offset + PAGE_SIZE"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Next</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/admin/events/index.vue
git commit -m "feat(admin): add events list page with search and filters"
```

---

## Task 15: Event detail page

**Files:**
- Create: `pages/dashboard/admin/events/[id].vue`

- [ ] **Step 1: Create the page**

Create `pages/dashboard/admin/events/[id].vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type EventRow = Record<string, unknown> & {
  id: number; title: string; userId: number; coupleName1: string; coupleName2: string;
  date: string; venue: string; venueAddress: string; venueMapUrl: string | null;
  description: string | null; templateId: number | null; invitationType: string;
  customImagePath: string | null; customization: string | null; tierId: number | null;
  paymentStatus: string; stripePaymentId: string | null; language: string;
  allergiesEnabled: boolean; slug: string; createdAt: string | null;
}

type Guest = {
  id: number; name: string; email: string | null; phone: string | null;
  rsvpStatus: string; companionsAllowed: number;
  allergies: { keys: string[]; other: string };
  menuChoices: Record<number, number>;
  companions: Array<{
    id: number; position: number; name: string | null; attending: boolean;
    allergies: { keys: string[]; other: string };
    menuChoices: Record<number, number>;
  }>;
}

type DetailResponse = {
  event: EventRow;
  owner: { id: number; email: string; name: string } | null;
  tier: Record<string, unknown> | null;
  template: { id: number; slug: string; name: string; category: string } | null;
  guests: Guest[];
  menu: Array<{ id: number; name: string; sortOrder: number; options: Array<{ id: number; name: string; sortOrder: number }> }>;
}

const route = useRoute()
const { data, status } = await useFetch<DetailResponse>(`/api/admin/events/${route.params.id}`)

const optionNameById = computed(() => {
  const map = new Map<number, string>()
  for (const c of data.value?.menu ?? []) {
    for (const o of c.options) map.set(o.id, o.name)
  }
  return map
})

function fmtAllergies(a: { keys: string[]; other: string }) {
  const parts = [...a.keys]
  if (a.other) parts.push(`"${a.other}"`)
  return parts.join(', ') || '—'
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Event detail</h1>
      <NuxtLinkLocale to="/dashboard/admin/events" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to events</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <template v-else-if="data">
      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Event</h2>
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div v-for="(value, key) in data.event" :key="key">
            <dt class="text-charcoal-500">{{ key }}</dt>
            <dd class="text-charcoal-900 font-medium break-all">{{ value === null ? '—' : typeof value === 'boolean' ? (value ? 'yes' : 'no') : value }}</dd>
          </div>
        </dl>
        <details v-if="data.event.customization" class="mt-4">
          <summary class="text-sm text-charcoal-700 cursor-pointer">customization JSON</summary>
          <pre class="mt-2 text-xs bg-ivory-50 p-3 rounded overflow-x-auto">{{ data.event.customization }}</pre>
        </details>
      </section>

      <section v-if="data.owner" class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">Owner</h2>
        <NuxtLinkLocale :to="`/dashboard/admin/users/${data.owner.id}`" class="text-charcoal-900 hover:underline">
          {{ data.owner.email }} ({{ data.owner.name }})
        </NuxtLinkLocale>
      </section>

      <section v-if="data.tier" class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">Tier</h2>
        <pre class="text-xs bg-ivory-50 p-3 rounded overflow-x-auto">{{ JSON.stringify(data.tier, null, 2) }}</pre>
      </section>

      <section v-if="data.template" class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">Template</h2>
        <p class="text-sm text-charcoal-700">{{ data.template.slug }} <span class="text-charcoal-500">({{ data.template.category }})</span></p>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Menu</h2>
        <p v-if="!data.menu.length" class="text-charcoal-500 text-sm">No menu.</p>
        <div v-for="c in data.menu" :key="c.id" class="mb-3">
          <p class="font-medium text-charcoal-900">{{ c.name }}</p>
          <ul class="text-sm text-charcoal-700 list-disc list-inside">
            <li v-for="o in c.options" :key="o.id">{{ o.name }}</li>
          </ul>
        </div>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Guests ({{ data.guests.length }})</h2>
        <p v-if="!data.guests.length" class="text-charcoal-500 text-sm">No guests.</p>
        <div v-for="g in data.guests" :key="g.id" class="border-t border-charcoal-100 first:border-t-0 py-3">
          <details>
            <summary class="cursor-pointer flex items-center justify-between">
              <span class="text-charcoal-900 font-medium">{{ g.name }}</span>
              <span class="text-xs text-charcoal-500">
                {{ g.rsvpStatus }} · companions {{ g.companions.length }}/{{ g.companionsAllowed }}
              </span>
            </summary>
            <div class="mt-3 text-sm text-charcoal-700 space-y-2 pl-4">
              <p>email: {{ g.email ?? '—' }} · phone: {{ g.phone ?? '—' }}</p>
              <p>allergies: {{ fmtAllergies(g.allergies) }}</p>
              <p v-if="data.menu.length">
                menu:
                <span v-for="c in data.menu" :key="c.id" class="mr-3">
                  {{ c.name }}: {{ optionNameById.get(g.menuChoices[c.id] ?? -1) ?? '—' }}
                </span>
              </p>
              <div v-if="g.companions.length" class="mt-2">
                <p class="text-charcoal-500 text-xs uppercase mb-1">Companions</p>
                <div v-for="comp in g.companions" :key="comp.id" class="pl-3 py-1 border-l-2 border-charcoal-100">
                  <p>#{{ comp.position }} {{ comp.name ?? '(unnamed)' }} — {{ comp.attending ? 'attending' : 'not attending' }}</p>
                  <p class="text-xs">allergies: {{ fmtAllergies(comp.allergies) }}</p>
                  <p v-if="data.menu.length && comp.attending" class="text-xs">
                    <span v-for="c in data.menu" :key="c.id" class="mr-3">
                      {{ c.name }}: {{ optionNameById.get(comp.menuChoices[c.id] ?? -1) ?? '—' }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/admin/events/[id].vue
git commit -m "feat(admin): add event detail page with full guest drill-down"
```

---

## Task 16: Subscriptions list page

**Files:**
- Create: `pages/dashboard/admin/subscriptions/index.vue`

- [ ] **Step 1: Create the page**

Create `pages/dashboard/admin/subscriptions/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Row = {
  id: number; stripeSubscriptionId: string; stripeCustomerId: string; status: string;
  price: number; currentPeriodStart: string | null; currentPeriodEnd: string | null;
  canceledAt: string | null; createdAt: string | null;
  user: { id: number; email: string; name: string };
}

const PAGE_SIZE = 50
const offset = ref(0)
const statusFilter = ref('')
watch(statusFilter, () => { offset.value = 0 })

const url = computed(() => {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset.value))
  if (statusFilter.value) params.set('status', statusFilter.value)
  return `/api/admin/subscriptions?${params.toString()}`
})

const { data, status, refresh } = await useFetch<{ rows: Row[]; total: number; limit: number; offset: number }>(url)
watch(url, () => refresh())

const showingFrom = computed(() => (data.value ? offset.value + 1 : 0))
const showingTo = computed(() => Math.min(offset.value + PAGE_SIZE, data.value?.total ?? 0))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Subscriptions</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <div class="mb-4">
      <select v-model="statusFilter" class="px-4 py-2 border border-charcoal-200 rounded-full text-sm">
        <option value="">All statuses</option>
        <option value="active">active</option>
        <option value="canceled">canceled</option>
        <option value="past_due">past_due</option>
        <option value="incomplete">incomplete</option>
        <option value="incomplete_expired">incomplete_expired</option>
        <option value="trialing">trialing</option>
        <option value="unpaid">unpaid</option>
      </select>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.rows.length" class="text-center py-12 text-charcoal-500">No subscriptions.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">User</th>
            <th class="text-left px-4 py-2">Status</th>
            <th class="text-left px-4 py-2">Price</th>
            <th class="text-left px-4 py-2">Period end</th>
            <th class="text-left px-4 py-2">Canceled</th>
            <th class="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.rows" :key="row.id" class="border-t border-charcoal-100 hover:bg-ivory-50">
            <td class="px-4 py-2 text-charcoal-500">{{ row.id }}</td>
            <td class="px-4 py-2">
              <NuxtLinkLocale :to="`/dashboard/admin/users/${row.user.id}`" class="text-charcoal-900 hover:underline">
                {{ row.user.email }}
              </NuxtLinkLocale>
            </td>
            <td class="px-4 py-2">{{ row.status }}</td>
            <td class="px-4 py-2">{{ row.price }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ row.currentPeriodEnd ?? '—' }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ row.canceledAt ?? '—' }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ row.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && data.total > 0" class="flex items-center justify-between mt-4 text-sm text-charcoal-500">
      <span>Showing {{ showingFrom }}–{{ showingTo }} of {{ data.total }}</span>
      <div class="flex gap-2">
        <button :disabled="offset === 0" @click="offset = Math.max(0, offset - PAGE_SIZE)"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Prev</button>
        <button :disabled="offset + PAGE_SIZE >= data.total" @click="offset = offset + PAGE_SIZE"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Next</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/admin/subscriptions/index.vue
git commit -m "feat(admin): add subscriptions list page"
```

---

## Task 17: Tiers and Templates list pages

**Files:**
- Create: `pages/dashboard/admin/tiers/index.vue`
- Create: `pages/dashboard/admin/templates/index.vue`

- [ ] **Step 1: Create the tiers page**

Create `pages/dashboard/admin/tiers/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Tier = {
  id: number; name: string; slug: string; price: number; sortOrder: number;
  guestLimit: number | null;
  hasEmailDelivery: boolean | null; hasPdfExport: boolean | null;
  hasAiTextGeneration: boolean | null; removeBranding: boolean | null;
  hasMultipleVariants: boolean | null; createdAt: string | null;
}

const { data, status } = await useFetch<Tier[]>('/api/admin/tiers')
const tick = (v: boolean | null) => (v ? '✓' : '—')
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Tiers</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.length" class="text-center py-12 text-charcoal-500">No tiers.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Slug</th>
            <th class="text-left px-4 py-2">Name</th>
            <th class="text-left px-4 py-2">Price</th>
            <th class="text-left px-4 py-2">Sort</th>
            <th class="text-left px-4 py-2">Guest limit</th>
            <th class="text-left px-4 py-2">Email</th>
            <th class="text-left px-4 py-2">PDF</th>
            <th class="text-left px-4 py-2">AI</th>
            <th class="text-left px-4 py-2">No brand</th>
            <th class="text-left px-4 py-2">Variants</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in data" :key="t.id" class="border-t border-charcoal-100">
            <td class="px-4 py-2 text-charcoal-500">{{ t.id }}</td>
            <td class="px-4 py-2">{{ t.slug }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ t.name }}</td>
            <td class="px-4 py-2">{{ t.price }}</td>
            <td class="px-4 py-2">{{ t.sortOrder }}</td>
            <td class="px-4 py-2">{{ t.guestLimit ?? '∞' }}</td>
            <td class="px-4 py-2">{{ tick(t.hasEmailDelivery) }}</td>
            <td class="px-4 py-2">{{ tick(t.hasPdfExport) }}</td>
            <td class="px-4 py-2">{{ tick(t.hasAiTextGeneration) }}</td>
            <td class="px-4 py-2">{{ tick(t.removeBranding) }}</td>
            <td class="px-4 py-2">{{ tick(t.hasMultipleVariants) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Create the templates page**

Create `pages/dashboard/admin/templates/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Tpl = {
  id: number; name: string; slug: string; category: string;
  colorScheme: string; fontPairings: string; tags: string;
  createdAt: string | null;
  minimumTier: { id: number; slug: string; name: string };
}

const { data, status } = await useFetch<Tpl[]>('/api/admin/templates')
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Templates</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.length" class="text-center py-12 text-charcoal-500">No templates.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Slug</th>
            <th class="text-left px-4 py-2">Name</th>
            <th class="text-left px-4 py-2">Category</th>
            <th class="text-left px-4 py-2">Min tier</th>
            <th class="text-left px-4 py-2">Tags</th>
            <th class="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in data" :key="t.id" class="border-t border-charcoal-100">
            <td class="px-4 py-2 text-charcoal-500">{{ t.id }}</td>
            <td class="px-4 py-2">{{ t.slug }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ t.name }}</td>
            <td class="px-4 py-2">{{ t.category }}</td>
            <td class="px-4 py-2">{{ t.minimumTier.slug }}</td>
            <td class="px-4 py-2 text-xs text-charcoal-500 break-all">{{ t.tags }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ t.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Smoke-check the build**

```bash
npx nuxt prepare
```

Expected: completes without TS errors.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/admin/tiers/index.vue pages/dashboard/admin/templates/index.vue
git commit -m "feat(admin): add tiers and templates list pages"
```

---

## Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, including the new `server/utils/__tests__/admin.test.ts` and `server/api/__tests__/admin.test.ts`.

- [ ] **Step 2: Manually verify in the dev server**

Set `ADMIN_EMAILS` in `.env` to your own dev email, then:

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` while logged in as that email. Verify:
1. An "Admin" link appears in the sidebar.
2. `/dashboard/admin` shows the stats tiles and nav cards.
3. Each list page renders rows with no console errors.
4. Clicking a row opens the corresponding detail page.
5. Logging in as a non-admin user makes `/dashboard/admin` redirect to `/dashboard`.
6. Hitting `/api/admin/stats` as a non-admin returns 403.

If any of those fail, fix in place before declaring complete.

# Guest Limit Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the tier-based guest limit on both the add-guest and import-guests API endpoints so users cannot exceed their plan's allowed number of guests.

**Architecture:** A shared helper function `assertGuestLimit` fetches the event with its tier and current guest count, then throws a 403 if adding `n` guests would exceed the tier's `guestLimit`. Both the single-add and CSV-import endpoints call this helper before inserting. The Pro tier has `guestLimit: null` which means unlimited.

**Tech Stack:** Nuxt/h3 server handlers, Drizzle ORM, Vitest, SQLite (better-sqlite3 for tests)

---

### Task 1: Write failing tests for guest limit on single add

**Files:**
- Modify: `server/api/__tests__/guests.test.ts`

- [ ] **Step 1: Add test — rejects adding a guest when at tier limit**

Add this test inside the `POST /api/events/:id/guests` describe block:

```ts
it('rejects adding a guest when tier guest limit is reached (403)', async () => {
  seedTiers(testDb)
  // Basic tier (id=1) has guestLimit=50
  const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

  // Add 50 guests to reach the limit
  for (let i = 0; i < 50; i++) {
    createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
  }

  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(limitedEvt.id) },
    body: { name: 'One Too Many' },
  })

  await expect(addHandler(event)).rejects.toMatchObject({
    statusCode: 403,
    statusMessage: 'Guest limit reached for your plan (50)',
  })
})
```

Also add the `seedTiers` import at the top of the file — update the import from `../../__helpers__/db`:

```ts
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  seedTiers,
  type TestDb,
} from '../../__helpers__/db'
```

- [ ] **Step 2: Add test — allows adding a guest when under limit**

Add this test in the same describe block:

```ts
it('allows adding a guest when under tier guest limit', async () => {
  seedTiers(testDb)
  const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

  // Add 49 guests — one under the limit
  for (let i = 0; i < 49; i++) {
    createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
  }

  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(limitedEvt.id) },
    body: { name: 'Just Fits' },
  })

  const result = await addHandler(event)
  expect(result.name).toBe('Just Fits')
})
```

- [ ] **Step 3: Add test — unlimited guests for Pro tier (null guestLimit)**

```ts
it('allows unlimited guests when tier has no guest limit (Pro)', async () => {
  seedTiers(testDb)
  // Pro tier (id=3) has guestLimit=null
  const proEvt = createTestEvent(testDb, user.id, { tierId: 3, paymentStatus: 'paid' })

  for (let i = 0; i < 100; i++) {
    createTestGuest(testDb, proEvt.id, { name: `Guest ${i}` })
  }

  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(proEvt.id) },
    body: { name: 'No Limit' },
  })

  const result = await addHandler(event)
  expect(result.name).toBe('No Limit')
})
```

- [ ] **Step 4: Add test — no enforcement when event has no tier (unpaid/wizard flow)**

```ts
it('allows adding guests when event has no tier assigned', async () => {
  // No tier assigned (tierId: null) — wizard flow before payment
  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(evt.id) },
    body: { name: 'Pre-Payment Guest' },
  })

  const result = await addHandler(event)
  expect(result.name).toBe('Pre-Payment Guest')
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run server/api/__tests__/guests.test.ts`
Expected: The "rejects adding a guest when tier guest limit is reached" test FAILs (no 403 thrown). The "allows" tests should PASS (no enforcement yet means no rejection).

- [ ] **Step 6: Commit**

```bash
git add server/api/__tests__/guests.test.ts
git commit -m "test: add failing tests for guest limit enforcement on single add"
```

---

### Task 2: Implement guest limit check in single-add endpoint

**Files:**
- Modify: `server/api/events/[id]/guests/index.post.ts`

- [ ] **Step 1: Add guest limit enforcement to the add handler**

Replace the full contents of `server/api/events/[id]/guests/index.post.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Guest name is required' })
  }

  // Enforce guest limit if tier is assigned and has a limit
  if (evt.tier?.guestLimit != null) {
    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(guests)
      .where(eq(guests.eventId, id))

    if (currentCount >= evt.tier.guestLimit) {
      throw createError({
        statusCode: 403,
        statusMessage: `Guest limit reached for your plan (${evt.tier.guestLimit})`,
      })
    }
  }

  const [guest] = await db.insert(guests).values({
    eventId: id,
    name: body.name.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    token: crypto.randomUUID(),
  }).returning()

  return guest
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run server/api/__tests__/guests.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/api/events/[id]/guests/index.post.ts
git commit -m "feat: enforce tier guest limit on single guest add endpoint"
```

---

### Task 3: Write failing tests for guest limit on CSV import

**Files:**
- Modify: `server/api/__tests__/guests.test.ts`

- [ ] **Step 1: Add test — rejects import when it would exceed limit**

Add this test inside the `POST /api/events/:id/guests/import` describe block:

```ts
it('rejects import when it would exceed tier guest limit (403)', async () => {
  seedTiers(testDb)
  const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

  // Add 48 guests — 2 remaining
  for (let i = 0; i < 48; i++) {
    createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
  }

  // Try to import 3 guests — exceeds limit by 1
  const csv = 'Alice,alice@example.com\nBob,bob@example.com\nCharlie,charlie@example.com'

  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(limitedEvt.id) },
    body: { csv },
  })

  await expect(importHandler(event)).rejects.toMatchObject({
    statusCode: 403,
    statusMessage: 'Import would exceed guest limit for your plan (50). You can add 2 more guests.',
  })
})
```

- [ ] **Step 2: Add test — allows import when within limit**

```ts
it('allows import when within tier guest limit', async () => {
  seedTiers(testDb)
  const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

  // Add 47 guests — 3 remaining
  for (let i = 0; i < 47; i++) {
    createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
  }

  const csv = 'Alice,alice@example.com\nBob,bob@example.com\nCharlie,charlie@example.com'

  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(limitedEvt.id) },
    body: { csv },
  })

  const result = await importHandler(event)
  expect(result).toEqual({ imported: 3 })
})
```

- [ ] **Step 3: Run tests to verify the rejection test fails**

Run: `npx vitest run server/api/__tests__/guests.test.ts`
Expected: The "rejects import" test FAILs. The "allows import" test PASSes.

- [ ] **Step 4: Commit**

```bash
git add server/api/__tests__/guests.test.ts
git commit -m "test: add failing tests for guest limit enforcement on CSV import"
```

---

### Task 4: Implement guest limit check in CSV import endpoint

**Files:**
- Modify: `server/api/events/[id]/guests/import.post.ts`

- [ ] **Step 1: Add guest limit enforcement to the import handler**

Replace the full contents of `server/api/events/[id]/guests/import.post.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  if (!body.csv?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'CSV data is required' })
  }

  const lines = body.csv
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)

  const values = lines.map((line: string) => {
    const parts = line.split(',').map((p: string) => p.trim())
    const name = parts[0]
    const email = parts[1] || null
    return {
      eventId: id,
      name,
      email,
      token: crypto.randomUUID(),
    }
  }).filter((v: { name: string }) => v.name.length > 0)

  if (values.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid entries found in CSV' })
  }

  // Enforce guest limit if tier is assigned and has a limit
  if (evt.tier?.guestLimit != null) {
    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(guests)
      .where(eq(guests.eventId, id))

    const remaining = evt.tier.guestLimit - currentCount
    if (values.length > remaining) {
      throw createError({
        statusCode: 403,
        statusMessage: `Import would exceed guest limit for your plan (${evt.tier.guestLimit}). You can add ${remaining} more guests.`,
      })
    }
  }

  await db.insert(guests).values(values)

  return { imported: values.length }
})
```

- [ ] **Step 2: Run tests to verify they all pass**

Run: `npx vitest run server/api/__tests__/guests.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/api/events/[id]/guests/import.post.ts
git commit -m "feat: enforce tier guest limit on CSV guest import endpoint"
```

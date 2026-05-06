# Decouple allergies from menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dietary-allergies feature on the RSVP page togglable independently of the menu feature. An event can have allergies on, menu on, both, or neither.

**Architecture:** Add a single boolean column `allergies_enabled` on the `events` table (default `false`). The wizard, event admin, RSVP page, and admin guest views all key off this new flag. Menu remains inferred from the existence of `menuCourses` rows (unchanged). Server endpoints gate allergy validation/serialization on the new flag.

**Tech Stack:** Nuxt 3 (Vue 3), Drizzle ORM (SQLite via better-sqlite3), Vitest, `@nuxtjs/i18n`, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-06-allergies-decoupled-from-menu-design.md`

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `server/db/schema.ts` | modify | Add `allergiesEnabled` field on `events` |
| `server/db/migrations/0006_*.sql` | create | Drizzle-generated migration adding the column |
| `server/__helpers__/db.ts` | modify | Add `allergies_enabled` to in-memory `events` CREATE TABLE; add it to `createTestEvent` overrides |
| `server/api/events/index.post.ts` | modify | Accept `allergiesEnabled` on create |
| `server/api/events/[id].put.ts` | modify | Accept `allergiesEnabled` on update |
| `server/api/rsvp/[token].get.ts` | modify | Return `allergiesEnabled`; null out allergies when off |
| `server/api/rsvp/[token].post.ts` | modify | Gate allergy validation/persist on `allergiesEnabled` (independent of menu) |
| `server/api/__tests__/rsvp.test.ts` | modify | Update existing tests + add new gating tests |
| `server/api/__tests__/events.test.ts` | modify | Add tests for create/update with `allergiesEnabled` |
| `i18n/lang/en.json` | modify | Add new keys; rename `menu.tab.label` |
| `i18n/lang/es.json` | modify | Add new keys; rename `menu.tab.label` |
| `pages/dashboard/events/new.vue` | modify | Add `Ask for allergies` checkbox; send `allergiesEnabled` |
| `pages/dashboard/events/[id]/menu.vue` | modify | Add allergies toggle card above menu builder |
| `pages/i/[slug].vue` | modify | Move allergies block out of menu conditional; gate on `event.allergiesEnabled` |
| `pages/dashboard/events/[id]/guests.vue` | modify | Gate allergy UI bits on `event.allergiesEnabled` |

---

## Task 1: Schema column + migration + test helper

**Files:**
- Modify: `server/db/schema.ts:92-113`
- Create: `server/db/migrations/0006_<auto_name>.sql`
- Modify: `server/__helpers__/db.ts:57-78` (in-memory events table) and `:198-221` (`createTestEvent`)

- [ ] **Step 1: Add the column to the Drizzle schema**

In `server/db/schema.ts`, inside the `events` table definition (the block starting `export const events = sqliteTable('events', { ... })`), add `allergiesEnabled` between `language` and `slug`:

```ts
  language: text('language').notNull().default('en'),
  allergiesEnabled: integer('allergies_enabled', { mode: 'boolean' }).notNull().default(false),
  slug: text('slug').notNull().unique(),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`

Expected: a new file `server/db/migrations/0006_*.sql` is created. Inspect it — it should add `allergies_enabled` to `events` (Drizzle uses the SQLite "create __new_events / copy / rename" pattern). If the generator emits multiple unrelated tables (it sometimes recreates everything), accept that — the existing migration 0005 has the same pattern.

- [ ] **Step 3: Apply the migration locally**

Run: `npm run db:migrate`

Expected: console prints `[migrate] done` with no errors. The local SQLite database now has the column.

- [ ] **Step 4: Update the in-memory test schema**

In `server/__helpers__/db.ts`, in the `CREATE TABLE events` block (lines 57-78), add a new line after `language TEXT NOT NULL DEFAULT 'en',`:

```sql
      allergies_enabled INTEGER NOT NULL DEFAULT 0,
```

So the relevant chunk reads:

```sql
      language TEXT NOT NULL DEFAULT 'en',
      allergies_enabled INTEGER NOT NULL DEFAULT 0,
      slug TEXT NOT NULL UNIQUE,
```

- [ ] **Step 5: Add `allergiesEnabled` to `createTestEvent` overrides**

In `server/__helpers__/db.ts`, modify `createTestEvent` (line 198 onwards) so callers can opt the test event into allergies. Update the type list and the `values()` payload:

```ts
export function createTestEvent(db: TestDb, userId: number, overrides?: Partial<{
  title: string; coupleName1: string; coupleName2: string; date: string;
  venue: string; venueAddress: string; slug: string; tierId: number | null;
  templateId: number | null; paymentStatus: string; customization: string | null;
  invitationType: string; customImagePath: string | null;
  allergiesEnabled: boolean;
}>) {
  const rows = db.insert(events).values({
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
    invitationType: overrides?.invitationType || 'template',
    customImagePath: overrides?.customImagePath ?? null,
    allergiesEnabled: overrides?.allergiesEnabled ?? false,
  }).returning().all()
  return rows[0]
}
```

- [ ] **Step 6: Run the existing test suite to make sure nothing regressed**

Run: `npm test`

Expected: all tests still pass. The new column has a default and is opt-in for callers, so no behavior change yet.

- [ ] **Step 7: Commit**

```bash
git add server/db/schema.ts server/db/migrations/0006_*.sql server/__helpers__/db.ts
git commit -m "feat(menu): add events.allergies_enabled column + migration"
```

---

## Task 2: RSVP GET — return `allergiesEnabled`, gate allergy fields

**Files:**
- Modify: `server/api/rsvp/[token].get.ts`
- Modify: `server/api/__tests__/rsvp.test.ts`

- [ ] **Step 1: Write a failing test — GET returns `allergiesEnabled` and nulls allergies when flag is off**

Open `server/api/__tests__/rsvp.test.ts`. In the `describe('GET /api/rsvp/:token — menu fields', ...)` block (around line 253), add two new tests after the existing ones:

```ts
  it('returns allergiesEnabled = false by default and nulls stored allergies', async () => {
    testDb.update(guestsTable).set({
      allergies: JSON.stringify({ keys: ['nuts'], other: '' }),
      plusOneAllergies: JSON.stringify({ keys: ['dairy'], other: '' }),
    }).where(eq(guestsTable.id, guest.id)).run()

    const result = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))

    expect(result.allergiesEnabled).toBe(false)
    expect(result.allergies).toBeNull()
    expect(result.plusOneAllergies).toBeNull()
  })

  it('returns stored allergies when allergiesEnabled = true', async () => {
    const evtRow = testDb.select().from((await import('../../db/schema')).events).all()[0]
    testDb.update((await import('../../db/schema')).events)
      .set({ allergiesEnabled: true })
      .where(eq((await import('../../db/schema')).events.id, evtRow.id)).run()
    testDb.update(guestsTable).set({
      allergies: JSON.stringify({ keys: ['nuts'], other: '' }),
    }).where(eq(guestsTable.id, guest.id)).run()

    const result = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))

    expect(result.allergiesEnabled).toBe(true)
    expect(result.allergies).toEqual({ keys: ['nuts'], other: '' })
  })
```

Note: `eq` and `guestsTable` are already imported at the top of the test file.

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `npm test -- rsvp`

Expected: both new tests fail because `result.allergiesEnabled` is `undefined`.

- [ ] **Step 3: Update the GET handler**

Edit `server/api/rsvp/[token].get.ts`. Replace the file's body so the handler also loads the event row and gates allergy fields:

```ts
import { db } from '~/server/db'
import { events, guests, menuCourses, menuOptions, guestMenuChoices } from '~/server/db/schema'
import { eq, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const evt = await db.query.events.findFirst({
    where: eq(events.id, guest.eventId),
  })
  const allergiesEnabled = evt?.allergiesEnabled === true

  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, guest.eventId),
    orderBy: [asc(menuCourses.sortOrder), asc(menuCourses.id)],
    with: { options: { orderBy: [asc(menuOptions.sortOrder), asc(menuOptions.id)] } },
  })
  const menu = courses.length === 0 ? null : {
    courses: courses.map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: c.options.map(o => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }

  const myChoices = menu === null ? [] : await db.query.guestMenuChoices.findMany({
    where: eq(guestMenuChoices.guestId, guest.id),
  })
  const choices: Record<number, number> = {}
  const plusOneChoices: Record<number, number> = {}
  for (const ch of myChoices) {
    if (ch.optionId == null) continue
    if (ch.forPlusOne) plusOneChoices[ch.courseId] = ch.optionId
    else choices[ch.courseId] = ch.optionId
  }

  return {
    name: guest.name,
    rsvpStatus: guest.rsvpStatus,
    plusOne: guest.plusOne,
    plusOneName: guest.plusOneName,
    menu,
    choices,
    plusOneChoices,
    allergiesEnabled,
    allergies: allergiesEnabled ? parseAllergies(guest.allergies) : null,
    plusOneAllergies: allergiesEnabled ? parseAllergies(guest.plusOneAllergies) : null,
  }
})
```

- [ ] **Step 4: Update existing GET test that asserts allergies content**

The pre-existing test `returns menu tree and existing choices` (around line 273) writes allergies to the guest and expects them back. With the new gate, it now needs `allergiesEnabled = true` on the event. Edit it so that, immediately after creating the menu rows, it sets the flag:

```ts
  it('returns menu tree and existing choices', async () => {
    // Build a menu under the same event the guest belongs to.
    const evt = testDb.select().from((await import('../../db/schema')).events).all()[0]
    testDb.update((await import('../../db/schema')).events)
      .set({ allergiesEnabled: true })
      .where(eq((await import('../../db/schema')).events.id, evt.id)).run()
    const [course] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'First', sortOrder: 0 }).returning().all()
    const [opt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Beef', sortOrder: 0 }).returning().all()
    testDb.insert(guestMenuChoices).values({ guestId: guest.id, courseId: course.id, optionId: opt.id, forPlusOne: false }).run()
    testDb.update(guestsTable).set({ allergies: JSON.stringify({ keys: ['nuts'], other: '' }) }).where(eq(guestsTable.id, guest.id)).run()

    const event = createMockEvent({ params: { token: 'valid-token-123' } })
    const result = await getHandler(event)

    expect(result.menu?.courses).toHaveLength(1)
    expect(result.choices).toEqual({ [course.id]: opt.id })
    expect(result.allergies).toEqual({ keys: ['nuts'], other: '' })
  })
```

- [ ] **Step 5: Run the rsvp tests and confirm pass**

Run: `npm test -- rsvp`

Expected: all rsvp tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/api/rsvp/\[token\].get.ts server/api/__tests__/rsvp.test.ts
git commit -m "feat(menu): expose allergiesEnabled on RSVP GET; gate allergy fields"
```

---

## Task 3: RSVP POST — gate allergies on `allergiesEnabled` (independent of menu)

**Files:**
- Modify: `server/api/rsvp/[token].post.ts`
- Modify: `server/api/__tests__/rsvp.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block at the end of `server/api/__tests__/rsvp.test.ts`, before the final closing brace of the file:

```ts
describe('POST /api/rsvp/:token — allergies gating (independent of menu)', () => {
  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    const evt = createTestEvent(testDb, user.id, { allergiesEnabled: true })
    guest = createTestGuest(testDb, evt.id, {
      name: 'Invitee',
      email: 'invitee@example.com',
      token: 'valid-token-123',
    })
  })

  it('persists allergies when allergiesEnabled = true and no menu exists', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        allergies: { keys: ['nuts'], other: 'sesame' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.allergies).toEqual({ keys: ['nuts'], other: 'sesame' })
  })

  it('persists plus-one allergies when allergiesEnabled = true and no menu exists', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner',
        allergies: { keys: [], other: '' },
        plusOneAllergies: { keys: ['dairy'], other: '' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.plusOneAllergies).toEqual({ keys: ['dairy'], other: '' })
  })

  it('ignores allergy fields when allergiesEnabled = false', async () => {
    // Flip the flag off for this test
    const { events: eventsTable } = await import('../../db/schema')
    const evtRow = testDb.select().from(eventsTable).all()[0]
    testDb.update(eventsTable).set({ allergiesEnabled: false }).where(eq(eventsTable.id, evtRow.id)).run()

    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        allergies: { keys: ['nuts'], other: '' },
      },
    }))

    const stored = testDb.select().from(guestsTable).where(eq(guestsTable.id, guest.id)).all()[0]
    expect(stored.allergies).toBeNull()
  })
})
```

- [ ] **Step 2: Run the new tests; confirm failure**

Run: `npm test -- rsvp`

Expected: the three new tests fail. The current handler validates allergies whenever `isConfirming`, but persists them only inside `if (isConfirming && hasMenu)` — wait, re-reading the file: it writes `allergies` on the guest row regardless of menu, *but* the GET handler used to gate allergy display on menu via the page (not the API). Whichever way, the third test ("ignores allergy fields when allergiesEnabled = false") will fail because the POST currently persists allergies whenever `isConfirming`. The first two tests *may* already pass, depending on read path; that's fine.

- [ ] **Step 3: Update the POST handler to gate on the flag**

Replace the body of `server/api/rsvp/[token].post.ts` with:

```ts
import { db } from '~/server/db'
import { events, guests, menuCourses, guestMenuChoices } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { validateAllergies, serializeAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const body = await readBody(event)
  const { rsvpStatus, plusOne, plusOneName, menuChoices, plusOneMenuChoices, allergies, plusOneAllergies } = body

  if (!['confirmed', 'declined'].includes(rsvpStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP status' })
  }

  const guest = await db.query.guests.findFirst({ where: eq(guests.token, token) })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const evt = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) })
  const allergiesEnabled = evt?.allergiesEnabled === true

  const isConfirming = rsvpStatus === 'confirmed'
  const wantsPlusOne = isConfirming && !!plusOne

  // Load this event's menu (used for validation)
  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, guest.eventId),
    with: { options: true },
  })
  const hasMenu = courses.length > 0

  // Validate picks only when confirming AND a menu exists
  function validatePickMap(picks: unknown, label: 'menuChoices' | 'plusOneMenuChoices') {
    const out: Array<{ courseId: number; optionId: number }> = []
    if (!picks || typeof picks !== 'object') {
      throw createError({ statusCode: 400, statusMessage: `${label} required` })
    }
    for (const c of courses) {
      const raw = (picks as any)[c.id]
      const optionId = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(optionId)) {
        throw createError({ statusCode: 400, statusMessage: `${label}: missing pick for course ${c.name}` })
      }
      const option = c.options.find(o => o.id === optionId)
      if (!option) {
        throw createError({ statusCode: 400, statusMessage: `${label}: option ${optionId} does not belong to course ${c.name}` })
      }
      out.push({ courseId: c.id, optionId })
    }
    return out
  }

  let selfPicks: Array<{ courseId: number; optionId: number }> = []
  let p1Picks: Array<{ courseId: number; optionId: number }> = []
  let selfAllergies = null
  let p1AllergiesParsed = null

  if (isConfirming && hasMenu) {
    selfPicks = validatePickMap(menuChoices, 'menuChoices')
    if (wantsPlusOne) p1Picks = validatePickMap(plusOneMenuChoices, 'plusOneMenuChoices')
  }
  if (isConfirming && allergiesEnabled) {
    selfAllergies = validateAllergies(allergies)
    if (wantsPlusOne) p1AllergiesParsed = validateAllergies(plusOneAllergies)
  }

  // Persist guest row + choices atomically
  db.transaction((tx) => {
    tx.update(guests).set({
      rsvpStatus,
      plusOne: wantsPlusOne,
      plusOneName: wantsPlusOne ? plusOneName : null,
      allergies: isConfirming && allergiesEnabled ? serializeAllergies(selfAllergies) : null,
      plusOneAllergies: wantsPlusOne && allergiesEnabled ? serializeAllergies(p1AllergiesParsed) : null,
    }).where(eq(guests.token, token)).run()

    // Replace this guest's choice rows
    tx.delete(guestMenuChoices).where(eq(guestMenuChoices.guestId, guest.id)).run()
    if (isConfirming && hasMenu) {
      const rows = [
        ...selfPicks.map(p => ({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, forPlusOne: false })),
        ...(wantsPlusOne ? p1Picks.map(p => ({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, forPlusOne: true })) : []),
      ]
      if (rows.length) tx.insert(guestMenuChoices).values(rows).run()
    }
  })

  return { success: true, rsvpStatus }
})
```

- [ ] **Step 4: Update existing POST test `saves menu picks and allergies`**

That test creates an event without `allergiesEnabled = true`, so allergies will no longer persist. Edit it so the test event has `allergiesEnabled: true`. In the `describe('POST /api/rsvp/:token — menu picks', ...)` block, modify the `beforeEach` to pass the override:

```ts
    const evt = createTestEvent(testDb, user.id, { allergiesEnabled: true })
```

Replace just the `createTestEvent` call (around line 167) — leave everything else.

- [ ] **Step 5: Run all rsvp tests**

Run: `npm test -- rsvp`

Expected: all rsvp tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/api/rsvp/\[token\].post.ts server/api/__tests__/rsvp.test.ts
git commit -m "feat(menu): gate allergy validation/persist on event.allergiesEnabled"
```

---

## Task 4: Events POST — accept `allergiesEnabled` on create

**Files:**
- Modify: `server/api/events/index.post.ts`
- Modify: `server/api/__tests__/events.test.ts`

- [ ] **Step 1: Write a failing test**

Open `server/api/__tests__/events.test.ts`. The file already imports `createHandler` from `../events/index.post` and provides an `authEvent(userId, email, overrides)` helper that wraps `createMockEvent` with a signed auth cookie. Inside the existing `describe('POST /api/events', ...)` block, add two new tests:

```ts
    it('persists allergiesEnabled when provided', async () => {
      const user = await createTestUser(testDb, { email: 'create-a@test.com', name: 'CA' })
      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: {
          title: 'Wedding', coupleName1: 'Alice', coupleName2: 'Bob',
          date: '2026-06-15', venue: 'Hall', venueAddress: '1 St',
          allergiesEnabled: true,
        },
      })
      const created = await createHandler(event)
      expect(created.allergiesEnabled).toBe(true)
    })

    it('defaults allergiesEnabled to false when not provided', async () => {
      const user = await createTestUser(testDb, { email: 'create-b@test.com', name: 'CB' })
      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: {
          title: 'Wedding', coupleName1: 'Alice', coupleName2: 'Bob',
          date: '2026-06-15', venue: 'Hall', venueAddress: '1 St',
        },
      })
      const created = await createHandler(event)
      expect(created.allergiesEnabled).toBe(false)
    })
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- events`

Expected: the first test fails with `created.allergiesEnabled` being `false` (because the handler ignores the field today). The defaults test may pass already.

- [ ] **Step 3: Update the create handler**

Edit `server/api/events/index.post.ts`. After the existing destructure (line 21), add `allergiesEnabled` to the destructured fields, then add it to `eventData`:

```ts
  const { title, coupleName1, coupleName2, date, venue, venueAddress, venueMapUrl, description, allergiesEnabled } = body
```

And in the `eventData` object (lines 35-46), add the field at the end:

```ts
  const eventData: Record<string, unknown> = {
    userId: user.id,
    title,
    coupleName1,
    coupleName2,
    date,
    venue,
    venueAddress,
    venueMapUrl: venueMapUrl || null,
    description: description || null,
    slug,
    allergiesEnabled: allergiesEnabled === true,
  }
```

The `=== true` coercion ensures `undefined`/missing → `false`, and any truthy non-boolean is rejected (defense-in-depth).

- [ ] **Step 4: Run tests**

Run: `npm test -- events`

Expected: both new tests pass; pre-existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add server/api/events/index.post.ts server/api/__tests__/events.test.ts
git commit -m "feat(menu): accept allergiesEnabled on POST /api/events"
```

---

## Task 5: Events PUT — accept `allergiesEnabled` on update

**Files:**
- Modify: `server/api/events/[id].put.ts`
- Modify: `server/api/__tests__/events.test.ts`

- [ ] **Step 1: Write a failing test**

Inside `server/api/__tests__/events.test.ts`, in the existing `describe('PUT /api/events/:id', ...)` block (or wherever `updateHandler` is exercised — the file imports it as `updateHandler`), add:

```ts
    it('updates allergiesEnabled', async () => {
      const user = await createTestUser(testDb, { email: 'put-a@test.com', name: 'PA' })
      const evt = createTestEvent(testDb, user!.id, { allergiesEnabled: false })

      const event = authEvent(user!.id, user!.email, {
        method: 'PUT',
        params: { id: String(evt.id) },
        body: { allergiesEnabled: true },
      })

      const updated = await updateHandler(event)
      expect(updated.allergiesEnabled).toBe(true)
    })

    it('leaves allergiesEnabled unchanged when not in body', async () => {
      const user = await createTestUser(testDb, { email: 'put-b@test.com', name: 'PB' })
      const evt = createTestEvent(testDb, user!.id, { allergiesEnabled: true })

      const event = authEvent(user!.id, user!.email, {
        method: 'PUT',
        params: { id: String(evt.id) },
        body: { title: 'Updated' },
      })

      const updated = await updateHandler(event)
      expect(updated.allergiesEnabled).toBe(true)
    })
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- events`

Expected: the "updates allergiesEnabled" test fails because the PUT handler does not read the field today.

- [ ] **Step 3: Update the PUT handler**

Edit `server/api/events/[id].put.ts`. In the `update` object (lines 27-39), add the line at the end (before the closing brace):

```ts
  const update: Record<string, unknown> = {
    templateId: body.templateId ?? existing.templateId,
    customization: body.customization ?? existing.customization,
    tierId: body.tierId ?? existing.tierId,
    title: body.title ?? existing.title,
    coupleName1: body.coupleName1 ?? existing.coupleName1,
    coupleName2: body.coupleName2 ?? existing.coupleName2,
    date: body.date ?? existing.date,
    venue: body.venue ?? existing.venue,
    venueAddress: body.venueAddress ?? existing.venueAddress,
    venueMapUrl: body.venueMapUrl ?? existing.venueMapUrl,
    description: body.description ?? existing.description,
    allergiesEnabled: typeof body.allergiesEnabled === 'boolean' ? body.allergiesEnabled : existing.allergiesEnabled,
  }
```

The explicit `typeof === 'boolean'` check (rather than `??`) prevents non-boolean truthy/falsy values from sneaking in and lets the caller flip the flag in either direction.

- [ ] **Step 4: Run tests**

Run: `npm test -- events`

Expected: all events tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/api/events/\[id\].put.ts server/api/__tests__/events.test.ts
git commit -m "feat(menu): accept allergiesEnabled on PUT /api/events/[id]"
```

---

## Task 6: i18n — add new keys + rename Menu tab label

**Files:**
- Modify: `i18n/lang/en.json:507-533`
- Modify: `i18n/lang/es.json:507-533`

- [ ] **Step 1: Update `en.json`**

In `i18n/lang/en.json`, replace the `menu` block (lines 507-533) so it reads:

```json
  "menu": {
    "wizard": {
      "offerMenu": "Include menu selection",
      "offerMenuHint": "Let guests pick their meal preferences when they RSVP.",
      "askAllergies": "Ask for allergies",
      "askAllergiesHint": "Let guests share dietary restrictions when they RSVP."
    },
    "tab": {
      "label": "Menu & dietary"
    },
    "builder": {
      "title": "Menu options",
      "empty": "Set up a menu for your guests to choose from.",
      "addCourse": "Add course",
      "addOption": "Add option",
      "coursePlaceholder": "e.g. First course",
      "optionPlaceholder": "e.g. Beef Wellington",
      "deleteWarning": "{count} guests have picked this. Their choice will be cleared."
    },
    "summary": {
      "title": "Guest preferences",
      "noChoiceYet": "No choice yet",
      "viewGuests": "View guests",
      "coursesAndPicked": "{courses} courses · {picked} guests have picked",
      "allergies": {
        "title": "Allergies & dietary restrictions"
      }
    },
    "allergies": {
      "toggleLabel": "Ask guests for allergies",
      "toggleHint": "When on, the RSVP form includes a dietary-restrictions field — even if you have no menu set up.",
      "saving": "Saving…",
      "saveError": "Could not save. Try again."
    }
  },
```

- [ ] **Step 2: Update `es.json`**

In `i18n/lang/es.json`, replace the `menu` block (lines 507-533):

```json
  "menu": {
    "wizard": {
      "offerMenu": "Incluir selección de menú",
      "offerMenuHint": "Permite que los invitados elijan sus preferencias de comida al confirmar asistencia.",
      "askAllergies": "Preguntar alergias",
      "askAllergiesHint": "Permite que los invitados indiquen restricciones alimentarias al confirmar asistencia."
    },
    "tab": {
      "label": "Menú y dietas"
    },
    "builder": {
      "title": "Opciones del menú",
      "empty": "Configura un menú para que tus invitados elijan.",
      "addCourse": "Añadir plato",
      "addOption": "Añadir opción",
      "coursePlaceholder": "ej. Primer plato",
      "optionPlaceholder": "ej. Solomillo Wellington",
      "deleteWarning": "{count} invitados han elegido esto. Su elección se eliminará."
    },
    "summary": {
      "title": "Preferencias de los invitados",
      "noChoiceYet": "Sin elegir todavía",
      "viewGuests": "Ver invitados",
      "coursesAndPicked": "{courses} platos · {picked} invitados han elegido",
      "allergies": {
        "title": "Alergias y restricciones"
      }
    },
    "allergies": {
      "toggleLabel": "Preguntar alergias a los invitados",
      "toggleHint": "Si se activa, el formulario de RSVP incluye un campo de restricciones alimentarias, aunque no hayas configurado menú.",
      "saving": "Guardando…",
      "saveError": "No se pudo guardar. Inténtalo de nuevo."
    }
  },
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/lang/en.json'))" && node -e "JSON.parse(require('fs').readFileSync('i18n/lang/es.json'))"`

Expected: both commands exit 0 with no output (no JSON parse errors).

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n(menu): add askAllergies + allergies toggle keys; rename tab to Menu & dietary"
```

---

## Task 7: Wizard — add "Ask for allergies" checkbox in event creation

**Files:**
- Modify: `pages/dashboard/events/new.vue`

- [ ] **Step 1: Add `askAllergies` to the wizard form state**

In `pages/dashboard/events/new.vue`, in the `form` reactive object (around line 19-30), add `askAllergies: false` next to `offerMenu`:

```ts
const form = reactive({
  title: '',
  coupleName1: '',
  coupleName2: '',
  date: '',
  venue: '',
  venueAddress: '',
  venueMapUrl: '',
  description: '',
  offerMenu: false,
  askAllergies: false,
  menu: { courses: [] } as MenuTreeInput,
})
```

- [ ] **Step 2: Send `allergiesEnabled` in the create-event payload**

In `submitDetails()` (around lines 35-64), add `allergiesEnabled` to the payload right after `description`:

```ts
    const payload: Record<string, unknown> = {
      title: form.title,
      coupleName1: form.coupleName1,
      coupleName2: form.coupleName2,
      date: form.date,
      venue: form.venue,
      venueAddress: form.venueAddress,
      venueMapUrl: form.venueMapUrl,
      description: form.description,
      allergiesEnabled: form.askAllergies,
    }
```

- [ ] **Step 3: Add the second checkbox to the template**

In the template, find the menu checkbox block (around lines 395-406):

```vue
        <div class="border-t border-charcoal-100 pt-4 mt-4">
          <label class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.offerMenu" class="mt-1 rounded text-champagne-600" />
            <span>
              <span class="font-medium text-charcoal-900">{{ $t('menu.wizard.offerMenu') }}</span>
              <span class="block text-sm text-charcoal-300">{{ $t('menu.wizard.offerMenuHint') }}</span>
            </span>
          </label>
          <div v-if="form.offerMenu" class="mt-4">
            <MenuBuilder v-model="form.menu" />
          </div>
        </div>
```

Replace it with:

```vue
        <div class="border-t border-charcoal-100 pt-4 mt-4 space-y-3">
          <label class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.offerMenu" class="mt-1 rounded text-champagne-600" />
            <span>
              <span class="font-medium text-charcoal-900">{{ $t('menu.wizard.offerMenu') }}</span>
              <span class="block text-sm text-charcoal-300">{{ $t('menu.wizard.offerMenuHint') }}</span>
            </span>
          </label>
          <div v-if="form.offerMenu" class="mt-4">
            <MenuBuilder v-model="form.menu" />
          </div>

          <label class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.askAllergies" class="mt-1 rounded text-champagne-600" />
            <span>
              <span class="font-medium text-charcoal-900">{{ $t('menu.wizard.askAllergies') }}</span>
              <span class="block text-sm text-charcoal-300">{{ $t('menu.wizard.askAllergiesHint') }}</span>
            </span>
          </label>
        </div>
```

- [ ] **Step 4: Manual smoke test**

Start the dev server: `npm run dev`

Open `http://localhost:3000/en/dashboard/events/new` (logged in). Verify:
- Both checkboxes appear, can be checked independently.
- Submit with only allergies on. Confirm in DB the new event has `allergies_enabled = 1` and no `menu_courses` rows.
- Submit with only menu on. Confirm `allergies_enabled = 0` and menu rows exist.
- Submit with both. Confirm both.
- Submit with neither. Confirm both off.

Stop the server when done.

- [ ] **Step 5: Commit**

```bash
git add pages/dashboard/events/new.vue
git commit -m "feat(menu): add 'Ask for allergies' checkbox to event creation wizard"
```

---

## Task 8: Admin — add allergies toggle on the Menu & dietary tab

**Files:**
- Modify: `pages/dashboard/events/[id]/menu.vue`

- [ ] **Step 1: Fetch the event so the page knows the current `allergiesEnabled` value**

Open `pages/dashboard/events/[id]/menu.vue`. After the existing `useFetch` calls (around line 17), add an event fetch:

```ts
const { data: evt, refresh: refreshEvent } = await useFetch<any>(`/api/events/${eventId}`)
const allergiesEnabled = ref<boolean>(evt.value?.allergiesEnabled === true)
watch(evt, (v) => { if (v) allergiesEnabled.value = v.allergiesEnabled === true })

const allergiesSaving = ref(false)
const allergiesError = ref('')
async function toggleAllergies(next: boolean) {
  allergiesSaving.value = true
  allergiesError.value = ''
  const previous = allergiesEnabled.value
  allergiesEnabled.value = next
  try {
    await $fetch(`/api/events/${eventId}`, { method: 'PUT', body: { allergiesEnabled: next } })
    await refreshEvent()
  } catch (e: any) {
    allergiesEnabled.value = previous
    allergiesError.value = e.data?.statusMessage || t('menu.allergies.saveError')
  } finally {
    allergiesSaving.value = false
  }
}
```

- [ ] **Step 2: Add the toggle card above the menu builder section**

In the template, find the wrapping `<div class="max-w-4xl space-y-8">` (around line 73). Insert a new section *before* the existing menu-builder section:

```vue
    <div class="max-w-4xl space-y-8">
      <section class="border border-charcoal-100 rounded-lg p-4">
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="mt-1 rounded text-champagne-600"
            :checked="allergiesEnabled"
            :disabled="allergiesSaving"
            @change="toggleAllergies(($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="font-medium text-charcoal-900">{{ $t('menu.allergies.toggleLabel') }}</span>
            <span class="block text-sm text-charcoal-300">{{ $t('menu.allergies.toggleHint') }}</span>
          </span>
        </label>
        <p v-if="allergiesSaving" class="text-xs text-charcoal-300 mt-2">{{ $t('menu.allergies.saving') }}</p>
        <p v-if="allergiesError" class="text-xs text-red-600 mt-2">{{ allergiesError }}</p>
      </section>

      <section>
        <h2 class="text-xl font-serif text-charcoal-900 mb-4">{{ $t('menu.builder.title') }}</h2>
        <!-- ... existing menu builder unchanged ... -->
```

Leave the rest of the template intact.

- [ ] **Step 3: Manual smoke test**

`npm run dev`. Visit the menu tab of an existing event. Verify:
- The tab label reads "Menu & dietary" (EN) / "Menú y dietas" (ES).
- The allergies toggle reflects the current DB value.
- Toggling it issues a PUT and persists. Reloading the page shows the new value.
- Toggling again flips it back.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/events/\[id\]/menu.vue
git commit -m "feat(menu): allergies toggle on Menu & dietary admin tab"
```

---

## Task 9: RSVP page — ungate allergies from menu, gate on `event.allergiesEnabled`

**Files:**
- Modify: `pages/i/[slug].vue`

- [ ] **Step 1: Update the watcher to populate allergies independently of menu**

In `pages/i/[slug].vue`, find the `watch(guestData, ...)` block (around lines 49-63). Replace it with:

```ts
watch(guestData, (data) => {
  if (data) {
    rsvpForm.rsvpStatus = data.rsvpStatus !== 'pending' ? data.rsvpStatus : ''
    rsvpForm.plusOne = data.plusOne || false
    rsvpForm.plusOneName = data.plusOneName || ''
    if (data.menu) {
      for (const c of data.menu.courses) {
        if (!(c.id in menuChoices.value)) menuChoices.value[c.id] = data.choices?.[c.id] ?? null
        if (!(c.id in plusOneMenuChoices.value)) plusOneMenuChoices.value[c.id] = data.plusOneChoices?.[c.id] ?? null
      }
    }
    if (data.allergiesEnabled) {
      allergies.value = data.allergies ?? null
      plusOneAllergies.value = data.plusOneAllergies ?? null
    }
  }
}, { immediate: true })
```

- [ ] **Step 2: Move the allergies block out of the menu conditional in the template**

In the template (around lines 208-242), the current structure is:

```vue
<div v-if="guestData?.menu" class="mt-6 space-y-6">
  <fieldset v-for="course ...">…menu picker…</fieldset>
  <template v-if="rsvpForm.plusOne">
    <fieldset v-for="course ...">…plus-one menu picker…</fieldset>
  </template>

  <div class="text-left">
    <label …>{{ $t('rsvp.allergies.title') }}</label>
    <MenuAllergyPicker v-model="allergies" />
  </div>
  <div v-if="rsvpForm.plusOne" class="text-left">
    <label …>{{ $t('rsvp.allergies.plusOneTitle') }}</label>
    <MenuAllergyPicker v-model="plusOneAllergies" />
  </div>
</div>
```

Replace it with two sibling blocks — menu block (allergies removed) and a separate allergies block:

```vue
              <div v-if="guestData?.menu" class="mt-6 space-y-6">
                <fieldset v-for="course in guestData.menu.courses" :key="course.id" class="text-left">
                  <legend class="block text-sm font-medium text-charcoal-500 mb-2">{{ course.name }}</legend>
                  <label v-for="o in course.options" :key="o.id"
                    class="flex items-center gap-3 p-2 rounded border cursor-pointer mb-1"
                    :class="menuChoices[course.id] === o.id ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                    <input type="radio" :name="`course-${course.id}`" :value="o.id" v-model="menuChoices[course.id]" />
                    <span>{{ o.name }}</span>
                  </label>
                </fieldset>

                <template v-if="rsvpForm.plusOne">
                  <fieldset v-for="course in guestData.menu.courses" :key="`p1-${course.id}`" class="text-left">
                    <legend class="block text-sm font-medium text-charcoal-500 mb-2">
                      {{ $t('rsvp.menu.plusOneTitle') }} — {{ course.name }}
                    </legend>
                    <label v-for="o in course.options" :key="o.id"
                      class="flex items-center gap-3 p-2 rounded border cursor-pointer mb-1"
                      :class="plusOneMenuChoices[course.id] === o.id ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                      <input type="radio" :name="`p1-course-${course.id}`" :value="o.id" v-model="plusOneMenuChoices[course.id]" />
                      <span>{{ o.name }}</span>
                    </label>
                  </fieldset>
                </template>
              </div>

              <div v-if="guestData?.allergiesEnabled" class="mt-6 space-y-4">
                <div class="text-left">
                  <label class="block text-sm font-medium text-charcoal-500 mb-2">{{ $t('rsvp.allergies.title') }}</label>
                  <MenuAllergyPicker v-model="allergies" />
                </div>
                <div v-if="rsvpForm.plusOne" class="text-left">
                  <label class="block text-sm font-medium text-charcoal-500 mb-2">{{ $t('rsvp.allergies.plusOneTitle') }}</label>
                  <MenuAllergyPicker v-model="plusOneAllergies" />
                </div>
              </div>
```

The two blocks live as siblings inside the `v-if="rsvpForm.rsvpStatus === 'confirmed'"` wrapper that already exists on line 195.

- [ ] **Step 3: Manual smoke test**

`npm run dev`. Test all four combinations on real event slugs (or freshly created ones from Task 7's smoke test):

| Menu | Allergies | Expected on RSVP page |
| --- | --- | --- |
| off | off | Neither block shown when confirming |
| on | off | Menu picker shows, allergies hidden |
| off | on | Allergies shows, no menu picker |
| on | on | Both blocks shown (menu first, then allergies) |

For the `on/on` and `off/on` cases, submit allergies and verify they round-trip via the GET response (refresh the page).

Stop the server. Clean up: `rm -rf .playwright-mcp/` if you used the Playwright MCP browser tools.

- [ ] **Step 4: Commit**

```bash
git add pages/i/\[slug\].vue
git commit -m "feat(menu): render allergies independently of menu on RSVP page"
```

---

## Task 10: Admin guests view — gate allergy UI on `event.allergiesEnabled`

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`

- [ ] **Step 1: Add an `allergiesEnabled` computed**

Open `pages/dashboard/events/[id]/guests.vue`. The page already fetches `evt` at line 9 (`const { data: evt } = await useFetch(...)` for `/api/events/${eventId}`). Add a computed right below it:

```ts
const allergiesEnabled = computed(() => evt.value?.allergiesEnabled === true)
```

- [ ] **Step 2: Gate the allergy display rows in the per-guest detail**

In the template, lines 324-335 contain two `<div v-if="g.allergies">` / `<div v-if="g.plusOneAllergies">` blocks. Wrap them with the new computed. Replace each `v-if`:

```vue
<div v-if="allergiesEnabled && g.allergies">
  <span class="text-charcoal-300">{{ t('rsvp.allergies.title') }}:</span>
  <span class="ml-1">{{ formatAllergies(g.allergies) }}</span>
</div>
```

```vue
<div v-if="allergiesEnabled && g.plusOneAllergies">
  <span class="text-charcoal-300">{{ t('rsvp.allergies.plusOneTitle') }}:</span>
  <span class="ml-1">{{ formatAllergies(g.plusOneAllergies) }}</span>
</div>
```

- [ ] **Step 3: Gate the allergy filter chip / dropdown if any**

Search for any UI that exposes the `?allergy=` query filter. If the page renders an allergy-filter selector, wrap it in `v-if="allergiesEnabled"`. Run:

```
grep -n "route.query.allergy\|allergyFilter\|t('rsvp.allergies" pages/dashboard/events/[id]/guests.vue
```

If the only references to `allergy` are inside the `filteredGuests` computed (lines 154-167), no template change is needed — the filter just becomes inert when the column is hidden.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. For an event with `allergiesEnabled = false`, open the guests admin tab. Confirm no allergy rows appear under any expanded guest, even guests whose `allergies` column has stale data. Flip the toggle on (Task 8 toggle) and refresh — the rows reappear.

Stop the server. Clean up `rm -rf .playwright-mcp/` if used.

- [ ] **Step 5: Commit**

```bash
git add pages/dashboard/events/\[id\]/guests.vue
git commit -m "feat(menu): hide guest allergy UI when allergiesEnabled = false"
```

---

## Task 11: Final verification

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests green.

- [ ] **Step 2: End-to-end manual flow**

`npm run dev`. Run through this sequence end-to-end on a fresh event:

1. Create a new event with the wizard. Choose: menu off, allergies on.
2. Add a guest in the guests tab. Copy the RSVP link.
3. Open the RSVP link in an incognito window. Confirm: only the allergies block appears (no menu picker). Submit with one allergy selected.
4. Back in the admin guests tab, expand the guest. Confirm the allergy is shown.
5. On the Menu & dietary tab, toggle allergies off. Refresh the guests tab. Confirm the allergy row no longer renders.
6. Toggle allergies back on. Confirm the row reappears (data preserved).
7. On the Menu & dietary tab, build a menu (add a course + option). Confirm the menu builder still works.
8. As the same guest, refresh the RSVP link. Confirm both menu picker and allergies block appear. Pick a menu option, save, confirm both round-trip.

Stop the server. Clean up `rm -rf .playwright-mcp/` if used.

- [ ] **Step 3: No commit — this task is verification only.**

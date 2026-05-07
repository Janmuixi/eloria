# Companions Replace Single +1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-guest single `+1` model with per-guest *companions* (0–5), where the host configures how many a guest may bring and the guest fills each companion's name, attendance, menu, and allergies on the RSVP page.

**Architecture:** New `companions` table joined to `guests`; `guest_menu_choices.for_plus_one` boolean replaced by nullable `companion_id` (NULL = host's pick); `guests.companions_allowed` (int) is the host-configured cap; tier limit enforced as "seats" (`count(guests) + sum(companions_allowed)`). RSVP submit upserts companion rows by `(guest_id, position)`. No data migration — existing dev rows are discarded.

**Tech Stack:** Nuxt 3, Drizzle ORM (better-sqlite3), Vue 3 + `<script setup>`, Vitest, Tailwind, `@nuxtjs/i18n`.

**Spec:** `docs/superpowers/specs/2026-05-07-companions-replace-plus-one-design.md`

---

## File Structure

### Created

- `server/db/migrations/0007_companions.sql` — schema migration (Drizzle-generated, hand-edited for partial indexes)
- `server/db/migrations/meta/0007_snapshot.json` — Drizzle snapshot for migration 0007
- `server/api/events/[id]/guests/[guestId].patch.ts` — `PATCH` endpoint for `companionsAllowed`
- `server/utils/seats.ts` — `seats(eventId)` helper used by limit checks

### Modified

- `server/db/schema.ts` — drop `plusOne*` from `guests`; add `companionsAllowed`; new `companions` table + relations; replace `forPlusOne` with `companionId` on `guestMenuChoices`; partial unique indexes
- `server/db/migrations/meta/_journal.json` — append entry for 0007
- `server/__helpers__/db.ts` — mirror schema changes; replace `createTestGuest` plus-one fields; add `createTestCompanion` helper
- `server/api/events/[id]/guests/index.get.ts` — return `companionsAllowed` + `companions[]`; remove `plusOne*` fields
- `server/api/events/[id]/guests/index.post.ts` — switch limit check to seats helper
- `server/api/events/[id]/guests/import.post.ts` — switch limit check to seats helper
- `server/api/rsvp/[token].get.ts` — return `companionsAllowed` + synthesized `companions[]`; remove `plusOne*`
- `server/api/rsvp/[token].post.ts` — accept `companions[]`; validate; upsert companion rows; rewrite menu-choices with `companionId`
- `server/api/events/[id]/menu/summary.get.ts` — aggregate counts from companions where `attending=true`
- `server/api/__tests__/guests.test.ts` — replace plus-one cases; add `PATCH` cases; seat-based limit cases
- `server/api/__tests__/rsvp.test.ts` — replace plus-one cases; add companion cases
- `server/api/__tests__/menu.test.ts` — replace plus-one summary case with companion case
- `pages/dashboard/events/[id]/guests.vue` — companion stepper column; seat header; expand panel; filters
- `pages/i/[slug].vue` — N companion cards replacing single +1 toggle
- `i18n/lang/en.json` — remove plus-one keys; add companion/seat keys
- `i18n/lang/es.json` — same in Spanish

---

## Task 1: Update Drizzle schema

**Files:**
- Modify: `server/db/schema.ts`

- [ ] **Step 1: Update the `guests` table definition**

In `server/db/schema.ts`, replace the existing `guests` table block (currently lines 135–150) with:

```ts
export const guests = sqliteTable('guests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  rsvpStatus: text('rsvp_status').notNull().default('pending'),
  companionsAllowed: integer('companions_allowed').notNull().default(0),
  token: text('token').notNull().unique(),
  emailSentAt: text('email_sent_at'),
  emailOpenedAt: text('email_opened_at'),
  allergies: text('allergies'),
  createdAt: text('created_at').default(new Date().toISOString()),
})
```

(Removed: `plusOne`, `plusOneName`, `plusOneAllergies`. Added: `companionsAllowed`.)

- [ ] **Step 2: Add the `companions` table and its relations**

Append below `guestsRelations`:

```ts
export const companions = sqliteTable('companions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guestId: integer('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name'),
  attending: integer('attending', { mode: 'boolean' }).notNull().default(false),
  allergies: text('allergies'),
  createdAt: text('created_at').default(new Date().toISOString()),
}, (t) => ({
  guestPositionUnq: uniqueIndex('companions_guest_position_unq').on(t.guestId, t.position),
}))

export const companionsRelations = relations(companions, ({ one, many }) => ({
  guest: one(guests, { fields: [companions.guestId], references: [guests.id] }),
  menuChoices: many(guestMenuChoices),
}))
```

Update `guestsRelations` to add `companions: many(companions)`:

```ts
export const guestsRelations = relations(guests, ({ one, many }) => ({
  event: one(events, {
    fields: [guests.eventId],
    references: [events.id],
  }),
  menuChoices: many(guestMenuChoices),
  companions: many(companions),
}))
```

- [ ] **Step 3: Update `guestMenuChoices` to use `companionId`**

Replace the existing `guestMenuChoices` definition (currently lines 178–188) with:

```ts
import { sql } from 'drizzle-orm'

export const guestMenuChoices = sqliteTable('guest_menu_choices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guestId: integer('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  courseId: integer('course_id').notNull().references(() => menuCourses.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').references(() => menuOptions.id, { onDelete: 'set null' }),
  companionId: integer('companion_id').references(() => companions.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(new Date().toISOString()),
}, (t) => ({
  selfPickUnq: uniqueIndex('guest_menu_choices_self_unq')
    .on(t.guestId, t.courseId)
    .where(sql`${t.companionId} IS NULL`),
  companionPickUnq: uniqueIndex('guest_menu_choices_companion_unq')
    .on(t.guestId, t.courseId, t.companionId)
    .where(sql`${t.companionId} IS NOT NULL`),
}))
```

Make sure `sql` is imported at the top of the file. The existing import is `import { relations } from 'drizzle-orm'` — change it to `import { relations, sql } from 'drizzle-orm'`.

- [ ] **Step 4: Update `guestMenuChoicesRelations` to reference `companion`**

Replace the existing block:

```ts
export const guestMenuChoicesRelations = relations(guestMenuChoices, ({ one }) => ({
  guest: one(guests, { fields: [guestMenuChoices.guestId], references: [guests.id] }),
  course: one(menuCourses, { fields: [guestMenuChoices.courseId], references: [menuCourses.id] }),
  option: one(menuOptions, { fields: [guestMenuChoices.optionId], references: [menuOptions.id] }),
  companion: one(companions, { fields: [guestMenuChoices.companionId], references: [companions.id] }),
}))
```

- [ ] **Step 5: Type-check the schema file**

Run: `npx tsc --noEmit server/db/schema.ts`
Expected: no errors. (If `tsc` complains about the project config when run on a single file, run `npx nuxt prepare && npx tsc --noEmit` instead.)

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.ts
git commit -m "feat(companions): drizzle schema — companions table, drop plus_one"
```

---

## Task 2: Generate migration and add partial unique indexes

**Files:**
- Create: `server/db/migrations/0007_companions.sql`
- Create: `server/db/migrations/meta/0007_snapshot.json`
- Modify: `server/db/migrations/meta/_journal.json`

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: drizzle-kit creates `server/db/migrations/0007_<name>.sql`, a corresponding `meta/0007_snapshot.json`, and appends an entry to `meta/_journal.json`. Note the actual file name produced — the file path below uses `0007_companions.sql`; if drizzle picks a different suffix, rename it (and the journal entry's `tag`) to `0007_companions` for consistency with the spec.

- [ ] **Step 2: Inspect the generated SQL**

Run: `cat server/db/migrations/0007_*.sql`
Expected: SQL that creates a new `companions` table, recreates `guests` without the `plus_one*` columns and with `companions_allowed`, recreates `guest_menu_choices` with `companion_id` instead of `for_plus_one`, drops the old `guest_menu_choices_guest_course_plusone_unq` index, and creates new indexes.

Drizzle-kit may NOT correctly emit partial unique indexes (the `WHERE` clause). Verify the generated SQL contains both `WHERE companion_id IS NULL` and `WHERE companion_id IS NOT NULL`. If not, hand-edit the migration to replace the generated index lines with:

```sql
CREATE UNIQUE INDEX `guest_menu_choices_self_unq` ON `guest_menu_choices` (`guest_id`,`course_id`) WHERE `companion_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `guest_menu_choices_companion_unq` ON `guest_menu_choices` (`guest_id`,`course_id`,`companion_id`) WHERE `companion_id` IS NOT NULL;--> statement-breakpoint
```

- [ ] **Step 3: Confirm the table-rebuild pattern**

The migration should follow the same `__new_<table>` → `INSERT … SELECT` → `DROP` → `RENAME` dance as `0006_magenta_joshua_kane.sql` (see that file for the pattern). Since dev rows will be discarded, the `INSERT … SELECT` for `guests` and `guest_menu_choices` selects only the columns that survive (no `plus_one*`, no `for_plus_one`); set `companions_allowed` to `0` and `companion_id` to `NULL` in the SELECT projection.

If the generated SQL keeps the old columns in the SELECT, hand-edit. Example for `__new_guests`:

```sql
INSERT INTO `__new_guests`("id", "event_id", "name", "email", "phone", "rsvp_status", "companions_allowed", "token", "email_sent_at", "email_opened_at", "allergies", "created_at") SELECT "id", "event_id", "name", "email", "phone", "rsvp_status", 0, "token", "email_sent_at", "email_opened_at", "allergies", "created_at" FROM `guests`;
```

Example for `__new_guest_menu_choices`:

```sql
INSERT INTO `__new_guest_menu_choices`("id", "guest_id", "course_id", "option_id", "companion_id", "created_at") SELECT "id", "guest_id", "course_id", "option_id", NULL, "created_at" FROM `guest_menu_choices`;
```

- [ ] **Step 4: Apply the migration to the dev DB**

Run: `npm run db:migrate`
Expected: migration applies cleanly, exit code 0. If it fails, fix the SQL and retry.

- [ ] **Step 5: Verify schema with sqlite**

Run: `sqlite3 db/eloria.db ".schema guests" && sqlite3 db/eloria.db ".schema companions" && sqlite3 db/eloria.db ".schema guest_menu_choices"`
Expected: `guests` has `companions_allowed` and no `plus_one*` columns; `companions` exists with the right columns; `guest_menu_choices` has `companion_id` and no `for_plus_one`. Indexes include `guest_menu_choices_self_unq` and `guest_menu_choices_companion_unq`.

- [ ] **Step 6: Commit**

```bash
git add server/db/migrations/0007_companions.sql server/db/migrations/meta/0007_snapshot.json server/db/migrations/meta/_journal.json
git commit -m "feat(companions): migration 0007 — companions table, drop plus_one"
```

---

## Task 3: Mirror schema in test DB helper

**Files:**
- Modify: `server/__helpers__/db.ts`

- [ ] **Step 1: Update the `CREATE TABLE guests` block**

In the `sqlite.exec(...)` call, replace the `CREATE TABLE guests` block (currently lines 81–96) with:

```sql
    CREATE TABLE guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      rsvp_status TEXT NOT NULL DEFAULT 'pending',
      companions_allowed INTEGER NOT NULL DEFAULT 0,
      token TEXT NOT NULL UNIQUE,
      email_sent_at TEXT,
      email_opened_at TEXT,
      allergies TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
```

- [ ] **Step 2: Add the `companions` table block**

Inside the same `sqlite.exec(...)` template literal, after the `CREATE TABLE menu_options ...` block and before the `CREATE TABLE guest_menu_choices ...` block, add:

```sql
    CREATE TABLE companions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      name TEXT,
      attending INTEGER NOT NULL DEFAULT 0,
      allergies TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (guest_id, position)
    );
```

- [ ] **Step 3: Update the `guest_menu_choices` block**

Replace the existing `guest_menu_choices` block (currently lines 127–135) with:

```sql
    CREATE TABLE guest_menu_choices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES menu_courses(id) ON DELETE CASCADE,
      option_id INTEGER REFERENCES menu_options(id) ON DELETE SET NULL,
      companion_id INTEGER REFERENCES companions(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX guest_menu_choices_self_unq ON guest_menu_choices (guest_id, course_id) WHERE companion_id IS NULL;
    CREATE UNIQUE INDEX guest_menu_choices_companion_unq ON guest_menu_choices (guest_id, course_id, companion_id) WHERE companion_id IS NOT NULL;
```

- [ ] **Step 4: Update `createTestGuest` to drop plus-one options**

Replace the existing `createTestGuest` (currently lines 226–241) with:

```ts
export function createTestGuest(db: TestDb, eventId: number, overrides?: Partial<{
  name: string; email: string | null; phone: string | null; token: string;
  rsvpStatus: string; companionsAllowed: number;
}>) {
  const rows = db.insert(guests).values({
    eventId,
    name: overrides?.name || 'Guest User',
    email: overrides?.email ?? 'guest@example.com',
    phone: overrides?.phone ?? null,
    token: overrides?.token || crypto.randomUUID(),
    rsvpStatus: overrides?.rsvpStatus || 'pending',
    companionsAllowed: overrides?.companionsAllowed ?? 0,
  }).returning().all()
  return rows[0]
}
```

- [ ] **Step 5: Add `createTestCompanion` helper**

Add the `companions` import at the top of the file (alongside the existing imports):

```ts
import { tiers, users, templates, events, guests, subscriptions, companions } from '../db/schema'
```

Then append at the end of the file:

```ts
export function createTestCompanion(db: TestDb, guestId: number, position: number, overrides?: Partial<{
  name: string | null; attending: boolean; allergies: string | null;
}>) {
  const rows = db.insert(companions).values({
    guestId,
    position,
    name: overrides?.name ?? null,
    attending: overrides?.attending ?? false,
    allergies: overrides?.allergies ?? null,
  }).returning().all()
  return rows[0]
}
```

- [ ] **Step 6: Run the existing test suite to spot fallout**

Run: `npm test -- --run`
Expected: many failures referencing `plusOne`, `forPlusOne`, etc. — this is expected. We'll fix tests in later tasks. As long as the failures are *type/reference* errors and not "table missing" errors, the helper itself is correct.

- [ ] **Step 7: Commit**

```bash
git add server/__helpers__/db.ts
git commit -m "test(companions): mirror new schema in test db helper"
```

---

## Task 4: Add `seats(eventId)` helper

**Files:**
- Create: `server/utils/seats.ts`

- [ ] **Step 1: Write the helper**

Create `server/utils/seats.ts` with:

```ts
import { db } from '~/server/db'
import { guests } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * Returns the seat count for an event: number of guests + sum of companions_allowed.
 * One seat per guest plus one per allowed companion slot. Used to gate against tier.guestLimit.
 */
export async function countSeats(eventId: number): Promise<number> {
  const [row] = await db
    .select({
      seats: sql<number>`COUNT(*) + COALESCE(SUM(${guests.companionsAllowed}), 0)`,
    })
    .from(guests)
    .where(eq(guests.eventId, eventId))
  return Number(row?.seats ?? 0)
}
```

- [ ] **Step 2: Type-check**

Run: `npx nuxt prepare && npx tsc --noEmit`
Expected: no errors related to `seats.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/seats.ts
git commit -m "feat(companions): seats() helper — guests + sum(companions_allowed)"
```

---

## Task 5: Switch add-guest and import endpoints to seat accounting

**Files:**
- Modify: `server/api/events/[id]/guests/index.post.ts`
- Modify: `server/api/events/[id]/guests/import.post.ts`

- [ ] **Step 1: Update the test for the seats-based limit on add-guest**

In `server/api/__tests__/guests.test.ts`, find the existing limit test (search for `guestLimit` or `403`). Replace any test that asserts plain guest counts against the limit with one that proves seats accounting. Add (alongside the existing tests in the `describe('POST /api/events/:id/guests', ...)` block, or create that describe block if there isn't one):

```ts
it('counts companions toward the seat limit (403 when seat limit hit)', async () => {
  // Default Basic tier has guestLimit = 50 — override with a tighter value for the test
  const { tiers: tiersTable } = await import('../../db/schema')
  seedTiers(testDb)
  const basicTier = testDb.select().from(tiersTable).all()[0]
  testDb.update(tiersTable).set({ guestLimit: 3 }).where((await import('drizzle-orm')).eq(tiersTable.id, basicTier.id)).run()
  const evtWithLimit = createTestEvent(testDb, user.id, { tierId: basicTier.id, slug: 'limited' })

  // 2 guests, one with 1 companion = 3 seats — at the limit
  createTestGuest(testDb, evtWithLimit.id, { name: 'A', companionsAllowed: 1 })
  createTestGuest(testDb, evtWithLimit.id, { name: 'B' })

  const event = authEvent(user.id, user.email, {
    method: 'POST',
    params: { id: String(evtWithLimit.id) },
    body: { name: 'C' },
  })

  await expect(addHandler(event)).rejects.toMatchObject({ statusCode: 403 })
})
```

If the existing tests reference `seedTiers` already, reuse that import. Otherwise add `seedTiers` to the helpers import at the top.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run server/api/__tests__/guests.test.ts -t "counts companions toward the seat limit"`
Expected: FAIL — current `index.post.ts` only counts rows in `guests`, so 2 guests < 3 limit and the call succeeds.

- [ ] **Step 3: Switch `index.post.ts` to use `countSeats`**

Replace the body of `server/api/events/[id]/guests/index.post.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { countSeats } from '~/server/utils/seats'

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

  if (evt.tier?.guestLimit != null) {
    const seats = await countSeats(id)
    // Adding one more guest costs 1 seat (companions default to 0)
    if (seats + 1 > evt.tier.guestLimit) {
      throw createError({
        statusCode: 403,
        statusMessage: `Seat limit reached for your plan (${evt.tier.guestLimit})`,
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

- [ ] **Step 4: Update `import.post.ts` similarly**

Replace `server/api/events/[id]/guests/import.post.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { countSeats } from '~/server/utils/seats'

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

  if (evt.tier?.guestLimit != null) {
    const seats = await countSeats(id)
    const remaining = evt.tier.guestLimit - seats
    if (values.length > remaining) {
      throw createError({
        statusCode: 403,
        statusMessage: `Import would exceed seat limit for your plan (${evt.tier.guestLimit}). You can add ${Math.max(0, remaining)} more.`,
      })
    }
  }

  await db.insert(guests).values(values)

  return { imported: values.length }
})
```

- [ ] **Step 5: Run the seat-limit test**

Run: `npm test -- --run server/api/__tests__/guests.test.ts -t "counts companions toward the seat limit"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/[id]/guests/index.post.ts server/api/events/[id]/guests/import.post.ts server/api/__tests__/guests.test.ts
git commit -m "feat(companions): switch guest add/import to seat-based limit"
```

---

## Task 6: New `PATCH /api/events/[id]/guests/[guestId]` endpoint

**Files:**
- Create: `server/api/events/[id]/guests/[guestId].patch.ts`
- Modify: `server/api/__tests__/guests.test.ts`

- [ ] **Step 1: Write failing tests for PATCH**

In `server/api/__tests__/guests.test.ts`, add a new describe block (after the existing PUT/POST blocks):

```ts
const patchHandler = (await import('../../api/events/[id]/guests/[guestId].patch')).default

describe('PATCH /api/events/:id/guests/:guestId', () => {
  it('updates companionsAllowed when within seat limit', async () => {
    const guest = createTestGuest(testDb, evt.id, { name: 'Alice' })
    const event = authEvent(user.id, user.email, {
      method: 'PATCH',
      params: { id: String(evt.id), guestId: String(guest.id) },
      body: { companionsAllowed: 2 },
    })
    const result = await patchHandler(event)
    expect(result.companionsAllowed).toBe(2)
  })

  it('rejects increase that would exceed seat limit (403)', async () => {
    const { tiers: tiersTable, guests: guestsTable } = await import('../../db/schema')
    seedTiers(testDb)
    const basicTier = testDb.select().from(tiersTable).all()[0]
    testDb.update(tiersTable).set({ guestLimit: 3 }).where((await import('drizzle-orm')).eq(tiersTable.id, basicTier.id)).run()
    const evtLimited = createTestEvent(testDb, user.id, { tierId: basicTier.id, slug: 'limited-patch' })
    // 3 guests fill the limit exactly; bumping any to 1 companion would go to 4 seats
    for (let i = 0; i < 3; i++) createTestGuest(testDb, evtLimited.id, { name: `g${i}`, token: `t${i}` })
    const lastGuest = testDb.select().from(guestsTable).all().filter(g => g.eventId === evtLimited.id).at(-1)!
    const event = authEvent(user.id, user.email, {
      method: 'PATCH',
      params: { id: String(evtLimited.id), guestId: String(lastGuest.id) },
      body: { companionsAllowed: 2 },
    })
    await expect(patchHandler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('cascades companion deletion when companionsAllowed is decreased', async () => {
    const { companions: companionsTable } = await import('../../db/schema')
    const guest = createTestGuest(testDb, evt.id, { name: 'Alice', companionsAllowed: 2 })
    testDb.insert(companionsTable).values([
      { guestId: guest.id, position: 1, name: 'C1', attending: true },
      { guestId: guest.id, position: 2, name: 'C2', attending: true },
    ]).run()
    const event = authEvent(user.id, user.email, {
      method: 'PATCH',
      params: { id: String(evt.id), guestId: String(guest.id) },
      body: { companionsAllowed: 1 },
    })
    await patchHandler(event)
    const remaining = testDb.select().from(companionsTable).all().filter(c => c.guestId === guest.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].position).toBe(1)
  })

  it('rejects out-of-range value (400)', async () => {
    const guest = createTestGuest(testDb, evt.id, { name: 'Alice' })
    for (const bad of [-1, 6, 1.5, 'two']) {
      const event = authEvent(user.id, user.email, {
        method: 'PATCH',
        params: { id: String(evt.id), guestId: String(guest.id) },
        body: { companionsAllowed: bad as any },
      })
      await expect(patchHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('rejects guest not owned by user (404)', async () => {
    const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
    const otherEvt = createTestEvent(testDb, otherUser.id, { slug: 'other' })
    const otherGuest = createTestGuest(testDb, otherEvt.id, { name: 'X', token: 'other-tok' })
    const event = authEvent(user.id, user.email, {
      method: 'PATCH',
      params: { id: String(otherEvt.id), guestId: String(otherGuest.id) },
      body: { companionsAllowed: 1 },
    })
    await expect(patchHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run server/api/__tests__/guests.test.ts -t "PATCH"`
Expected: FAIL with "Cannot find module '../../api/events/[id]/guests/[guestId].patch'".

- [ ] **Step 3: Implement the PATCH handler**

Create `server/api/events/[id]/guests/[guestId].patch.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, companions } from '~/server/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { countSeats } from '~/server/utils/seats'

const COMPANION_MIN = 0
const COMPANION_MAX = 5

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const guestId = parseInt(getRouterParam(event, 'guestId')!)
  const body = await readBody(event)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    with: { tier: true },
  })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, guestId), eq(guests.eventId, id)),
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const raw = body?.companionsAllowed
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < COMPANION_MIN || raw > COMPANION_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: `companionsAllowed must be an integer between ${COMPANION_MIN} and ${COMPANION_MAX}`,
    })
  }

  const oldN = guest.companionsAllowed
  const newN = raw

  if (newN > oldN && evt.tier?.guestLimit != null) {
    const seats = await countSeats(id)
    if (seats - oldN + newN > evt.tier.guestLimit) {
      throw createError({
        statusCode: 403,
        statusMessage: `Seat limit reached for your plan (${evt.tier.guestLimit})`,
      })
    }
  }

  db.transaction((tx) => {
    tx.update(guests).set({ companionsAllowed: newN }).where(eq(guests.id, guestId)).run()
    if (newN < oldN) {
      tx.delete(companions)
        .where(and(eq(companions.guestId, guestId), gt(companions.position, newN)))
        .run()
    }
  })

  const updated = await db.query.guests.findFirst({ where: eq(guests.id, guestId) })
  return updated
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run server/api/__tests__/guests.test.ts -t "PATCH"`
Expected: all PATCH tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/events/[id]/guests/[guestId].patch.ts server/api/__tests__/guests.test.ts
git commit -m "feat(companions): PATCH /api/events/:id/guests/:guestId for companionsAllowed"
```

---

## Task 7: Reshape `GET /api/events/[id]/guests`

**Files:**
- Modify: `server/api/events/[id]/guests/index.get.ts`
- Modify: `server/api/__tests__/guests.test.ts`

- [ ] **Step 1: Update existing GET tests to expect new shape**

In `server/api/__tests__/guests.test.ts`, find the GET test that asserts plus-one menu choices (search for `plusOneMenuChoices`). Replace it with companion-based assertions. The tests in `describe('GET /api/events/:id/guests', ...)` should now look like:

```ts
it('includes menuChoices for a guest who has picks', async () => {
  const guest = createTestGuest(testDb, evt.id, { name: 'Alice', email: 'alice@example.com' })
  const [course] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Main', sortOrder: 0 }).returning().all()
  const [opt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Beef', sortOrder: 0 }).returning().all()
  testDb.insert(guestMenuChoices).values({ guestId: guest.id, courseId: course.id, optionId: opt.id, companionId: null }).run()

  const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
  const result = await listHandler(event)

  const alice = result.find((g: any) => g.name === 'Alice')
  expect(alice).toBeDefined()
  expect(alice.menuChoices).toEqual({ [course.id]: opt.id })
  expect(alice.companionsAllowed).toBe(0)
  expect(alice.companions).toEqual([])
})

it('includes companions with their menu choices', async () => {
  const { companions: companionsTable } = await import('../../db/schema')
  const guest = createTestGuest(testDb, evt.id, { name: 'Bob', companionsAllowed: 2 })
  const [c1] = testDb.insert(companionsTable).values({
    guestId: guest.id, position: 1, name: 'Partner', attending: true,
  }).returning().all()
  // position 2 has no row yet (pending)

  const [course] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Starter', sortOrder: 0 }).returning().all()
  const [selfOpt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Soup', sortOrder: 0 }).returning().all()
  const [c1Opt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Salad', sortOrder: 1 }).returning().all()
  testDb.insert(guestMenuChoices).values([
    { guestId: guest.id, courseId: course.id, optionId: selfOpt.id, companionId: null },
    { guestId: guest.id, courseId: course.id, optionId: c1Opt.id, companionId: c1.id },
  ]).run()

  const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
  const result = await listHandler(event)

  const bob = result.find((g: any) => g.name === 'Bob')
  expect(bob.companionsAllowed).toBe(2)
  expect(bob.companions).toHaveLength(1)
  expect(bob.companions[0]).toMatchObject({
    position: 1,
    name: 'Partner',
    attending: true,
    menuChoices: { [course.id]: c1Opt.id },
  })
  expect(bob.menuChoices).toEqual({ [course.id]: selfOpt.id })
})
```

Delete any test that asserts `plusOne`, `plusOneName`, `plusOneAllergies`, or `plusOneMenuChoices` on the GET response.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run server/api/__tests__/guests.test.ts -t "includes companions"`
Expected: FAIL — current handler returns `plusOneMenuChoices`, not `companions`.

- [ ] **Step 3: Rewrite the GET handler**

Replace `server/api/events/[id]/guests/index.get.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const guestRows = await db.query.guests.findMany({
    where: eq(guests.eventId, id),
  })

  if (guestRows.length === 0) return []

  const guestIds = guestRows.map(g => g.id)

  const allChoices = await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestIds),
  })

  const allCompanions = await db.query.companions.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestIds),
    orderBy: [asc(companions.position)],
  })

  // Group by guest
  const choicesByGuest = new Map<number, typeof allChoices>()
  for (const ch of allChoices) {
    if (!choicesByGuest.has(ch.guestId)) choicesByGuest.set(ch.guestId, [])
    choicesByGuest.get(ch.guestId)!.push(ch)
  }
  const companionsByGuest = new Map<number, typeof allCompanions>()
  for (const c of allCompanions) {
    if (!companionsByGuest.has(c.guestId)) companionsByGuest.set(c.guestId, [])
    companionsByGuest.get(c.guestId)!.push(c)
  }

  return guestRows.map(g => {
    const choices = choicesByGuest.get(g.id) ?? []
    const menuChoices: Record<number, number> = {}
    const choicesByCompanion = new Map<number, Record<number, number>>()
    for (const ch of choices) {
      if (ch.optionId == null) continue
      if (ch.companionId == null) {
        menuChoices[ch.courseId] = ch.optionId
      } else {
        if (!choicesByCompanion.has(ch.companionId)) choicesByCompanion.set(ch.companionId, {})
        choicesByCompanion.get(ch.companionId)![ch.courseId] = ch.optionId
      }
    }

    const compRows = companionsByGuest.get(g.id) ?? []
    const companionsOut = compRows.map(c => ({
      id: c.id,
      position: c.position,
      name: c.name,
      attending: c.attending,
      menuChoices: choicesByCompanion.get(c.id) ?? {},
      allergies: parseAllergies(c.allergies),
    }))

    return {
      ...g,
      menuChoices,
      allergies: parseAllergies(g.allergies),
      companions: companionsOut,
    }
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run server/api/__tests__/guests.test.ts`
Expected: PASS for all tests in this file.

- [ ] **Step 5: Commit**

```bash
git add server/api/events/[id]/guests/index.get.ts server/api/__tests__/guests.test.ts
git commit -m "feat(companions): GET /api/events/:id/guests returns companions array"
```

---

## Task 8: Reshape `GET /api/rsvp/[token]`

**Files:**
- Modify: `server/api/rsvp/[token].get.ts`
- Modify: `server/api/__tests__/rsvp.test.ts`

- [ ] **Step 1: Update existing GET tests for the new shape**

In `server/api/__tests__/rsvp.test.ts`, find the `describe('GET /api/rsvp/:token', ...)` block. Replace the existing test body with:

```ts
describe('GET /api/rsvp/:token', () => {
  it('returns guest RSVP data with empty companions when companionsAllowed = 0', async () => {
    const event = createMockEvent({
      params: { token: 'valid-token-123' },
    })

    const result = await getHandler(event)

    expect(result).toMatchObject({
      name: 'Invitee',
      rsvpStatus: 'pending',
      companionsAllowed: 0,
      companions: [],
    })
  })

  it('synthesizes empty companion entries when slots are configured but unfilled', async () => {
    const { guests: guestsTable } = await import('../../db/schema')
    testDb.update(guestsTable).set({ companionsAllowed: 2 }).where(eq(guestsTable.id, guest.id)).run()

    const result = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))

    expect(result.companionsAllowed).toBe(2)
    expect(result.companions).toHaveLength(2)
    expect(result.companions[0]).toMatchObject({
      position: 1, name: null, attending: false, menuChoices: {}, allergies: null,
    })
    expect(result.companions[1].position).toBe(2)
  })

  it('rejects invalid/nonexistent token (404)', async () => {
    const event = createMockEvent({
      params: { token: 'nonexistent-token' },
    })
    await expect(getHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

(Remove any reference to `plusOne` / `plusOneName` from the GET tests.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run server/api/__tests__/rsvp.test.ts -t "GET /api/rsvp"`
Expected: FAIL — current handler returns `plusOne`, not `companions`.

- [ ] **Step 3: Rewrite the GET handler**

Replace `server/api/rsvp/[token].get.ts`:

```ts
import { db } from '~/server/db'
import { guests, menuCourses, menuOptions, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
    with: { event: true },
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const allergiesEnabled = guest.event?.allergiesEnabled === true

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

  const companionRows = await db.query.companions.findMany({
    where: eq(companions.guestId, guest.id),
    orderBy: [asc(companions.position)],
  })

  const allChoices = menu === null ? [] : await db.query.guestMenuChoices.findMany({
    where: eq(guestMenuChoices.guestId, guest.id),
  })

  const selfChoices: Record<number, number> = {}
  const choicesByCompanion = new Map<number, Record<number, number>>()
  for (const ch of allChoices) {
    if (ch.optionId == null) continue
    if (ch.companionId == null) selfChoices[ch.courseId] = ch.optionId
    else {
      if (!choicesByCompanion.has(ch.companionId)) choicesByCompanion.set(ch.companionId, {})
      choicesByCompanion.get(ch.companionId)![ch.courseId] = ch.optionId
    }
  }

  // Synthesize a full N-entry array, merging stored rows where present
  const stored = new Map<number, typeof companionRows[number]>()
  for (const c of companionRows) stored.set(c.position, c)
  const companionsOut = []
  for (let pos = 1; pos <= guest.companionsAllowed; pos++) {
    const c = stored.get(pos)
    companionsOut.push({
      position: pos,
      name: c?.name ?? null,
      attending: c?.attending ?? false,
      menuChoices: c ? (choicesByCompanion.get(c.id) ?? {}) : {},
      allergies: allergiesEnabled && c ? parseAllergies(c.allergies) : null,
    })
  }

  return {
    name: guest.name,
    rsvpStatus: guest.rsvpStatus,
    companionsAllowed: guest.companionsAllowed,
    companions: companionsOut,
    menu,
    choices: selfChoices,
    allergiesEnabled,
    allergies: allergiesEnabled ? parseAllergies(guest.allergies) : null,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run server/api/__tests__/rsvp.test.ts -t "GET /api/rsvp"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/rsvp/[token].get.ts server/api/__tests__/rsvp.test.ts
git commit -m "feat(companions): GET /api/rsvp/:token returns companions array"
```

---

## Task 9: Reshape `POST /api/rsvp/[token]`

**Files:**
- Modify: `server/api/rsvp/[token].post.ts`
- Modify: `server/api/__tests__/rsvp.test.ts`

- [ ] **Step 1: Replace POST tests with companion-based cases**

In `server/api/__tests__/rsvp.test.ts`, replace the existing `describe('POST /api/rsvp/:token', ...)` block (and the menu-picks describe block) with companion cases. The two big describe blocks become:

```ts
describe('POST /api/rsvp/:token', () => {
  it('confirms RSVP with no companions', async () => {
    const event = createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: { rsvpStatus: 'confirmed', companions: [] },
    })
    const result = await postHandler(event)
    expect(result).toEqual({ success: true, rsvpStatus: 'confirmed' })
  })

  it('declines RSVP', async () => {
    const event = createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: { rsvpStatus: 'declined', companions: [] },
    })
    expect(await postHandler(event)).toEqual({ success: true, rsvpStatus: 'declined' })
  })

  it('rejects mismatched companion count (400)', async () => {
    const { guests: guestsTable } = await import('../../db/schema')
    testDb.update(guestsTable).set({ companionsAllowed: 2 }).where(eq(guestsTable.id, guest.id)).run()

    // companionsAllowed = 2 but only 1 entry sent
    await expect(postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        companions: [{ position: 1, attending: false, name: null, menuChoices: {}, allergies: null }],
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects duplicate or out-of-range positions (400)', async () => {
    const { guests: guestsTable } = await import('../../db/schema')
    testDb.update(guestsTable).set({ companionsAllowed: 2 }).where(eq(guestsTable.id, guest.id)).run()

    await expect(postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        companions: [
          { position: 1, attending: false, name: null, menuChoices: {}, allergies: null },
          { position: 1, attending: false, name: null, menuChoices: {}, allergies: null },
        ],
      },
    }))).rejects.toMatchObject({ statusCode: 400 })

    await expect(postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        companions: [
          { position: 1, attending: false, name: null, menuChoices: {}, allergies: null },
          { position: 3, attending: false, name: null, menuChoices: {}, allergies: null },
        ],
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('persists attending companion data and clears non-attending', async () => {
    const { guests: guestsTable, companions: companionsTable } = await import('../../db/schema')
    testDb.update(guestsTable).set({ companionsAllowed: 2 }).where(eq(guestsTable.id, guest.id)).run()

    await postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        companions: [
          { position: 1, attending: true, name: 'Partner', menuChoices: {}, allergies: null },
          { position: 2, attending: false, name: 'Should be cleared', menuChoices: {}, allergies: null },
        ],
      },
    }))

    const stored = testDb.select().from(companionsTable).all().filter(c => c.guestId === guest.id)
    expect(stored.find(c => c.position === 1)).toMatchObject({ name: 'Partner', attending: true })
    const c2 = stored.find(c => c.position === 2)
    expect(c2?.attending).toBe(false)
    expect(c2?.name).toBeNull()
  })

  it('rejects attending companion with empty name (400)', async () => {
    const { guests: guestsTable } = await import('../../db/schema')
    testDb.update(guestsTable).set({ companionsAllowed: 1 }).where(eq(guestsTable.id, guest.id)).run()

    await expect(postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        companions: [{ position: 1, attending: true, name: '   ', menuChoices: {}, allergies: null }],
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('clears all companion data on decline regardless of body', async () => {
    const { guests: guestsTable, companions: companionsTable } = await import('../../db/schema')
    testDb.update(guestsTable).set({ companionsAllowed: 1 }).where(eq(guestsTable.id, guest.id)).run()

    await postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'declined',
        companions: [{ position: 1, attending: true, name: 'Partner', menuChoices: {}, allergies: null }],
      },
    }))

    const stored = testDb.select().from(companionsTable).all().filter(c => c.guestId === guest.id)
    // Either no rows, or rows with cleared data — we accept either
    for (const c of stored) {
      expect(c.attending).toBe(false)
      expect(c.name).toBeNull()
    }
  })

  it('rejects invalid RSVP status (400)', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST',
      params: { token: 'valid-token-123' },
      body: { rsvpStatus: 'invalid', companions: [] },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('POST /api/rsvp/:token — menu picks with companions', () => {
  let course1: any, course2: any, beef: any, salmon: any, cake: any

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    const evt = createTestEvent(testDb, user.id, { allergiesEnabled: true })
    guest = createTestGuest(testDb, evt.id, {
      name: 'Invitee', email: 'invitee@example.com', token: 'valid-token-123',
      companionsAllowed: 1,
    })
    ;[course1] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'First', sortOrder: 0 }).returning().all()
    ;[course2] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Dessert', sortOrder: 1 }).returning().all()
    ;[beef] = testDb.insert(menuOptions).values({ courseId: course1.id, name: 'Beef', sortOrder: 0 }).returning().all()
    ;[salmon] = testDb.insert(menuOptions).values({ courseId: course1.id, name: 'Salmon', sortOrder: 1 }).returning().all()
    ;[cake] = testDb.insert(menuOptions).values({ courseId: course2.id, name: 'Cake', sortOrder: 0 }).returning().all()
  })

  it('rejects when an attending companion is missing a course pick (400)', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        companions: [{
          position: 1, attending: true, name: 'Partner',
          menuChoices: { [course1.id]: salmon.id }, // missing course2
          allergies: null,
        }],
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('persists attending companion menu picks and allergies', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        allergies: { keys: ['nuts'], other: '' },
        companions: [{
          position: 1, attending: true, name: 'Partner',
          menuChoices: { [course1.id]: salmon.id, [course2.id]: cake.id },
          allergies: { keys: ['dairy'], other: '' },
        }],
      },
    }))
    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.choices).toEqual({ [course1.id]: beef.id, [course2.id]: cake.id })
    expect(get.companions[0]).toMatchObject({
      name: 'Partner',
      attending: true,
      menuChoices: { [course1.id]: salmon.id, [course2.id]: cake.id },
      allergies: { keys: ['dairy'], other: '' },
    })
  })

  it('does not require menu picks for non-attending companions', async () => {
    const result = await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        companions: [{
          position: 1, attending: false, name: null, menuChoices: {}, allergies: null,
        }],
      },
    }))
    expect(result.success).toBe(true)
  })
})
```

The existing "allergies gating" describe block can stay; just remove/rewrite any test there that asserts plus-one fields. Specifically, replace the `'persists plus-one allergies when allergiesEnabled = true and no menu exists'` test with a companion equivalent:

```ts
it('persists companion allergies when allergiesEnabled = true and no menu exists', async () => {
  const { guests: guestsTable } = await import('../../db/schema')
  testDb.update(guestsTable).set({ companionsAllowed: 1 }).where(eq(guestsTable.id, guest.id)).run()

  await postHandler(createMockEvent({
    method: 'POST', params: { token: 'valid-token-123' },
    body: {
      rsvpStatus: 'confirmed',
      allergies: { keys: [], other: '' },
      companions: [{
        position: 1, attending: true, name: 'Partner',
        menuChoices: {}, allergies: { keys: ['dairy'], other: '' },
      }],
    },
  }))

  const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
  expect(get.companions[0].allergies).toEqual({ keys: ['dairy'], other: '' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run server/api/__tests__/rsvp.test.ts`
Expected: many FAIL — current handler still uses `plusOne` body fields.

- [ ] **Step 3: Rewrite the POST handler**

Replace `server/api/rsvp/[token].post.ts`:

```ts
import { db } from '~/server/db'
import { guests, menuCourses, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { validateAllergies, serializeAllergies } from '~/server/utils/menu-validation'

type CompanionInput = {
  position: number
  attending: boolean
  name: string | null
  menuChoices: Record<string, number> | undefined
  allergies: unknown
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const body = await readBody(event)
  const { rsvpStatus, menuChoices, allergies, companions: companionInputs } = body

  if (!['confirmed', 'declined'].includes(rsvpStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP status' })
  }

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
    with: { event: true },
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const allergiesEnabled = guest.event?.allergiesEnabled === true
  const isConfirming = rsvpStatus === 'confirmed'

  // ── Validate companions array shape ──────────────────────────────
  if (!Array.isArray(companionInputs)) {
    throw createError({ statusCode: 400, statusMessage: 'companions array required' })
  }
  if (companionInputs.length !== guest.companionsAllowed) {
    throw createError({
      statusCode: 400,
      statusMessage: `expected ${guest.companionsAllowed} companion entries, got ${companionInputs.length}`,
    })
  }
  const seenPositions = new Set<number>()
  for (const c of companionInputs as CompanionInput[]) {
    if (!Number.isInteger(c.position) || c.position < 1 || c.position > guest.companionsAllowed) {
      throw createError({ statusCode: 400, statusMessage: `companion position out of range: ${c.position}` })
    }
    if (seenPositions.has(c.position)) {
      throw createError({ statusCode: 400, statusMessage: `duplicate companion position: ${c.position}` })
    }
    seenPositions.add(c.position)
  }

  // ── Load this event's menu (used for validation) ─────────────────
  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, guest.eventId),
    with: { options: true },
  })
  const hasMenu = courses.length > 0

  function validatePickMap(picks: unknown, label: string) {
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

  // ── Validate self picks/allergies ────────────────────────────────
  let selfPicks: Array<{ courseId: number; optionId: number }> = []
  let selfAllergies = null
  if (isConfirming && hasMenu) selfPicks = validatePickMap(menuChoices, 'menuChoices')
  if (isConfirming && allergiesEnabled) selfAllergies = validateAllergies(allergies)

  // ── Validate each companion ──────────────────────────────────────
  type ParsedCompanion = {
    position: number
    attending: boolean
    name: string | null
    picks: Array<{ courseId: number; optionId: number }>
    allergies: ReturnType<typeof validateAllergies>
  }
  const parsedCompanions: ParsedCompanion[] = []
  for (const c of companionInputs as CompanionInput[]) {
    const attending = isConfirming && c.attending === true
    let name: string | null = null
    let picks: Array<{ courseId: number; optionId: number }> = []
    let allergiesParsed = null
    if (attending) {
      const trimmed = (typeof c.name === 'string' ? c.name.trim() : '')
      if (!trimmed) {
        throw createError({ statusCode: 400, statusMessage: `companion ${c.position}: name required when attending` })
      }
      name = trimmed
      if (hasMenu) picks = validatePickMap(c.menuChoices, `companion ${c.position} menuChoices`)
      if (allergiesEnabled) allergiesParsed = validateAllergies(c.allergies)
    }
    parsedCompanions.push({ position: c.position, attending, name, picks, allergies: allergiesParsed })
  }

  // ── Persist atomically ───────────────────────────────────────────
  db.transaction((tx) => {
    const updateGuest: Record<string, unknown> = { rsvpStatus }
    if (allergiesEnabled) {
      updateGuest.allergies = isConfirming ? serializeAllergies(selfAllergies) : null
    }
    tx.update(guests).set(updateGuest).where(eq(guests.token, token)).run()

    // Replace this guest's menu-choice rows
    tx.delete(guestMenuChoices).where(eq(guestMenuChoices.guestId, guest.id)).run()

    // Upsert companion rows for every position; build a position→id map
    const positionToId = new Map<number, number>()
    for (const pc of parsedCompanions) {
      const existing = tx
        .select({ id: companions.id })
        .from(companions)
        .where(and(eq(companions.guestId, guest.id), eq(companions.position, pc.position)))
        .all()[0]

      if (existing) {
        tx.update(companions).set({
          name: pc.name,
          attending: pc.attending,
          allergies: allergiesEnabled ? serializeAllergies(pc.allergies) : null,
        }).where(eq(companions.id, existing.id)).run()
        positionToId.set(pc.position, existing.id)
      } else {
        const [row] = tx.insert(companions).values({
          guestId: guest.id,
          position: pc.position,
          name: pc.name,
          attending: pc.attending,
          allergies: allergiesEnabled ? serializeAllergies(pc.allergies) : null,
        }).returning().all()
        positionToId.set(pc.position, row.id)
      }
    }

    // Insert menu choices: self + each attending companion
    if (isConfirming && hasMenu) {
      const rows: Array<{ guestId: number; courseId: number; optionId: number; companionId: number | null }> = []
      for (const p of selfPicks) rows.push({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, companionId: null })
      for (const pc of parsedCompanions) {
        if (!pc.attending) continue
        const cid = positionToId.get(pc.position)!
        for (const p of pc.picks) rows.push({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, companionId: cid })
      }
      if (rows.length) tx.insert(guestMenuChoices).values(rows).run()
    }
  })

  return { success: true, rsvpStatus }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run server/api/__tests__/rsvp.test.ts`
Expected: PASS for all RSVP tests.

- [ ] **Step 5: Commit**

```bash
git add server/api/rsvp/[token].post.ts server/api/__tests__/rsvp.test.ts
git commit -m "feat(companions): POST /api/rsvp/:token validates and persists companions"
```

---

## Task 10: Update menu summary to count companions

**Files:**
- Modify: `server/api/events/[id]/menu/summary.get.ts`
- Modify: `server/api/__tests__/menu.test.ts`

- [ ] **Step 1: Replace plus-one summary test with companion case**

In `server/api/__tests__/menu.test.ts`, find the test `'aggregates choices and allergies for confirmed guests only'`. Replace its body with:

```ts
it('aggregates choices and allergies including attending companions', async () => {
  const { companions: companionsTable, guestMenuChoices: choicesTable } = await import('../../db/schema')
  const g1 = createTestGuest(testDb, eventId, { token: 't1', rsvpStatus: 'confirmed' })
  const g2 = createTestGuest(testDb, eventId, { token: 't2', rsvpStatus: 'confirmed', companionsAllowed: 1 })
  const g3 = createTestGuest(testDb, eventId, { token: 't3', rsvpStatus: 'declined' })

  // g1 picks Beef + nut allergy
  testDb.insert(choicesTable).values({
    guestId: g1.id, courseId, optionId: beefId, companionId: null,
  }).run()
  testDb.update(guestsTable).set({ allergies: JSON.stringify({ keys: ['nuts'], other: '' }) })
    .where((await import('drizzle-orm')).eq(guestsTable.id, g1.id)).run()

  // g2 picks Beef for self; companion 1 picks Salmon and is attending; companion has "sesame"
  const [c1] = testDb.insert(companionsTable).values({
    guestId: g2.id, position: 1, name: 'Partner', attending: true,
    allergies: JSON.stringify({ keys: ['nuts'], other: 'sesame' }),
  }).returning().all()
  testDb.insert(choicesTable).values([
    { guestId: g2.id, courseId, optionId: beefId, companionId: null },
    { guestId: g2.id, courseId, optionId: salmonId, companionId: c1.id },
  ]).run()

  void g3 // declined — should not contribute

  const result = await summaryHandler(createMockEvent({ params: { id: String(eventId) } }))
  expect(result.courses[0].options.find((o: any) => o.id === beefId).count).toBe(2)
  expect(result.courses[0].options.find((o: any) => o.id === salmonId).count).toBe(1)
  expect(result.courses[0].unpickedConfirmedGuests).toBe(0)
  expect(result.allergies.keys.nuts).toBe(2)
  expect(result.allergies.other).toEqual([{ text: 'sesame', count: 1 }])
})

it('skips companions with attending=false', async () => {
  const { companions: companionsTable, guestMenuChoices: choicesTable } = await import('../../db/schema')
  const g = createTestGuest(testDb, eventId, { token: 'tx', rsvpStatus: 'confirmed', companionsAllowed: 1 })
  // companion with attending=false but a stored row — its pick must NOT count
  const [c1] = testDb.insert(companionsTable).values({
    guestId: g.id, position: 1, name: null, attending: false,
  }).returning().all()
  testDb.insert(choicesTable).values([
    { guestId: g.id, courseId, optionId: beefId, companionId: null },
    { guestId: g.id, courseId, optionId: salmonId, companionId: c1.id },
  ]).run()

  const result = await summaryHandler(createMockEvent({ params: { id: String(eventId) } }))
  expect(result.courses[0].options.find((o: any) => o.id === beefId).count).toBe(1)
  expect(result.courses[0].options.find((o: any) => o.id === salmonId).count).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run server/api/__tests__/menu.test.ts -t "summary"`
Expected: FAIL — current summary still references `forPlusOne`.

- [ ] **Step 3: Rewrite the summary handler**

Replace `server/api/events/[id]/menu/summary.get.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices, menuCourses, menuOptions, companions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'
import type { AllergenKey } from '~/shared/menu'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    columns: { id: true },
  })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    orderBy: [asc(menuCourses.sortOrder), asc(menuCourses.id)],
    with: {
      options: { orderBy: [asc(menuOptions.sortOrder), asc(menuOptions.id)] },
    },
  })

  const confirmedGuests = await db.query.guests.findMany({
    where: and(eq(guests.eventId, id), eq(guests.rsvpStatus, 'confirmed')),
  })

  if (confirmedGuests.length === 0) {
    return {
      courses: courses.map(c => ({
        id: c.id, name: c.name,
        options: c.options.map(o => ({ id: o.id, name: o.name, count: 0 })),
        unpickedConfirmedGuests: 0,
      })),
      allergies: { keys: {}, other: [] },
    }
  }

  const guestIds = confirmedGuests.map(g => g.id)

  const attendingCompanions = await db.query.companions.findMany({
    where: (c, { inArray, eq: eqOp, and: andOp }) =>
      andOp(inArray(c.guestId, guestIds), eqOp(c.attending, true)),
  })
  const attendingCompanionIds = new Set(attendingCompanions.map(c => c.id))

  const choices = await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestIds),
  })

  // Per-course aggregation
  const courseOut = courses.map(course => {
    const optCounts = new Map<number, number>()
    for (const opt of course.options) optCounts.set(opt.id, 0)

    const haveSelfPick = new Set<number>()
    const havePickByCompanionId = new Set<number>()

    for (const ch of choices) {
      if (ch.courseId !== course.id) continue
      // Companions that exist but are not attending: skip their picks entirely
      if (ch.companionId != null && !attendingCompanionIds.has(ch.companionId)) continue
      if (ch.optionId != null && optCounts.has(ch.optionId)) {
        optCounts.set(ch.optionId, optCounts.get(ch.optionId)! + 1)
      }
      if (ch.companionId == null) haveSelfPick.add(ch.guestId)
      else havePickByCompanionId.add(ch.companionId)
    }

    let unpicked = 0
    for (const g of confirmedGuests) {
      if (!haveSelfPick.has(g.id)) unpicked++
    }
    for (const c of attendingCompanions) {
      if (!havePickByCompanionId.has(c.id)) unpicked++
    }

    return {
      id: course.id,
      name: course.name,
      options: course.options.map(o => ({ id: o.id, name: o.name, count: optCounts.get(o.id) ?? 0 })),
      unpickedConfirmedGuests: unpicked,
    }
  })

  // Allergies — guests + attending companions only
  const keyCounts: Partial<Record<AllergenKey, number>> = {}
  const otherMap = new Map<string, number>()
  for (const g of confirmedGuests) {
    const own = parseAllergies(g.allergies)
    if (own) {
      for (const k of own.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
      if (own.other) otherMap.set(own.other, (otherMap.get(own.other) ?? 0) + 1)
    }
  }
  for (const c of attendingCompanions) {
    const a = parseAllergies(c.allergies)
    if (!a) continue
    for (const k of a.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
    if (a.other) otherMap.set(a.other, (otherMap.get(a.other) ?? 0) + 1)
  }

  return {
    courses: courseOut,
    allergies: {
      keys: keyCounts as Record<string, number>,
      other: Array.from(otherMap.entries()).map(([text, count]) => ({ text, count })),
    },
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run server/api/__tests__/menu.test.ts`
Expected: all menu tests PASS.

- [ ] **Step 5: Run the full server test suite**

Run: `npm test -- --run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/[id]/menu/summary.get.ts server/api/__tests__/menu.test.ts
git commit -m "feat(companions): menu summary aggregates attending companions"
```

---

## Task 11: i18n — remove plus-one keys, add companion/seat keys

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Update `i18n/lang/en.json`**

In the `guests` block, remove these keys (delete lines):

```json
"plusOne": "+1",
"plusOneWithName": "+1: {name}",
"guestCount": "{current} / {limit} guests",
"guestCountUnlimited": "{current} guests",
"guestLimitReached": "Guest limit reached for your plan ({limit}). Upgrade to add more.",
"importLimitExceeded": "Import would exceed your guest limit ({limit}). You can add {remaining} more.",
```

Add into the same `guests` block:

```json
"companion": "Companion",
"companions": "Companions",
"companionLabel": "Companion {n}",
"companionWithName": "Companion {n} — {name}",
"companionPending": "Companion {n} — pending",
"confirmRemoveCompanion": "Remove Companion {n} ({name})? Their RSVP info will be deleted.",
"confirmRemoveCompanionUnnamed": "Remove Companion {n}? Their RSVP info will be deleted.",
"seatCount": "{current} / {limit} seats",
"seatCountUnlimited": "{current} seats",
"seatLimitReached": "Seat limit reached for your plan ({limit}). Upgrade to add more.",
"importSeatLimitExceeded": "Import would exceed your seat limit ({limit}). You can add {remaining} more.",
```

In the `rsvp` block, remove:

```json
"plusOne": "I'll be bringing a plus one",
"plusOneName": "Plus one's name",
```

In `rsvp.menu`, remove:

```json
"plusOneTitle": "Your guest's menu",
```

In `rsvp.allergies`, remove:

```json
"plusOneTitle": "Your guest's allergies & dietary"
```

In the `rsvp` block, add:

```json
"companion": {
  "label": "Companion {n}",
  "attendingQuestion": "Will {label} attend?",
  "namePlaceholder": "Their full name",
  "menuTitle": "Menu — Companion {n}",
  "allergiesTitle": "Allergies — Companion {n}"
}
```

Also in the `eventDetail` block (around line 163), `plusOnes` is no longer used in any view that we're keeping — leave it for now if it's referenced elsewhere, or remove if a quick `grep -rn "plusOnes" pages/ components/` shows no consumer.

- [ ] **Step 2: Update `i18n/lang/es.json` with the same changes**

Spanish equivalents (apply the same removals + adds with these translations):

```json
"companion": "Acompañante",
"companions": "Acompañantes",
"companionLabel": "Acompañante {n}",
"companionWithName": "Acompañante {n} — {name}",
"companionPending": "Acompañante {n} — pendiente",
"confirmRemoveCompanion": "¿Eliminar al Acompañante {n} ({name})? Se borrarán sus datos del RSVP.",
"confirmRemoveCompanionUnnamed": "¿Eliminar al Acompañante {n}? Se borrarán sus datos del RSVP.",
"seatCount": "{current} / {limit} plazas",
"seatCountUnlimited": "{current} plazas",
"seatLimitReached": "Has alcanzado el límite de plazas de tu plan ({limit}). Mejora tu plan para añadir más.",
"importSeatLimitExceeded": "La importación superaría tu límite de plazas ({limit}). Puedes añadir {remaining} más.",
```

```json
"companion": {
  "label": "Acompañante {n}",
  "attendingQuestion": "¿Asistirá {label}?",
  "namePlaceholder": "Su nombre completo",
  "menuTitle": "Menú — Acompañante {n}",
  "allergiesTitle": "Alergias — Acompañante {n}"
}
```

- [ ] **Step 3: Verify both JSON files parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/lang/en.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/lang/es.json','utf8')); console.log('OK')"`
Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n(companions): remove plus-one keys, add companion/seat keys"
```

---

## Task 12: Admin guests page — companion stepper, seat header, expand panel, filters

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`

- [ ] **Step 1: Update the `<script setup>` data wiring**

In `pages/dashboard/events/[id]/guests.vue`, replace the `guestCountLabel` computed (currently lines 17–23) with seat-based wording:

```ts
const seatCountLabel = computed(() => {
  const guestRows = guests.value ?? []
  const seats = guestRows.reduce((acc: number, g: any) => acc + 1 + (g.companionsAllowed ?? 0), 0)
  if (guestLimit.value != null) {
    return t('guests.seatCount', { current: seats, limit: guestLimit.value })
  }
  return t('guests.seatCountUnlimited', { current: seats })
})
```

Update the template usage (currently around line 202) — replace `{{ guestCountLabel }}` with `{{ seatCountLabel }}`.

- [ ] **Step 2: Add the stepper logic**

Inside `<script setup>`, after the existing `addError` ref, add:

```ts
const stepperBusy = ref<Record<number, boolean>>({})
const stepperError = ref('')

async function changeCompanions(g: any, delta: 1 | -1) {
  const newN = (g.companionsAllowed ?? 0) + delta
  if (newN < 0 || newN > 5) return

  // Confirm dialog when decrementing a slot that has data
  if (delta === -1) {
    const droppedPos = g.companionsAllowed
    const dropped = (g.companions ?? []).find((c: any) => c.position === droppedPos)
    const hasData = !!dropped && (
      (dropped.name && dropped.name.trim().length > 0) ||
      dropped.attending ||
      (dropped.allergies && (dropped.allergies.keys?.length || dropped.allergies.other)) ||
      (dropped.menuChoices && Object.keys(dropped.menuChoices).length > 0)
    )
    if (hasData) {
      const msg = dropped?.name
        ? t('guests.confirmRemoveCompanion', { n: droppedPos, name: dropped.name })
        : t('guests.confirmRemoveCompanionUnnamed', { n: droppedPos })
      if (!confirm(msg)) return
    }
  }

  stepperBusy.value[g.id] = true
  stepperError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/guests/${g.id}`, {
      method: 'PATCH',
      body: { companionsAllowed: newN },
    })
    await refreshGuests()
  } catch (e: any) {
    if (e?.response?.status === 403) {
      stepperError.value = t('guests.seatLimitReached', { limit: guestLimit.value })
    } else {
      stepperError.value = t('errors.somethingWentWrong')
    }
  } finally {
    stepperBusy.value[g.id] = false
  }
}
```

- [ ] **Step 3: Update the `filteredGuests` to scan companions**

Replace the existing `filteredGuests` computed (lines 153–170) with:

```ts
const filteredGuests = computed(() => {
  const list = (guests.value ?? []) as any[]
  const opt = route.query.menuOption ? Number(route.query.menuOption) : null
  const allergy = (route.query.allergy as string) || null
  return list.filter((g: any) => {
    if (opt) {
      const selfPick = Object.values(g.menuChoices ?? {}).includes(opt)
      const compPick = (g.companions ?? []).some((c: any) =>
        Object.values(c.menuChoices ?? {}).includes(opt),
      )
      if (!selfPick && !compPick) return false
    }
    if (allergy) {
      const selfHas = (g.allergies?.keys ?? []).includes(allergy)
      const compHas = (g.companions ?? []).some((c: any) =>
        (c.allergies?.keys ?? []).includes(allergy),
      )
      if (!selfHas && !compHas) return false
    }
    return true
  })
})
```

- [ ] **Step 4: Update the table template — add Companions column**

In the `<thead>` (around line 302), insert a new `<th>` between Email and RSVP Status:

```html
<th class="text-center px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.companions') }}</th>
```

In the `<tbody>` row (around line 311), insert a new `<td>` after the Email td and before the RSVP td:

```html
<td class="px-6 py-4 text-center whitespace-nowrap">
  <div class="inline-flex items-center gap-2">
    <button type="button" @click="changeCompanions(g, -1)"
      :disabled="(g.companionsAllowed ?? 0) === 0 || stepperBusy[g.id]"
      class="w-7 h-7 rounded-full border border-charcoal-200 text-charcoal-700 hover:border-champagne-400 hover:bg-ivory-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none">
      −
    </button>
    <span class="w-6 text-center text-sm font-medium text-charcoal-900 tabular-nums">
      {{ g.companionsAllowed ?? 0 }}
    </span>
    <button type="button" @click="changeCompanions(g, 1)"
      :disabled="(g.companionsAllowed ?? 0) >= 5 || stepperBusy[g.id]"
      class="w-7 h-7 rounded-full border border-charcoal-200 text-charcoal-700 hover:border-champagne-400 hover:bg-ivory-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none">
      +
    </button>
  </div>
</td>
```

- [ ] **Step 5: Replace the +1 sub-row and expand panel**

Find the `<div v-if="g.plusOne" class="text-xs text-charcoal-500 font-normal mt-0.5">` block (around line 314) and replace it with:

```html
<template v-if="(g.companionsAllowed ?? 0) > 0">
  <div class="text-xs text-charcoal-500 font-normal mt-0.5">
    {{ t('guests.companions') }}: {{ (g.companions ?? []).filter((c: any) => c.attending).length }}/{{ g.companionsAllowed }}
  </div>
</template>
```

In the expand-for-details block (around line 321), replace everything inside `<div v-if="expandedId === g.id" ...>` with:

```html
<div v-if="expandedId === g.id" class="mt-3 pl-4 border-l-2 border-charcoal-100 space-y-3 text-sm">
  <div>
    <div class="font-medium text-charcoal-700 mb-1">{{ g.name }}</div>
    <div v-for="course in menu?.courses ?? []" :key="course.id">
      <span class="text-charcoal-300">{{ course.name }}:</span>
      <span class="ml-1">{{ optionName(course.id, g.menuChoices?.[course.id]) ?? '—' }}</span>
    </div>
    <div v-if="allergiesEnabled && g.allergies">
      <span class="text-charcoal-300">{{ t('rsvp.allergies.title') }}:</span>
      <span class="ml-1">{{ formatAllergies(g.allergies) }}</span>
    </div>
  </div>

  <div v-for="pos in g.companionsAllowed ?? 0" :key="`comp-${pos}`">
    <template v-if="(g.companions ?? []).find((c: any) => c.position === pos) as any">
      <div class="font-medium text-charcoal-700 mb-1">
        <template v-if="((g.companions ?? []).find((c: any) => c.position === pos))?.name">
          {{ t('guests.companionWithName', { n: pos, name: (g.companions ?? []).find((c: any) => c.position === pos).name }) }}
        </template>
        <template v-else>
          {{ t('guests.companionPending', { n: pos }) }}
        </template>
      </div>
      <template v-if="((g.companions ?? []).find((c: any) => c.position === pos))?.attending">
        <div v-for="course in menu?.courses ?? []" :key="`c${pos}-${course.id}`">
          <span class="text-charcoal-300">{{ course.name }}:</span>
          <span class="ml-1">{{ optionName(course.id, ((g.companions ?? []).find((c: any) => c.position === pos)).menuChoices?.[course.id]) ?? '—' }}</span>
        </div>
        <div v-if="allergiesEnabled && ((g.companions ?? []).find((c: any) => c.position === pos))?.allergies">
          <span class="text-charcoal-300">{{ t('rsvp.allergies.title') }}:</span>
          <span class="ml-1">{{ formatAllergies(((g.companions ?? []).find((c: any) => c.position === pos)).allergies) }}</span>
        </div>
      </template>
    </template>
    <template v-else>
      <div class="font-medium text-charcoal-300">{{ t('guests.companionPending', { n: pos }) }}</div>
    </template>
  </div>
</div>
```

- [ ] **Step 6: Surface the stepper error banner**

Above the table (after the existing add/import error blocks, around line 277) add:

```html
<div v-if="stepperError" class="mb-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
  <p class="text-sm text-red-700">{{ stepperError }}</p>
  <NuxtLinkLocale v-if="stepperError.includes(String(guestLimit))" to="/pricing"
    class="ml-4 px-3 py-1 bg-champagne-500 text-white rounded-full text-xs font-medium hover:bg-champagne-600 transition-colors whitespace-nowrap">
    {{ t('guests.upgradePlan') }}
  </NuxtLinkLocale>
</div>
```

- [ ] **Step 7: Replace the `addError`/`importError` banner messages**

Where `addError = t('guests.guestLimitReached', { limit: guestLimit.value })` (around line 53), change to `t('guests.seatLimitReached', ...)`. Where `importError = t('guests.importLimitExceeded', ...)` (around line 97), change to `t('guests.importSeatLimitExceeded', ...)`.

- [ ] **Step 8: Smoke-test in dev**

Run: `npm run dev` (in another terminal)
Then in a browser, log in, open an event's guests page, and verify:
- Header shows "X / Y seats" (or "X seats" for unlimited tier).
- New Companions column with a stepper appears between Email and RSVP Status.
- Clicking `+` increments and persists; clicking `−` decrements (or shows confirm if data exists).
- Hitting the seat limit on `+` shows the red banner with Upgrade CTA.

Stop the dev server when done.

- [ ] **Step 9: Commit**

```bash
git add pages/dashboard/events/[id]/guests.vue
git commit -m "feat(companions): admin guests stepper, seat header, expand panel"
```

---

## Task 13: RSVP page — N companion cards

**Files:**
- Modify: `pages/i/[slug].vue`

- [ ] **Step 1: Update `<script setup>` state**

Replace the `rsvpForm`, `menuChoices`, `plusOneMenuChoices`, `allergies`, `plusOneAllergies` block (lines 35–48) with:

```ts
type CompanionState = {
  position: number
  attending: boolean
  name: string
  menuChoices: Record<number, number | null>
  allergies: Allergies | null
}

const rsvpForm = reactive({
  rsvpStatus: '' as string,
})

const menuChoices = ref<Record<number, number | null>>({})
const allergies = ref<Allergies | null>(null)
const companionsState = ref<CompanionState[]>([])

const rsvpSubmitting = ref(false)
const rsvpError = ref('')
```

- [ ] **Step 2: Update the `watch(guestData, ...)` block**

Replace it (lines 49–65) with:

```ts
watch(guestData, (data) => {
  if (!data) return
  rsvpForm.rsvpStatus = data.rsvpStatus !== 'pending' ? data.rsvpStatus : ''
  if (data.menu) {
    for (const c of data.menu.courses) {
      if (!(c.id in menuChoices.value)) menuChoices.value[c.id] = data.choices?.[c.id] ?? null
    }
  }
  if (data.allergiesEnabled) {
    allergies.value = data.allergies ?? null
  }
  // Build companion state — exactly companionsAllowed entries 1..N
  const incoming: CompanionState[] = (data.companions ?? []).map((c: any) => ({
    position: c.position,
    attending: c.attending ?? false,
    name: c.name ?? '',
    menuChoices: { ...(c.menuChoices ?? {}) },
    allergies: data.allergiesEnabled ? (c.allergies ?? null) : null,
  }))
  companionsState.value = incoming
}, { immediate: true })
```

- [ ] **Step 3: Update `canSubmit` computed**

Replace it (lines 67–77) with:

```ts
const canSubmit = computed(() => {
  if (!rsvpForm.rsvpStatus) return false
  if (rsvpForm.rsvpStatus !== 'confirmed') return true
  const m = guestData.value?.menu
  if (m) {
    for (const c of m.courses) {
      if (!menuChoices.value[c.id]) return false
    }
  }
  for (const comp of companionsState.value) {
    if (!comp.attending) continue
    if (!comp.name.trim()) return false
    if (m) {
      for (const c of m.courses) {
        if (!comp.menuChoices[c.id]) return false
      }
    }
  }
  return true
})
```

- [ ] **Step 4: Update `submitRsvp` to send the new body**

Replace it (lines 79–103) with:

```ts
async function submitRsvp() {
  if (!guestToken.value || !canSubmit.value) return
  rsvpSubmitting.value = true
  rsvpError.value = ''

  try {
    await $fetch(`/api/rsvp/${guestToken.value}`, {
      method: 'POST',
      body: {
        rsvpStatus: rsvpForm.rsvpStatus,
        menuChoices: menuChoices.value,
        allergies: allergies.value,
        companions: companionsState.value.map(c => ({
          position: c.position,
          attending: c.attending,
          name: c.name.trim() || null,
          menuChoices: c.menuChoices,
          allergies: c.allergies,
        })),
      },
    })
    await refreshGuest()
  } catch (e: any) {
    rsvpError.value = e.data?.statusMessage || t('errors.somethingWentWrong')
  } finally {
    rsvpSubmitting.value = false
  }
}
```

- [ ] **Step 5: Replace the +1 form template with companion cards**

Find the `<div v-if="rsvpForm.rsvpStatus === 'confirmed'" class="mb-6 text-left">` block (around line 197). Replace its entire body with:

```html
<div v-if="rsvpForm.rsvpStatus === 'confirmed'" class="mb-6 text-left">

  <!-- Self menu -->
  <div v-if="guestData?.menu" class="mt-2 space-y-6">
    <fieldset v-for="course in guestData.menu.courses" :key="course.id" class="text-left">
      <legend class="block text-sm font-medium text-charcoal-500 mb-2">{{ course.name }}</legend>
      <label v-for="o in course.options" :key="o.id"
        class="flex items-center gap-3 p-2 rounded border cursor-pointer mb-1"
        :class="menuChoices[course.id] === o.id ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
        <input type="radio" :name="`course-${course.id}`" :value="o.id" v-model="menuChoices[course.id]" />
        <span>{{ o.name }}</span>
      </label>
    </fieldset>
  </div>

  <!-- Self allergies -->
  <div v-if="guestData?.allergiesEnabled" class="mt-6">
    <label class="block text-sm font-medium text-charcoal-500 mb-2">{{ $t('rsvp.allergies.title') }}</label>
    <MenuAllergyPicker v-model="allergies" />
  </div>

  <!-- Companions -->
  <div v-if="companionsState.length" class="mt-8 space-y-6">
    <section v-for="comp in companionsState" :key="comp.position"
      class="border border-charcoal-100 rounded-xl p-4 bg-ivory-50/40">
      <h3 class="font-medium text-charcoal-700 mb-3">{{ $t('rsvp.companion.label', { n: comp.position }) }}</h3>

      <label class="flex items-center gap-3 mb-3 cursor-pointer">
        <input type="checkbox" v-model="comp.attending" class="rounded text-champagne-600" />
        <span class="text-sm font-medium text-charcoal-500">
          {{ $t('rsvp.companion.attendingQuestion', { label: comp.name.trim() || $t('rsvp.companion.label', { n: comp.position }) }) }}
        </span>
      </label>

      <div v-if="comp.attending" class="space-y-4">
        <input
          v-model="comp.name"
          type="text"
          :placeholder="$t('rsvp.companion.namePlaceholder')"
          class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500 focus:border-champagne-500"
        />

        <div v-if="guestData?.menu" class="space-y-4">
          <fieldset v-for="course in guestData.menu.courses" :key="`c${comp.position}-${course.id}`">
            <legend class="block text-sm font-medium text-charcoal-500 mb-2">
              {{ $t('rsvp.companion.menuTitle', { n: comp.position }) }} — {{ course.name }}
            </legend>
            <label v-for="o in course.options" :key="o.id"
              class="flex items-center gap-3 p-2 rounded border cursor-pointer mb-1"
              :class="comp.menuChoices[course.id] === o.id ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
              <input type="radio" :name="`c${comp.position}-course-${course.id}`" :value="o.id" v-model="comp.menuChoices[course.id]" />
              <span>{{ o.name }}</span>
            </label>
          </fieldset>
        </div>

        <div v-if="guestData?.allergiesEnabled">
          <label class="block text-sm font-medium text-charcoal-500 mb-2">
            {{ $t('rsvp.companion.allergiesTitle', { n: comp.position }) }}
          </label>
          <MenuAllergyPicker v-model="comp.allergies" />
        </div>
      </div>
    </section>
  </div>
</div>
```

- [ ] **Step 6: Smoke-test in dev**

Run: `npm run dev`. In the dashboard, set a guest's `companionsAllowed` to 2. Open their personal RSVP link in another browser. Verify:
- Two Companion cards appear when "Joyfully Accept" is selected.
- Each card has its own attending toggle.
- Toggling on reveals name/menu/allergies fields.
- Submit button enables only when self menu + every attending companion's name and menu picks are filled.
- Submit succeeds and the host dashboard expand-for-details panel shows the entered companions.

Stop the dev server when done. Run `rm -rf .playwright-mcp/` if you used the Playwright MCP browser tools.

- [ ] **Step 7: Commit**

```bash
git add pages/i/[slug].vue
git commit -m "feat(companions): RSVP page renders N companion cards"
```

---

## Task 14: Final verification

**Files:** none new

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: ALL PASS. If any fail, fix the underlying issue (re-read the relevant task) before continuing.

- [ ] **Step 2: Type-check the project**

Run: `npx nuxt prepare && npx tsc --noEmit`
Expected: no TypeScript errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 4: Grep for orphaned references**

Run: `grep -rn "plusOne\|plus_one\|plus-one\|forPlusOne" --include='*.ts' --include='*.vue' --include='*.json' pages/ components/ server/ i18n/ shared/ composables/ 2>/dev/null`
Expected: no matches, OR only matches in `server/db/migrations/0006_*.sql` (historical migration, must remain untouched). Any match outside historical migration files indicates a missed file from earlier tasks — fix and recommit.

- [ ] **Step 5: Commit if anything changed**

If step 4 surfaced any straggler edits, commit them:

```bash
git add -A
git commit -m "chore(companions): clean up orphaned plus-one references"
```

If nothing changed, skip this step.

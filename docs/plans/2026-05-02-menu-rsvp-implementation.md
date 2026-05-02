# Menu Selection & Allergy Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let couples optionally define a multi-course menu for their event so guests pick options and report allergies during RSVP, and the couple sees per-guest detail and aggregated catering totals on the dashboard.

**Architecture:** Three new normalized tables (`menu_courses`, `menu_options`, `guest_menu_choices`) plus two new columns on `guests` (`allergies`, `plus_one_allergies`). New API surface under `/api/events/[id]/menu` for the couple, and extended request/response shape on `/api/rsvp/[token]` for guests. UI: new "Menu" tab on the event detail page with a builder + summary, plus an opt-in checkbox on step 1 of the creation wizard, plus extra fields on the public invitation page.

**Tech Stack:** Nuxt 3 (Vue 3, TypeScript) · Nitro · Drizzle ORM on SQLite · drizzle-kit migrations · Vitest · Tailwind · `@nuxtjs/i18n`.

**Reference spec:** [`docs/superpowers/specs/2026-05-02-menu-rsvp-design.md`](../superpowers/specs/2026-05-02-menu-rsvp-design.md)

---

## File map

**Created:**

```
server/db/migrations/0004_*.sql           (drizzle-kit generated)
server/db/migrations/meta/0004_snapshot.json (drizzle-kit generated)
shared/menu.ts                            allergen enum + types reused on both sides
server/utils/menu-validation.ts           server-only validation helpers
server/api/events/[id]/menu/index.get.ts
server/api/events/[id]/menu/index.put.ts
server/api/events/[id]/menu/summary.get.ts
server/api/__tests__/menu.test.ts         covers GET/PUT/summary
components/menu/MenuBuilder.vue
components/menu/MenuSummary.vue
components/menu/AllergyPicker.vue         shared picker reused in invitation page
pages/dashboard/events/[id]/menu.vue
docs/plans/2026-05-02-menu-rsvp-implementation.md  (this file)
```

**Modified:**

```
server/db/schema.ts                       new tables + relations + columns
server/__helpers__/db.ts                  test schema mirrors new tables/columns
server/api/rsvp/[token].get.ts            include menu, choices, allergies
server/api/rsvp/[token].post.ts           validate + persist choices/allergies
server/api/events/index.post.ts           accept optional `menu` field
server/api/__tests__/rsvp.test.ts         extend coverage
server/api/__tests__/events.test.ts       extend coverage
pages/i/[slug].vue                        guest-side menu + allergy form
pages/dashboard/events/new.vue            wizard step 1: opt-in checkbox + builder
pages/dashboard/events/[id]/index.vue     overview Menu card; tab nav += Menu
pages/dashboard/events/[id]/guests.vue    expandable per-guest detail; tab nav += Menu
pages/dashboard/events/[id]/settings.vue  tab nav += Menu
pages/dashboard/events/[id]/template.vue  tab nav += Menu (if it has tab nav)
i18n/locales/en.json                      new keys
i18n/locales/es.json                      new keys
```

**Conventions established by existing code (follow them):**

- Drizzle migrations: never hand-write SQL — run `npm run db:generate` after editing `schema.ts`. The journal at `server/db/migrations/meta/_journal.json` is updated by drizzle-kit.
- Server tests use `server/__helpers__/db.ts` which hand-rolls SQLite DDL. Any new table/column must be mirrored there or tests will fail with "no such column".
- API endpoint files: small handlers using `requireAuth(event)` for authed routes, `defineEventHandler`, and `db.query.<table>.findFirst({ where, with })` style.
- Vue pages: tab nav is currently duplicated as a `tabs` `computed` per page. We'll keep the duplication (matches the codebase) and just add the `Menu` entry everywhere.
- Allergens enum is fixed in code and i18n-translated by key — never store labels in the DB.

---

## Phase A — Schema & migration

### Task A1: Add new tables and columns to Drizzle schema

**Files:**
- Modify: `server/db/schema.ts`

- [ ] **Step 1: Add the three menu tables and relations, plus the two allergy columns on `guests`.**

Append at the bottom of `server/db/schema.ts` (before any trailing exports):

```ts
// ─── Menu ───────────────────────────────────────────────────────────────────

export const menuCourses = sqliteTable('menu_courses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const menuOptions = sqliteTable('menu_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  courseId: integer('course_id').notNull().references(() => menuCourses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const guestMenuChoices = sqliteTable('guest_menu_choices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guestId: integer('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  courseId: integer('course_id').notNull().references(() => menuCourses.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').references(() => menuOptions.id, { onDelete: 'set null' }),
  forPlusOne: integer('for_plus_one', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const menuCoursesRelations = relations(menuCourses, ({ one, many }) => ({
  event: one(events, { fields: [menuCourses.eventId], references: [events.id] }),
  options: many(menuOptions),
  choices: many(guestMenuChoices),
}))

export const menuOptionsRelations = relations(menuOptions, ({ one, many }) => ({
  course: one(menuCourses, { fields: [menuOptions.courseId], references: [menuCourses.id] }),
  choices: many(guestMenuChoices),
}))

export const guestMenuChoicesRelations = relations(guestMenuChoices, ({ one }) => ({
  guest: one(guests, { fields: [guestMenuChoices.guestId], references: [guests.id] }),
  course: one(menuCourses, { fields: [guestMenuChoices.courseId], references: [menuCourses.id] }),
  option: one(menuOptions, { fields: [guestMenuChoices.optionId], references: [menuOptions.id] }),
}))
```

Add `allergies` and `plusOneAllergies` to the existing `guests` table definition, just before `createdAt`:

```ts
  allergies: text('allergies'),
  plusOneAllergies: text('plus_one_allergies'),
```

Extend `eventsRelations` so events can pull in their menu courses:

```ts
  menuCourses: many(menuCourses),
```

Extend `guestsRelations` so guests can pull in their menu choices:

```ts
  menuChoices: many(guestMenuChoices),
```

- [ ] **Step 2: Generate the migration with drizzle-kit.**

Run: `npm run db:generate`
Expected: a new file `server/db/migrations/0004_<auto-name>.sql` and updated journal under `server/db/migrations/meta/`. Inspect the SQL — it should contain `CREATE TABLE menu_courses`, `CREATE TABLE menu_options`, `CREATE TABLE guest_menu_choices`, and `ALTER TABLE guests ADD COLUMN allergies` / `ADD COLUMN plus_one_allergies`. **Do not edit the generated file.**

- [ ] **Step 3: Apply migration to local DB.**

Run: `npm run db:migrate`
Expected: command exits 0; no errors; migration is applied idempotently.

- [ ] **Step 4: Commit.**

```bash
git add server/db/schema.ts server/db/migrations/
git commit -m "db: add menu tables and guest allergy fields"
```

### Task A2: Mirror schema changes in the test helper

The test helper at `server/__helpers__/db.ts` hand-rolls SQL DDL for the in-memory test DB. It must match the new schema or every test file will explode.

**Files:**
- Modify: `server/__helpers__/db.ts`

- [ ] **Step 1: Add the three new tables and the two new columns inside the `sqlite.exec(\`…\`)` block in `createTestDb()`.**

Add these `CREATE TABLE` statements at the end of the existing block (before the closing backtick):

```sql
    CREATE TABLE menu_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE menu_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES menu_courses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE guest_menu_choices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES menu_courses(id) ON DELETE CASCADE,
      option_id INTEGER REFERENCES menu_options(id) ON DELETE SET NULL,
      for_plus_one INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (guest_id, course_id, for_plus_one)
    );
```

In the existing `CREATE TABLE guests` block, add two columns just before `created_at`:

```sql
      allergies TEXT,
      plus_one_allergies TEXT,
```

- [ ] **Step 2: Run the existing test suite to confirm nothing broke from the additive change.**

Run: `npx vitest run`
Expected: all existing tests still pass — adding columns/tests should be backward-compatible.

- [ ] **Step 3: Commit.**

```bash
git add server/__helpers__/db.ts
git commit -m "test: mirror menu tables in test db helper"
```

---

## Phase B — Shared menu utilities

### Task B1: Allergen enum + shared types

**Files:**
- Create: `shared/menu.ts`

- [ ] **Step 1: Create the shared module.**

```ts
// shared/menu.ts

export const ALLERGEN_KEYS = [
  'nuts',
  'gluten',
  'dairy',
  'shellfish',
  'eggs',
  'vegetarian',
  'vegan',
] as const

export type AllergenKey = typeof ALLERGEN_KEYS[number]

export const ALLERGY_OTHER_MAX_LENGTH = 200

export interface Allergies {
  keys: AllergenKey[]
  other: string
}

export interface MenuOption {
  id: number
  name: string
  sortOrder: number
}

export interface MenuCourse {
  id: number
  name: string
  sortOrder: number
  options: MenuOption[]
}

export interface MenuTree {
  courses: MenuCourse[]
}

// Used by the PUT endpoint and wizard payload — incoming items may not have ids yet.
export interface MenuOptionInput {
  id?: number
  name: string
  sortOrder: number
}

export interface MenuCourseInput {
  id?: number
  name: string
  sortOrder: number
  options: MenuOptionInput[]
}

export interface MenuTreeInput {
  courses: MenuCourseInput[]
}
```

- [ ] **Step 2: Commit.**

```bash
git add shared/menu.ts
git commit -m "feat(menu): shared allergen enum and types"
```

### Task B2: Server validation helper

**Files:**
- Create: `server/utils/menu-validation.ts`

- [ ] **Step 1: Create validation helpers used by both the PUT endpoint and the RSVP POST.**

```ts
// server/utils/menu-validation.ts
import { ALLERGEN_KEYS, ALLERGY_OTHER_MAX_LENGTH, type AllergenKey, type Allergies, type MenuTreeInput } from '~/shared/menu'

export function validateMenuTree(input: unknown): MenuTreeInput {
  if (!input || typeof input !== 'object' || !Array.isArray((input as any).courses)) {
    throw createError({ statusCode: 400, statusMessage: 'menu.courses must be an array' })
  }
  const courses = (input as any).courses
  if (courses.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'menu must have at least one course' })
  }
  for (const c of courses) {
    if (!c || typeof c.name !== 'string' || c.name.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'every course needs a non-empty name' })
    }
    if (!Array.isArray(c.options) || c.options.length === 0) {
      throw createError({ statusCode: 400, statusMessage: `course "${c.name}" must have at least one option` })
    }
    for (const o of c.options) {
      if (!o || typeof o.name !== 'string' || o.name.trim().length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'every option needs a non-empty name' })
      }
    }
  }
  return input as MenuTreeInput
}

export function validateAllergies(input: unknown): Allergies | null {
  if (input == null) return null
  if (typeof input !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'allergies must be an object' })
  }
  const keysRaw = (input as any).keys
  const otherRaw = (input as any).other
  const keys: AllergenKey[] = []
  if (Array.isArray(keysRaw)) {
    for (const k of keysRaw) {
      if (!ALLERGEN_KEYS.includes(k)) {
        throw createError({ statusCode: 400, statusMessage: `unknown allergen key: ${k}` })
      }
      if (!keys.includes(k)) keys.push(k)
    }
  }
  let other = ''
  if (typeof otherRaw === 'string') {
    other = otherRaw.trim().slice(0, ALLERGY_OTHER_MAX_LENGTH)
  }
  if (keys.length === 0 && other === '') return null
  return { keys, other }
}

export function serializeAllergies(a: Allergies | null): string | null {
  return a ? JSON.stringify(a) : null
}

export function parseAllergies(stored: string | null | undefined): Allergies | null {
  if (!stored) return null
  try {
    const obj = JSON.parse(stored)
    return validateAllergies(obj)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Commit.**

```bash
git add server/utils/menu-validation.ts
git commit -m "feat(menu): server validation helpers for menu tree and allergies"
```

---

## Phase C — Couple-side menu API

### Task C1: GET menu

**Files:**
- Create: `server/api/events/[id]/menu/index.get.ts`
- Test: `server/api/__tests__/menu.test.ts`

- [ ] **Step 1: Write the failing test (file scaffolding + first test).**

Create `server/api/__tests__/menu.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { menuCourses, menuOptions } from '../../db/schema'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

vi.mock('~/server/utils/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: currentUserId })),
}))

let currentUserId = 0

const getMenuHandler = (await import('../../api/events/[id]/menu/index.get')).default

describe('GET /api/events/:id/menu', () => {
  let eventId: number

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    currentUserId = user.id
    const evt = createTestEvent(testDb, user.id)
    eventId = evt.id
  })

  it('returns empty courses when no menu exists', async () => {
    const event = createMockEvent({ params: { id: String(eventId) } })
    const result = await getMenuHandler(event)
    expect(result).toEqual({ courses: [] })
  })

  it('returns courses with options ordered by sortOrder', async () => {
    const [c1] = testDb.insert(menuCourses).values({ eventId, name: 'First', sortOrder: 0 }).returning().all()
    const [c2] = testDb.insert(menuCourses).values({ eventId, name: 'Second', sortOrder: 1 }).returning().all()
    testDb.insert(menuOptions).values([
      { courseId: c1.id, name: 'Beef', sortOrder: 1 },
      { courseId: c1.id, name: 'Salmon', sortOrder: 0 },
      { courseId: c2.id, name: 'Cake', sortOrder: 0 },
    ]).run()

    const event = createMockEvent({ params: { id: String(eventId) } })
    const result = await getMenuHandler(event)

    expect(result.courses).toHaveLength(2)
    expect(result.courses[0].name).toBe('First')
    expect(result.courses[0].options.map(o => o.name)).toEqual(['Salmon', 'Beef'])
    expect(result.courses[1].name).toBe('Second')
  })

  it('rejects when user does not own event (404)', async () => {
    const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
    currentUserId = otherUser.id
    const event = createMockEvent({ params: { id: String(eventId) } })
    await expect(getMenuHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `npx vitest run server/api/__tests__/menu.test.ts`
Expected: FAIL — "Cannot find module … menu/index.get".

- [ ] **Step 3: Implement the handler.**

Create `server/api/events/[id]/menu/index.get.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'

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
      options: {
        orderBy: [asc(menuOptions.sortOrder), asc(menuOptions.id)],
      },
    },
  })

  return {
    courses: courses.map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: c.options.map(o => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }
})
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npx vitest run server/api/__tests__/menu.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit.**

```bash
git add server/api/events/[id]/menu/index.get.ts server/api/__tests__/menu.test.ts
git commit -m "feat(menu): GET /api/events/:id/menu"
```

### Task C2: PUT menu — diff & apply

**Files:**
- Create: `server/api/events/[id]/menu/index.put.ts`
- Test: extend `server/api/__tests__/menu.test.ts`

- [ ] **Step 1: Add failing tests.**

Append to `server/api/__tests__/menu.test.ts` inside the same file (new `describe` block):

```ts
const putMenuHandler = (await import('../../api/events/[id]/menu/index.put')).default

describe('PUT /api/events/:id/menu', () => {
  let eventId: number

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    currentUserId = user.id
    const evt = createTestEvent(testDb, user.id)
    eventId = evt.id
  })

  it('creates a menu from scratch', async () => {
    const body = {
      courses: [
        { name: 'First', sortOrder: 0, options: [{ name: 'Beef', sortOrder: 0 }, { name: 'Salmon', sortOrder: 1 }] },
        { name: 'Second', sortOrder: 1, options: [{ name: 'Cake', sortOrder: 0 }] },
      ],
    }
    const event = createMockEvent({ method: 'PUT', params: { id: String(eventId) }, body })
    const result = await putMenuHandler(event)
    expect(result.courses).toHaveLength(2)
    expect(result.courses[0].options).toHaveLength(2)
    expect(result.courses[0].options[0].id).toBeGreaterThan(0)
  })

  it('preserves option ids on rename so guest picks survive', async () => {
    // Initial save
    const initial = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [{ name: 'Beef', sortOrder: 0 }] }] },
    }))
    const optionId = initial.courses[0].options[0].id

    // Rename the option, supplying its id
    const renamed = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [{
          id: initial.courses[0].id,
          name: 'First',
          sortOrder: 0,
          options: [{ id: optionId, name: 'Beef Wellington', sortOrder: 0 }],
        }],
      },
    }))
    expect(renamed.courses[0].options[0].id).toBe(optionId)
    expect(renamed.courses[0].options[0].name).toBe('Beef Wellington')
  })

  it('rejects an empty courses array (400)', async () => {
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) }, body: { courses: [] },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a course with no options (400)', async () => {
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [] }] },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects when user does not own event (404)', async () => {
    const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
    currentUserId = otherUser.id
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [{ name: 'A', sortOrder: 0 }] }] },
    }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('removes a deleted course and cascades its options', async () => {
    const initial = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [
          { name: 'A', sortOrder: 0, options: [{ name: 'a1', sortOrder: 0 }] },
          { name: 'B', sortOrder: 1, options: [{ name: 'b1', sortOrder: 0 }] },
        ],
      },
    }))
    const keepCourseId = initial.courses[0].id
    const keepOptionId = initial.courses[0].options[0].id

    const after = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [
          { id: keepCourseId, name: 'A', sortOrder: 0, options: [{ id: keepOptionId, name: 'a1', sortOrder: 0 }] },
        ],
      },
    }))
    expect(after.courses).toHaveLength(1)

    // Verify physical deletion
    const allCourses = testDb.select().from(menuCourses).all()
    const allOptions = testDb.select().from(menuOptions).all()
    expect(allCourses).toHaveLength(1)
    expect(allOptions).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL ("module not found").**

Run: `npx vitest run server/api/__tests__/menu.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the PUT handler.**

Create `server/api/events/[id]/menu/index.put.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { validateMenuTree } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)
  const tree = validateMenuTree(body)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    columns: { id: true },
  })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  // Existing rows
  const existingCourses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    with: { options: true },
  })

  const incomingCourseIds = new Set(tree.courses.map(c => c.id).filter((x): x is number => typeof x === 'number'))
  const coursesToDelete = existingCourses.filter(c => !incomingCourseIds.has(c.id))

  // Delete dropped courses (cascades options + choices via FK)
  if (coursesToDelete.length) {
    await db.delete(menuCourses).where(inArray(menuCourses.id, coursesToDelete.map(c => c.id))).run()
  }

  // Upsert each remaining course + its options
  for (let ci = 0; ci < tree.courses.length; ci++) {
    const c = tree.courses[ci]
    let courseId: number
    if (c.id && existingCourses.some(ec => ec.id === c.id)) {
      await db.update(menuCourses)
        .set({ name: c.name.trim(), sortOrder: ci })
        .where(eq(menuCourses.id, c.id))
        .run()
      courseId = c.id
    } else {
      const [created] = await db.insert(menuCourses)
        .values({ eventId: id, name: c.name.trim(), sortOrder: ci })
        .returning()
      courseId = created.id
    }

    // Diff options for this course
    const existingForCourse = existingCourses.find(ec => ec.id === courseId)?.options ?? []
    const incomingOptionIds = new Set(c.options.map(o => o.id).filter((x): x is number => typeof x === 'number'))
    const optionsToDelete = existingForCourse.filter(o => !incomingOptionIds.has(o.id))
    if (optionsToDelete.length) {
      await db.delete(menuOptions).where(inArray(menuOptions.id, optionsToDelete.map(o => o.id))).run()
    }
    for (let oi = 0; oi < c.options.length; oi++) {
      const o = c.options[oi]
      if (o.id && existingForCourse.some(eo => eo.id === o.id)) {
        await db.update(menuOptions)
          .set({ name: o.name.trim(), sortOrder: oi })
          .where(eq(menuOptions.id, o.id))
          .run()
      } else {
        await db.insert(menuOptions)
          .values({ courseId, name: o.name.trim(), sortOrder: oi })
          .run()
      }
    }
  }

  // Re-fetch and return canonical response (mirrors GET shape)
  const refreshed = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    with: { options: true },
  })
  refreshed.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  for (const c of refreshed) c.options.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  return {
    courses: refreshed.map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: c.options.map(o => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }
})
```

Notes:
- We don't open a transaction explicitly because better-sqlite3 + Drizzle requires sync transactions for batched writes; the operations are still atomic per-statement, and a failure mid-loop leaves the event partially updated. If a transaction wrapper is desired later, refactor to sync mode — but that's out of scope for the spec, which doesn't require atomicity beyond "successful PUT replaces tree".
- `sortOrder` on the row is whatever index the client sent; we re-index to the array order for safety.

- [ ] **Step 4: Run tests, expect PASS.**

Run: `npx vitest run server/api/__tests__/menu.test.ts`
Expected: all menu tests pass.

- [ ] **Step 5: Commit.**

```bash
git add server/api/events/[id]/menu/index.put.ts server/api/__tests__/menu.test.ts
git commit -m "feat(menu): PUT /api/events/:id/menu with diff/upsert"
```

### Task C3: GET menu summary

**Files:**
- Create: `server/api/events/[id]/menu/summary.get.ts`
- Test: extend `server/api/__tests__/menu.test.ts`

- [ ] **Step 1: Add failing tests.**

Append to `server/api/__tests__/menu.test.ts`:

```ts
import { guests as guestsTable } from '../../db/schema'
const summaryHandler = (await import('../../api/events/[id]/menu/summary.get')).default

describe('GET /api/events/:id/menu/summary', () => {
  let eventId: number
  let courseId: number
  let beefId: number
  let salmonId: number

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    currentUserId = user.id
    const evt = createTestEvent(testDb, user.id)
    eventId = evt.id

    // Build a one-course menu via the PUT handler so we exercise it end-to-end.
    const saved = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [
        { name: 'Beef', sortOrder: 0 }, { name: 'Salmon', sortOrder: 1 },
      ] }] },
    }))
    courseId = saved.courses[0].id
    beefId = saved.courses[0].options[0].id
    salmonId = saved.courses[0].options[1].id
  })

  it('returns zero counts when no guests have picked', async () => {
    const result = await summaryHandler(createMockEvent({ params: { id: String(eventId) } }))
    expect(result.courses[0].options).toEqual([
      { id: beefId, name: 'Beef', count: 0 },
      { id: salmonId, name: 'Salmon', count: 0 },
    ])
    expect(result.courses[0].unpickedConfirmedGuests).toBe(0)
    expect(result.allergies.keys).toEqual({})
    expect(result.allergies.other).toEqual([])
  })

  it('aggregates choices and allergies for confirmed guests only', async () => {
    const g1 = createTestGuest(testDb, eventId, { token: 't1', rsvpStatus: 'confirmed' })
    const g2 = createTestGuest(testDb, eventId, { token: 't2', rsvpStatus: 'confirmed', plusOne: true })
    const g3 = createTestGuest(testDb, eventId, { token: 't3', rsvpStatus: 'declined' })

    // g1 picks Beef + has nut allergy
    testDb.insert((await import('../../db/schema')).guestMenuChoices).values({
      guestId: g1.id, courseId, optionId: beefId, forPlusOne: false,
    }).run()
    testDb.update(guestsTable).set({ allergies: JSON.stringify({ keys: ['nuts'], other: '' }) })
      .where((await import('drizzle-orm')).eq(guestsTable.id, g1.id)).run()

    // g2 picks Beef for self, Salmon for plus-one; plus-one has "sesame" other
    testDb.insert((await import('../../db/schema')).guestMenuChoices).values([
      { guestId: g2.id, courseId, optionId: beefId, forPlusOne: false },
      { guestId: g2.id, courseId, optionId: salmonId, forPlusOne: true },
    ]).run()
    testDb.update(guestsTable).set({
      plusOneAllergies: JSON.stringify({ keys: ['nuts'], other: 'sesame' }),
    }).where((await import('drizzle-orm')).eq(guestsTable.id, g2.id)).run()

    // g3 declined — should not contribute
    void g3

    const result = await summaryHandler(createMockEvent({ params: { id: String(eventId) } }))
    expect(result.courses[0].options.find((o: any) => o.id === beefId).count).toBe(2)
    expect(result.courses[0].options.find((o: any) => o.id === salmonId).count).toBe(1)
    expect(result.courses[0].unpickedConfirmedGuests).toBe(0) // g2 has both picks
    expect(result.allergies.keys.nuts).toBe(2)
    expect(result.allergies.other).toEqual([{ text: 'sesame', count: 1 }])
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL.**

Run: `npx vitest run server/api/__tests__/menu.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the summary handler.**

Create `server/api/events/[id]/menu/summary.get.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices, menuCourses, menuOptions } from '~/server/db/schema'
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

  const choices = confirmedGuests.length === 0 ? [] : await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, confirmedGuests.map(g => g.id)),
  })

  // Per-course aggregation
  const courseOut = courses.map(course => {
    const optCounts = new Map<number, number>()
    for (const opt of course.options) optCounts.set(opt.id, 0)

    // For "unpicked" we count confirmed guests (and their plus-ones if any) who have NO row for this course
    const haveSelfPick = new Set<number>()
    const haveP1Pick = new Set<number>()
    for (const ch of choices) {
      if (ch.courseId !== course.id) continue
      if (ch.optionId != null && optCounts.has(ch.optionId)) {
        optCounts.set(ch.optionId, optCounts.get(ch.optionId)! + 1)
      }
      if (ch.forPlusOne) haveP1Pick.add(ch.guestId)
      else haveSelfPick.add(ch.guestId)
    }
    let unpicked = 0
    for (const g of confirmedGuests) {
      if (!haveSelfPick.has(g.id)) unpicked++
      if (g.plusOne && !haveP1Pick.has(g.id)) unpicked++
    }
    return {
      id: course.id,
      name: course.name,
      options: course.options.map(o => ({ id: o.id, name: o.name, count: optCounts.get(o.id) ?? 0 })),
      unpickedConfirmedGuests: unpicked,
    }
  })

  // Allergies
  const keyCounts: Partial<Record<AllergenKey, number>> = {}
  const otherMap = new Map<string, number>()
  for (const g of confirmedGuests) {
    const own = parseAllergies(g.allergies)
    if (own) {
      for (const k of own.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
      if (own.other) otherMap.set(own.other, (otherMap.get(own.other) ?? 0) + 1)
    }
    if (g.plusOne) {
      const p1 = parseAllergies(g.plusOneAllergies)
      if (p1) {
        for (const k of p1.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
        if (p1.other) otherMap.set(p1.other, (otherMap.get(p1.other) ?? 0) + 1)
      }
    }
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

- [ ] **Step 4: Run tests, expect PASS.**

Run: `npx vitest run server/api/__tests__/menu.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit.**

```bash
git add server/api/events/[id]/menu/summary.get.ts server/api/__tests__/menu.test.ts
git commit -m "feat(menu): GET /api/events/:id/menu/summary"
```

---

## Phase D — RSVP API extensions

### Task D1: Extend GET /api/rsvp/:token

**Files:**
- Modify: `server/api/rsvp/[token].get.ts`
- Test: `server/api/__tests__/rsvp.test.ts` (extend existing)

- [ ] **Step 1: Add a failing test.**

Append a new `describe` block at the bottom of `rsvp.test.ts`:

```ts
import { menuCourses, menuOptions, guestMenuChoices, guests as guestsTable } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('GET /api/rsvp/:token — menu fields', () => {
  it('returns null menu when none exists', async () => {
    const event = createMockEvent({ params: { token: 'valid-token-123' } })
    const result = await getHandler(event)
    expect(result.menu).toBeNull()
    expect(result.choices).toEqual({})
    expect(result.allergies).toBeNull()
  })

  it('returns menu tree and existing choices', async () => {
    // Build a menu under the same event the guest belongs to.
    const evt = testDb.select().from((await import('../../db/schema')).events).all()[0]
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
})
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `npx vitest run server/api/__tests__/rsvp.test.ts`
Expected: failures on the new tests.

- [ ] **Step 3: Update the handler.**

Replace `server/api/rsvp/[token].get.ts` with:

```ts
import { db } from '~/server/db'
import { guests, menuCourses, menuOptions, guestMenuChoices } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

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
    allergies: parseAllergies(guest.allergies),
    plusOneAllergies: parseAllergies(guest.plusOneAllergies),
  }
})
```

- [ ] **Step 4: Run tests, expect PASS.**

Run: `npx vitest run server/api/__tests__/rsvp.test.ts`
Expected: all tests pass (including pre-existing ones, since the additive fields don't break old assertions only if they used `.toEqual`. Inspect any failure carefully — pre-existing tests use `.toEqual({...})`, so update them to `.toMatchObject({...})` if needed.

- [ ] **Step 5: Adjust pre-existing assertions if necessary.**

If the existing test "returns guest RSVP data" fails because the response now has extra fields, change its assertion from `.toEqual` to `.toMatchObject`. Verify all green.

- [ ] **Step 6: Commit.**

```bash
git add server/api/rsvp/[token].get.ts server/api/__tests__/rsvp.test.ts
git commit -m "feat(rsvp): include menu tree and choices in GET response"
```

### Task D2: Extend POST /api/rsvp/:token

**Files:**
- Modify: `server/api/rsvp/[token].post.ts`
- Test: `server/api/__tests__/rsvp.test.ts` (extend)

- [ ] **Step 1: Add failing tests.**

Append to `rsvp.test.ts`:

```ts
describe('POST /api/rsvp/:token — menu picks', () => {
  let course1: any, course2: any, beef: any, salmon: any, cake: any

  beforeEach(async () => {
    const { events: eventsTable } = await import('../../db/schema')
    const evt = testDb.select().from(eventsTable).all()[0]
    ;[course1] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'First', sortOrder: 0 }).returning().all()
    ;[course2] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Dessert', sortOrder: 1 }).returning().all()
    ;[beef] = testDb.insert(menuOptions).values({ courseId: course1.id, name: 'Beef', sortOrder: 0 }).returning().all()
    ;[salmon] = testDb.insert(menuOptions).values({ courseId: course1.id, name: 'Salmon', sortOrder: 1 }).returning().all()
    ;[cake] = testDb.insert(menuOptions).values({ courseId: course2.id, name: 'Cake', sortOrder: 0 }).returning().all()
  })

  it('rejects when a confirming guest is missing a course pick (400)', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: { rsvpStatus: 'confirmed', plusOne: false, menuChoices: { [course1.id]: beef.id } },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('saves menu picks and allergies', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        allergies: { keys: ['nuts'], other: 'sesame' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.choices).toEqual({ [course1.id]: beef.id, [course2.id]: cake.id })
    expect(get.allergies).toEqual({ keys: ['nuts'], other: 'sesame' })
  })

  it('requires plus-one picks for every course when plus-one is true', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        plusOneMenuChoices: { [course1.id]: salmon.id }, // missing course2
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('discards plus-one fields when plusOne is false', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        plusOneMenuChoices: { [course1.id]: salmon.id },
        plusOneAllergies: { keys: ['dairy'], other: '' },
      },
    }))
    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.plusOneChoices).toEqual({})
    expect(get.plusOneAllergies).toBeNull()
  })

  it('ignores menu fields when declining', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'declined',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        allergies: { keys: ['nuts'], other: '' },
      },
    }))
    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.choices).toEqual({})
    expect(get.allergies).toBeNull()
  })

  it('rejects an optionId that does not belong to the named course (400)', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        menuChoices: { [course1.id]: cake.id, [course2.id]: cake.id }, // cake belongs to course2 not course1
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL.**

Run: `npx vitest run server/api/__tests__/rsvp.test.ts`
Expected: failures on new tests.

- [ ] **Step 3: Update the handler.**

Replace `server/api/rsvp/[token].post.ts` with:

```ts
import { db } from '~/server/db'
import { guests, menuCourses, menuOptions, guestMenuChoices } from '~/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
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
  if (isConfirming) {
    selfAllergies = validateAllergies(allergies)
    if (wantsPlusOne) p1AllergiesParsed = validateAllergies(plusOneAllergies)
  }

  // Persist guest row
  await db.update(guests).set({
    rsvpStatus,
    plusOne: wantsPlusOne,
    plusOneName: wantsPlusOne ? plusOneName : null,
    allergies: isConfirming ? serializeAllergies(selfAllergies) : null,
    plusOneAllergies: wantsPlusOne ? serializeAllergies(p1AllergiesParsed) : null,
  }).where(eq(guests.token, token)).run()

  // Replace this guest's choice rows
  await db.delete(guestMenuChoices).where(eq(guestMenuChoices.guestId, guest.id)).run()
  if (isConfirming && hasMenu) {
    const rows = [
      ...selfPicks.map(p => ({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, forPlusOne: false })),
      ...(wantsPlusOne ? p1Picks.map(p => ({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, forPlusOne: true })) : []),
    ]
    if (rows.length) await db.insert(guestMenuChoices).values(rows).run()
  }

  return { success: true, rsvpStatus }
})
```

- [ ] **Step 4: Run tests, expect PASS.**

Run: `npx vitest run server/api/__tests__/rsvp.test.ts`
Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add server/api/rsvp/[token].post.ts server/api/__tests__/rsvp.test.ts
git commit -m "feat(rsvp): validate and persist menu picks + allergies"
```

---

## Phase E — Wizard event-creation accepts an optional menu

### Task E1: Extend POST /api/events to persist a provided menu

**Files:**
- Modify: `server/api/events/index.post.ts`
- Test: `server/api/__tests__/events.test.ts`

- [ ] **Step 1: Add a failing test.**

Append a new test in `events.test.ts` (or create a new `describe` block at the bottom):

```ts
it('persists an optional menu when provided in the body', async () => {
  // existing test setup creates user + auth mock; replicate that pattern
  const event = createMockEvent({
    method: 'POST',
    body: {
      title: 'Wedding', coupleName1: 'A', coupleName2: 'B',
      date: '2026-09-01', venue: 'V', venueAddress: '1 St',
      menu: { courses: [{ name: 'First', sortOrder: 0, options: [{ name: 'Beef', sortOrder: 0 }] }] },
    },
  })
  const created = await postHandler(event)
  expect(created.id).toBeGreaterThan(0)

  const courses = testDb.select().from(menuCourses).where((await import('drizzle-orm')).eq(menuCourses.eventId, created.id)).all()
  expect(courses).toHaveLength(1)
  const opts = testDb.select().from(menuOptions).where((await import('drizzle-orm')).eq(menuOptions.courseId, courses[0].id)).all()
  expect(opts).toHaveLength(1)
})
```

(Adapt imports / setup to match the existing `events.test.ts` style.)

- [ ] **Step 2: Run, expect FAIL.**

Run: `npx vitest run server/api/__tests__/events.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modify `index.post.ts` to accept and persist the menu.**

After the `db.insert(events)…returning()` block, add:

```ts
  if (body.menu) {
    const { validateMenuTree } = await import('~/server/utils/menu-validation')
    const tree = validateMenuTree(body.menu)
    const { menuCourses, menuOptions } = await import('~/server/db/schema')
    for (let ci = 0; ci < tree.courses.length; ci++) {
      const c = tree.courses[ci]
      const [createdCourse] = await db.insert(menuCourses).values({
        eventId: newEvent.id, name: c.name.trim(), sortOrder: ci,
      }).returning()
      for (let oi = 0; oi < c.options.length; oi++) {
        const o = c.options[oi]
        await db.insert(menuOptions).values({
          courseId: createdCourse.id, name: o.name.trim(), sortOrder: oi,
        }).run()
      }
    }
  }
```

(Plain top-of-file imports also work; dynamic imports keep the diff minimal.)

- [ ] **Step 4: Run tests, expect PASS.**

Run: `npx vitest run server/api/__tests__/events.test.ts`
Expected: green.

- [ ] **Step 5: Commit.**

```bash
git add server/api/events/index.post.ts server/api/__tests__/events.test.ts
git commit -m "feat(events): accept optional menu on event creation"
```

---

## Phase F — Couple-side UI

### Task F1: AllergyPicker component (shared across couple + guest)

**Files:**
- Create: `components/menu/AllergyPicker.vue`

- [ ] **Step 1: Create the component.**

```vue
<!-- components/menu/AllergyPicker.vue -->
<script setup lang="ts">
import { ALLERGEN_KEYS, type AllergenKey, type Allergies, ALLERGY_OTHER_MAX_LENGTH } from '~/shared/menu'

const props = defineProps<{ modelValue: Allergies | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Allergies | null): void }>()

const keys = computed<AllergenKey[]>({
  get: () => props.modelValue?.keys ?? [],
  set: (v) => commit({ keys: v, other: props.modelValue?.other ?? '' }),
})
const other = computed<string>({
  get: () => props.modelValue?.other ?? '',
  set: (v) => commit({ keys: props.modelValue?.keys ?? [], other: v }),
})

function commit(next: Allergies) {
  if (next.keys.length === 0 && next.other.trim() === '') emit('update:modelValue', null)
  else emit('update:modelValue', { keys: next.keys, other: next.other.slice(0, ALLERGY_OTHER_MAX_LENGTH) })
}

function toggleKey(k: AllergenKey) {
  const cur = keys.value
  keys.value = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]
}
</script>

<template>
  <fieldset class="space-y-3">
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <label v-for="k in ALLERGEN_KEYS" :key="k"
        class="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm"
        :class="keys.includes(k) ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
        <input type="checkbox" :checked="keys.includes(k)" @change="toggleKey(k)" class="rounded text-champagne-600" />
        <span>{{ $t(`allergies.${k}`) }}</span>
      </label>
    </div>
    <input v-model="other" type="text" :maxlength="ALLERGY_OTHER_MAX_LENGTH"
      :placeholder="$t('allergies.otherPlaceholder')"
      class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500" />
  </fieldset>
</template>
```

- [ ] **Step 2: Commit.**

```bash
git add components/menu/AllergyPicker.vue
git commit -m "feat(menu): allergy picker component"
```

### Task F2: MenuBuilder component

**Files:**
- Create: `components/menu/MenuBuilder.vue`

- [ ] **Step 1: Create the component.**

```vue
<!-- components/menu/MenuBuilder.vue -->
<script setup lang="ts">
import type { MenuTreeInput, MenuCourseInput, MenuOptionInput } from '~/shared/menu'

const props = defineProps<{ modelValue: MenuTreeInput }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: MenuTreeInput): void }>()

const courses = computed<MenuCourseInput[]>({
  get: () => props.modelValue.courses,
  set: (v) => emit('update:modelValue', { courses: v }),
})

function addCourse() {
  courses.value = [...courses.value, { name: '', sortOrder: courses.value.length, options: [{ name: '', sortOrder: 0 }] }]
}
function removeCourse(idx: number) {
  courses.value = courses.value.filter((_, i) => i !== idx)
}
function moveCourse(idx: number, dir: -1 | 1) {
  const next = [...courses.value]
  const j = idx + dir
  if (j < 0 || j >= next.length) return
  ;[next[idx], next[j]] = [next[j], next[idx]]
  courses.value = next
}
function addOption(ci: number) {
  const next = [...courses.value]
  next[ci] = { ...next[ci], options: [...next[ci].options, { name: '', sortOrder: next[ci].options.length }] }
  courses.value = next
}
function removeOption(ci: number, oi: number) {
  const next = [...courses.value]
  next[ci] = { ...next[ci], options: next[ci].options.filter((_, i) => i !== oi) }
  courses.value = next
}
function updateCourseName(ci: number, value: string) {
  const next = [...courses.value]
  next[ci] = { ...next[ci], name: value }
  courses.value = next
}
function updateOptionName(ci: number, oi: number, value: string) {
  const next = [...courses.value]
  const opts = [...next[ci].options]
  opts[oi] = { ...opts[oi], name: value }
  next[ci] = { ...next[ci], options: opts }
  courses.value = next
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="courses.length === 0" class="rounded-2xl border border-dashed border-charcoal-200 p-8 text-center">
      <p class="text-charcoal-300 mb-4">{{ $t('menu.builder.empty') }}</p>
      <button type="button" @click="addCourse"
        class="px-4 py-2 bg-champagne-600 text-white rounded-lg hover:bg-champagne-700">
        {{ $t('menu.builder.addCourse') }}
      </button>
    </div>

    <div v-for="(c, ci) in courses" :key="ci"
      class="rounded-2xl border border-charcoal-100 p-5 bg-white">
      <div class="flex items-start gap-3 mb-4">
        <input type="text" :value="c.name" @input="updateCourseName(ci, ($event.target as HTMLInputElement).value)"
          :placeholder="$t('menu.builder.coursePlaceholder')"
          class="flex-1 px-3 py-2 border border-charcoal-200 rounded-lg font-medium" />
        <button type="button" @click="moveCourse(ci, -1)" :disabled="ci === 0" class="px-2 disabled:opacity-30" aria-label="Move up">↑</button>
        <button type="button" @click="moveCourse(ci, 1)" :disabled="ci === courses.length - 1" class="px-2 disabled:opacity-30" aria-label="Move down">↓</button>
        <button type="button" @click="removeCourse(ci)" class="px-2 text-red-500" :aria-label="$t('common.remove')">×</button>
      </div>
      <div class="space-y-2 ml-4">
        <div v-for="(o, oi) in c.options" :key="oi" class="flex items-center gap-2">
          <input type="text" :value="o.name" @input="updateOptionName(ci, oi, ($event.target as HTMLInputElement).value)"
            :placeholder="$t('menu.builder.optionPlaceholder')"
            class="flex-1 px-3 py-2 border border-charcoal-200 rounded-lg text-sm" />
          <button type="button" @click="removeOption(ci, oi)" :disabled="c.options.length === 1"
            class="px-2 text-red-500 disabled:opacity-30" :aria-label="$t('common.remove')">×</button>
        </div>
        <button type="button" @click="addOption(ci)"
          class="text-sm text-champagne-700 hover:underline">+ {{ $t('menu.builder.addOption') }}</button>
      </div>
    </div>

    <button v-if="courses.length > 0" type="button" @click="addCourse"
      class="px-4 py-2 border border-charcoal-200 rounded-lg hover:bg-ivory-50">
      + {{ $t('menu.builder.addCourse') }}
    </button>
  </div>
</template>
```

- [ ] **Step 2: Commit.**

```bash
git add components/menu/MenuBuilder.vue
git commit -m "feat(menu): MenuBuilder component"
```

### Task F3: MenuSummary component

**Files:**
- Create: `components/menu/MenuSummary.vue`

- [ ] **Step 1: Create the component.**

```vue
<!-- components/menu/MenuSummary.vue -->
<script setup lang="ts">
import { ALLERGEN_KEYS } from '~/shared/menu'

defineProps<{
  summary: {
    courses: Array<{ id: number; name: string; options: Array<{ id: number; name: string; count: number }>; unpickedConfirmedGuests: number }>
    allergies: { keys: Record<string, number>; other: Array<{ text: string; count: number }> }
  }
  eventId: number | string
}>()

const localePath = useLocalePath()

function maxCount(opts: Array<{ count: number }>) {
  return Math.max(1, ...opts.map(o => o.count))
}
</script>

<template>
  <div class="space-y-6">
    <div v-for="course in summary.courses" :key="course.id" class="bg-white rounded-2xl border border-charcoal-100 p-5">
      <h3 class="font-medium text-charcoal-900 mb-4">{{ course.name }}</h3>
      <div class="space-y-2">
        <div v-for="o in course.options" :key="o.id" class="flex items-center gap-3">
          <NuxtLink :to="localePath(`/dashboard/events/${eventId}/guests?menuOption=${o.id}`)"
            class="text-sm w-40 truncate hover:underline">{{ o.name }}</NuxtLink>
          <div class="flex-1 h-2 bg-ivory-100 rounded-full overflow-hidden">
            <div class="h-full bg-champagne-500" :style="{ width: `${(o.count / maxCount(course.options)) * 100}%` }" />
          </div>
          <span class="text-sm text-charcoal-500 w-8 text-right">{{ o.count }}</span>
        </div>
        <div v-if="course.unpickedConfirmedGuests > 0" class="text-sm text-charcoal-300 pt-2">
          {{ $t('menu.summary.noChoiceYet') }}: {{ course.unpickedConfirmedGuests }}
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-charcoal-100 p-5">
      <h3 class="font-medium text-charcoal-900 mb-4">{{ $t('menu.summary.allergies.title') }}</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <NuxtLink v-for="k in ALLERGEN_KEYS" :key="k"
          :to="localePath(`/dashboard/events/${eventId}/guests?allergy=${k}`)"
          class="flex items-center justify-between px-3 py-2 border border-charcoal-100 rounded-lg text-sm hover:bg-ivory-50">
          <span>{{ $t(`allergies.${k}`) }}</span>
          <span class="text-charcoal-300">{{ summary.allergies.keys[k] ?? 0 }}</span>
        </NuxtLink>
      </div>
      <div v-if="summary.allergies.other.length > 0" class="mt-4 space-y-1 text-sm">
        <div v-for="(o, i) in summary.allergies.other" :key="i" class="flex justify-between">
          <span class="italic">"{{ o.text }}"</span>
          <span class="text-charcoal-300">{{ o.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit.**

```bash
git add components/menu/MenuSummary.vue
git commit -m "feat(menu): MenuSummary component"
```

### Task F4: Menu page (Menu tab)

**Files:**
- Create: `pages/dashboard/events/[id]/menu.vue`

- [ ] **Step 1: Create the page.**

```vue
<!-- pages/dashboard/events/[id]/menu.vue -->
<script setup lang="ts">
import type { MenuTreeInput } from '~/shared/menu'
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const eventId = route.params.id as string

const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('menu.tab.label'), to: `/dashboard/events/${eventId}/menu` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])

const { data: menu, refresh: refreshMenu } = await useFetch<{ courses: any[] }>(`/api/events/${eventId}/menu`)
const { data: summary, refresh: refreshSummary } = await useFetch<any>(`/api/events/${eventId}/menu/summary`)

const draft = ref<MenuTreeInput>({ courses: [] })
function syncDraftFromMenu() {
  draft.value = { courses: (menu.value?.courses ?? []).map(c => ({
    id: c.id, name: c.name, sortOrder: c.sortOrder,
    options: c.options.map((o: any) => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
  })) }
}
syncDraftFromMenu()
watch(menu, syncDraftFromMenu)

const dirty = ref(false)
watch(draft, () => { dirty.value = true }, { deep: true })

const saving = ref(false)
const saveError = ref('')

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/menu`, { method: 'PUT', body: draft.value })
    await Promise.all([refreshMenu(), refreshSummary()])
    dirty.value = false
  } catch (e: any) {
    saveError.value = e.data?.statusMessage || t('errors.somethingWentWrong')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-6 py-8 space-y-8">
    <DashboardTabNav :tabs="tabs" />

    <section>
      <h2 class="text-xl font-serif text-charcoal-900 mb-4">{{ $t('menu.builder.title') }}</h2>
      <MenuMenuBuilder v-model="draft" />
      <div class="flex items-center gap-3 mt-4">
        <button type="button" :disabled="!dirty || saving" @click="save"
          class="px-5 py-2 bg-champagne-600 text-white rounded-lg disabled:opacity-50">
          {{ saving ? $t('common.saving') : $t('common.save') }}
        </button>
        <span v-if="dirty" class="text-sm text-charcoal-300">{{ $t('common.unsavedChanges') }}</span>
        <span v-if="saveError" class="text-sm text-red-600">{{ saveError }}</span>
      </div>
    </section>

    <section v-if="summary && summary.courses.length > 0">
      <h2 class="text-xl font-serif text-charcoal-900 mb-4">{{ $t('menu.summary.title') }}</h2>
      <MenuMenuSummary :summary="summary" :event-id="eventId" />
    </section>
  </div>
</template>
```

Notes on auto-imports:
- Nuxt's auto-import flattens component paths. `components/menu/MenuBuilder.vue` becomes `<MenuMenuBuilder>` (path-prefixed). If existing components in `components/<dir>/` are imported as `<DirComponent>`, follow that. If they're explicitly imported, swap to `import` statements at the top.
- Confirm by running the dev server and looking at the rendered tree. Rename components if the prefix collides.

- [ ] **Step 2: Verify the page mounts in the dev server.**

Run: `npm run dev`
Open: `http://localhost:3000/dashboard/events/<some-id>/menu`
Expected: empty-state page renders, "Add course" works, save persists, summary appears once at least one guest has confirmed with picks.

- [ ] **Step 3: Commit.**

```bash
git add pages/dashboard/events/[id]/menu.vue
git commit -m "feat(menu): event Menu tab with builder + summary"
```

### Task F5: Add the Menu tab to all sibling pages' tab nav

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`
- Modify: `pages/dashboard/events/[id]/guests.vue`
- Modify: `pages/dashboard/events/[id]/settings.vue`
- Modify: `pages/dashboard/events/[id]/template.vue` (only if it has its own `tabs` computed)

- [ ] **Step 1: In each file, add the Menu entry to the existing `tabs` `computed`.**

Find the existing block like:

```ts
const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])
```

And insert a new entry for Menu before Settings:

```ts
  { label: t('menu.tab.label'), to: `/dashboard/events/${eventId}/menu` },
```

- [ ] **Step 2: Run dev server and click each tab to ensure routing is intact.**

Expected: Menu tab visible on every event sub-page; clicking it lands on `/dashboard/events/<id>/menu`.

- [ ] **Step 3: Commit.**

```bash
git add pages/dashboard/events/[id]/
git commit -m "feat(menu): expose Menu tab in event sub-page navigation"
```

---

## Phase G — Wizard integration

### Task G1: Opt-in Menu step on event creation

**Files:**
- Modify: `pages/dashboard/events/new.vue`

- [ ] **Step 1: Read the file to identify step 1 ("Event details") and the wizard state location.**

Look for the step definitions and the form payload object (likely `form` or similar reactive). The handler for "next" / final submit is where we'll forward the menu.

- [ ] **Step 2: Add a checkbox + inline `MenuBuilder` to step 1.**

Inside step 1's template, after the existing fields and before the step's "Next" button:

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
    <MenuMenuBuilder v-model="form.menu" />
  </div>
</div>
```

In the script setup, extend the wizard reactive state:

```ts
import type { MenuTreeInput } from '~/shared/menu'
// inside the existing reactive form definition:
//   offerMenu: false,
//   menu: { courses: [] } as MenuTreeInput,
```

When the user toggles `offerMenu` from true→false, clear the menu. Add a watcher:

```ts
watch(() => form.offerMenu, (v) => { if (!v) form.menu = { courses: [] } })
```

- [ ] **Step 3: When submitting the wizard (the existing `POST /api/events`), include `menu` only if `offerMenu` is true and the menu has at least one valid course.**

In the existing submit handler, before the `$fetch`:

```ts
const payload: Record<string, unknown> = { /* existing fields */ }
if (form.offerMenu && form.menu.courses.length > 0
    && form.menu.courses.every(c => c.name.trim() && c.options.length > 0 && c.options.every(o => o.name.trim()))) {
  payload.menu = form.menu
}
```

- [ ] **Step 4: Smoke-test in the dev server.**

Open the wizard, tick the checkbox, add 2 courses with options, finish the wizard, then go to the event's Menu tab and verify the menu was persisted.

- [ ] **Step 5: Commit.**

```bash
git add pages/dashboard/events/new.vue
git commit -m "feat(menu): opt-in menu builder in event creation wizard"
```

---

## Phase H — Couple-side overview & guest list extras

### Task H1: Overview page Menu card

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`

- [ ] **Step 1: Fetch the menu summary on the overview page.**

Near the existing `useFetch(`/api/events/${eventId}`)`:

```ts
const { data: menuSummary } = await useFetch<any>(`/api/events/${eventId}/menu/summary`)
const hasMenu = computed(() => (menuSummary.value?.courses?.length ?? 0) > 0)
const totalPickedGuests = computed(() => {
  const s = menuSummary.value
  if (!s) return 0
  // count = sum of first course's option counts (every confirmed guest must pick every course, so first is representative)
  const first = s.courses[0]
  return first ? first.options.reduce((acc: number, o: any) => acc + o.count, 0) : 0
})
```

- [ ] **Step 2: Add a card to the template.**

Place near the other overview cards:

```vue
<div class="bg-white rounded-2xl border border-charcoal-100 p-5">
  <h3 class="font-medium text-charcoal-900 mb-2">{{ $t('menu.tab.label') }}</h3>
  <div v-if="!hasMenu">
    <p class="text-sm text-charcoal-300 mb-3">{{ $t('menu.builder.empty') }}</p>
    <NuxtLink :to="localePath(`/dashboard/events/${eventId}/menu`)" class="text-sm text-champagne-700 hover:underline">
      {{ $t('menu.wizard.offerMenu') }} →
    </NuxtLink>
  </div>
  <div v-else>
    <p class="text-sm text-charcoal-500">
      {{ $t('menu.summary.coursesAndPicked', { courses: menuSummary.courses.length, picked: totalPickedGuests }) }}
    </p>
    <NuxtLink :to="localePath(`/dashboard/events/${eventId}/menu`)" class="text-sm text-champagne-700 hover:underline">
      {{ $t('menu.summary.viewGuests') }} →
    </NuxtLink>
  </div>
</div>
```

- [ ] **Step 3: Add the new i18n key `menu.summary.coursesAndPicked` (will be added centrally in Phase J — keep in mind).**

- [ ] **Step 4: Verify in dev server.**

Expected: card shows "no menu" state for events without menu; once a menu is configured, shows the summary line.

- [ ] **Step 5: Commit.**

```bash
git add pages/dashboard/events/[id]/index.vue
git commit -m "feat(menu): overview Menu card"
```

### Task H2: Guests page expandable per-guest detail + filter from query string

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`
- Modify (likely): `server/api/events/[id]/guests/index.get.ts` to include menu choices and allergies

- [ ] **Step 1: Inspect the current guests endpoint.**

Read `server/api/events/[id]/guests/index.get.ts`. The endpoint must include each guest's choices + allergies for the page to render them.

- [ ] **Step 2: Extend the endpoint to include menu data.**

For each guest, attach `menuChoices` (`{ courseId: optionId }`), `plusOneMenuChoices`, parsed `allergies`, parsed `plusOneAllergies`. Use the same `parseAllergies` helper. Pull all `guestMenuChoices` for the event in one query and group by guestId in JS to avoid N+1.

- [ ] **Step 3: In the guests page, fetch the menu so option ids can be mapped to names.**

Near the top of the script setup, alongside the existing `useFetch` calls:

```ts
const { data: menu } = await useFetch<{ courses: Array<{ id: number; name: string; options: Array<{ id: number; name: string }> }> }>(
  `/api/events/${eventId}/menu`,
)
```

Then add an expandable row. For each guest in the existing list rendering, add a click-to-expand block:

```vue
<button type="button" @click="expandedId = expandedId === g.id ? null : g.id"
  class="text-sm text-charcoal-300 hover:text-charcoal-700">
  {{ expandedId === g.id ? '▴' : '▾' }} {{ $t('guests.details') }}
</button>
<div v-if="expandedId === g.id" class="mt-3 pl-4 border-l-2 border-charcoal-100 space-y-2 text-sm">
  <div v-for="course in menu?.courses ?? []" :key="course.id">
    <span class="text-charcoal-300">{{ course.name }}:</span>
    <span class="ml-1">{{ optionName(course.id, g.menuChoices?.[course.id]) ?? '—' }}</span>
  </div>
  <div v-if="g.allergies">
    <span class="text-charcoal-300">{{ $t('rsvp.allergies.title') }}:</span>
    <span class="ml-1">{{ formatAllergies(g.allergies) }}</span>
  </div>
  <!-- mirror for plus-one if g.plusOne -->
</div>
```

Add helpers in script setup:

```ts
const expandedId = ref<number | null>(null)
function optionName(courseId: number, optionId: number | undefined) {
  if (!optionId) return null
  const course = (menu.value?.courses ?? []).find((c: any) => c.id === courseId)
  const opt = course?.options.find((o: any) => o.id === optionId)
  return opt?.name ?? null
}
function formatAllergies(a: { keys: string[]; other: string }) {
  const labels = a.keys.map(k => t(`allergies.${k}`))
  if (a.other) labels.push(`"${a.other}"`)
  return labels.join(', ')
}
```

- [ ] **Step 4: Add filter via query params.**

Read `route.query.menuOption` and `route.query.allergy` and filter the rendered guest list when present. Show a small "filter active" pill at the top with a "clear" link.

```ts
const filteredGuests = computed(() => {
  const list = guests.value ?? []
  const opt = route.query.menuOption ? Number(route.query.menuOption) : null
  const allergy = (route.query.allergy as string) || null
  return list.filter((g: any) => {
    if (opt) {
      const picksHere = Object.values(g.menuChoices ?? {}).includes(opt)
        || Object.values(g.plusOneMenuChoices ?? {}).includes(opt)
      if (!picksHere) return false
    }
    if (allergy) {
      const has = (g.allergies?.keys ?? []).includes(allergy)
        || (g.plusOneAllergies?.keys ?? []).includes(allergy)
      if (!has) return false
    }
    return true
  })
})
```

Render `filteredGuests` instead of `guests` in the list block.

- [ ] **Step 5: Smoke-test.**

Set up an event with a menu, accept a few guests with different picks, then click an option count from the Menu tab; verify the Guests tab opens with only those guests visible.

- [ ] **Step 6: Commit.**

```bash
git add pages/dashboard/events/[id]/guests.vue server/api/events/[id]/guests/
git commit -m "feat(menu): per-guest detail + filters on guests tab"
```

---

## Phase I — Guest invitation page

### Task I1: Render menu and allergy sections, validate before submit

**Files:**
- Modify: `pages/i/[slug].vue`

- [ ] **Step 1: Extend reactive state.**

Inside `<script setup>`, alongside the existing `rsvpForm`:

```ts
import type { Allergies, MenuTree } from '~/shared/menu'

const menuChoices = ref<Record<number, number | null>>({})
const plusOneMenuChoices = ref<Record<number, number | null>>({})
const allergies = ref<Allergies | null>(null)
const plusOneAllergies = ref<Allergies | null>(null)
```

In the existing `watch(guestData, …)` block, extend:

```ts
if (data.menu) {
  for (const c of data.menu.courses) {
    if (!(c.id in menuChoices.value)) menuChoices.value[c.id] = data.choices?.[c.id] ?? null
    if (!(c.id in plusOneMenuChoices.value)) plusOneMenuChoices.value[c.id] = data.plusOneChoices?.[c.id] ?? null
  }
  allergies.value = data.allergies ?? null
  plusOneAllergies.value = data.plusOneAllergies ?? null
}
```

- [ ] **Step 2: Add the menu + allergy sections in the template, only when accepting.**

Insert inside the existing `<div v-if="rsvpForm.rsvpStatus === 'confirmed'" …>` block, **after** the plus-one inputs:

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

  <fieldset v-if="rsvpForm.plusOne" v-for="course in guestData.menu.courses" :key="`p1-${course.id}`" class="text-left">
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

- [ ] **Step 3: Update submit validation + payload.**

Replace the existing `submitRsvp` body construction with:

```ts
const canSubmit = computed(() => {
  if (!rsvpForm.rsvpStatus) return false
  if (rsvpForm.rsvpStatus !== 'confirmed') return true
  const m = guestData.value?.menu
  if (!m) return true
  for (const c of m.courses) {
    if (!menuChoices.value[c.id]) return false
    if (rsvpForm.plusOne && !plusOneMenuChoices.value[c.id]) return false
  }
  return true
})

async function submitRsvp() {
  if (!guestToken.value || !canSubmit.value) return
  rsvpSubmitting.value = true
  rsvpError.value = ''
  try {
    await $fetch(`/api/rsvp/${guestToken.value}`, {
      method: 'POST',
      body: {
        rsvpStatus: rsvpForm.rsvpStatus,
        plusOne: rsvpForm.plusOne,
        plusOneName: rsvpForm.plusOneName,
        menuChoices: menuChoices.value,
        plusOneMenuChoices: rsvpForm.plusOne ? plusOneMenuChoices.value : undefined,
        allergies: allergies.value,
        plusOneAllergies: rsvpForm.plusOne ? plusOneAllergies.value : undefined,
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

Update the submit button's `:disabled` to use `canSubmit`:

```vue
:disabled="!canSubmit || rsvpSubmitting"
```

- [ ] **Step 4: Smoke-test.**

End-to-end: configure a 2-course menu on an event, send yourself an invite, accept with picks + allergies, return to the dashboard, and verify everything reflects on the Menu tab and Guests tab.

- [ ] **Step 5: Commit.**

```bash
git add pages/i/[slug].vue
git commit -m "feat(menu): guest-side menu picks and allergy fields on RSVP"
```

---

## Phase J — i18n

### Task J1: Add EN + ES translation keys

**Files:**
- Modify: `i18n/locales/en.json`
- Modify: `i18n/locales/es.json`

- [ ] **Step 1: Add keys to `en.json`.**

```json
"menu": {
  "tab": { "label": "Menu" },
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
    "allergies": { "title": "Allergies & dietary restrictions" }
  },
  "wizard": {
    "offerMenu": "Offer a menu for your guests",
    "offerMenuHint": "You can do this later"
  }
},
"allergies": {
  "nuts": "Nuts",
  "gluten": "Gluten",
  "dairy": "Dairy",
  "shellfish": "Shellfish",
  "eggs": "Eggs",
  "vegetarian": "Vegetarian",
  "vegan": "Vegan",
  "other": "Other",
  "otherPlaceholder": "Anything else?"
},
"rsvp": {
  "menu": {
    "title": "Choose your menu",
    "plusOneTitle": "Your guest's menu",
    "required": "Please choose an option"
  },
  "allergies": {
    "title": "Allergies & dietary",
    "plusOneTitle": "Your guest's allergies & dietary"
  }
}
```

If `rsvp.*` already exists, merge — do not replace. Same for `eventDetail`, `common.save`, `common.saving`, `common.unsavedChanges`, `common.remove`, `guests.details` — verify each exists; if any are missing, add them with appropriate copy.

- [ ] **Step 2: Add Spanish translations to `es.json`.**

Mirror the structure. Sample translations:

```json
"menu": {
  "tab": { "label": "Menú" },
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
    "allergies": { "title": "Alergias y restricciones" }
  },
  "wizard": {
    "offerMenu": "Ofrecer un menú a tus invitados",
    "offerMenuHint": "Puedes hacerlo más tarde"
  }
},
"allergies": {
  "nuts": "Frutos secos",
  "gluten": "Gluten",
  "dairy": "Lácteos",
  "shellfish": "Marisco",
  "eggs": "Huevo",
  "vegetarian": "Vegetariano",
  "vegan": "Vegano",
  "other": "Otra",
  "otherPlaceholder": "¿Algo más?"
},
"rsvp": {
  "menu": {
    "title": "Elige tu menú",
    "plusOneTitle": "El menú de tu acompañante",
    "required": "Elige una opción"
  },
  "allergies": {
    "title": "Alergias y dieta",
    "plusOneTitle": "Alergias y dieta de tu acompañante"
  }
}
```

- [ ] **Step 3: Verify in the dev server with locale switching.**

Switch between English and Spanish on the Menu tab and on the public invitation page. All new strings should render correctly in both languages.

- [ ] **Step 4: Commit.**

```bash
git add i18n/locales/en.json i18n/locales/es.json
git commit -m "i18n(menu): add EN/ES translations for menu and allergies"
```

---

## Phase K — Final verification

### Task K1: Full test suite

- [ ] **Step 1: Run all tests.**

Run: `npm test`
Expected: all tests pass. If any pre-existing test broke from the additive shape change to the RSVP GET response (extra fields), update the assertion.

- [ ] **Step 2: Type-check.**

Run: `npx nuxi typecheck` (or whichever command the project uses; if unavailable, skip).
Expected: no new type errors.

### Task K2: Manual end-to-end smoke test

- [ ] **Step 1: Run the dev server.**

Run: `npm run dev`

- [ ] **Step 2: Walk these flows:**

1. **Wizard with menu**: create a new event, tick "Offer a menu", add 2 courses with 2 options each, finish. Open the event's Menu tab — verify the menu is there.
2. **Wizard without menu**: create another event without ticking — Menu tab shows the empty state.
3. **Add menu later**: in event #2, go to Menu tab, build a menu, save. Refresh — persisted.
4. **Guest accepts with menu**: add a test guest with your email; send the invite; accept with picks; open Menu tab — counts go up.
5. **Guest with plus-one**: same flow but tick the plus-one — verify two sets of choices, both persist.
6. **Decline path**: another guest declines — no picks recorded.
7. **Edit menu after RSVPs**: rename an option (keep id) — guest pick survives. Delete a different option — confirm warning appears, deleting clears the pick (option becomes "no choice yet" in the summary).
8. **Filter by option / allergy**: from the Menu tab, click an option count → Guests tab opens filtered. Same for allergens.
9. **Locale switch**: switch to Spanish on the public invitation page; confirm all new copy translated.

- [ ] **Step 3: Clean up Playwright artifacts (if used).**

If you used the Playwright MCP browser tools at any point: `rm -rf .playwright-mcp/`

- [ ] **Step 4: Final commit if anything was tweaked during smoke testing.**

```bash
git status
# stage and commit any small fixes individually
```

---

## Done

The feature is complete when:
1. All tests in `npm test` are green.
2. The end-to-end smoke flows above all behave as described.
3. Strings render in both EN and ES.
4. The git log shows a focused commit per task with no unrelated changes.

Estimated total: ~25 commits across 11 tasks, mostly TDD on the server side, manual verification on the UI side.

# Export Guest List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CSV export of an event's guest list (with companions, RSVP status, allergies, and per-course menu picks) downloadable from the guests admin page.

**Architecture:** New server endpoint `GET /api/events/[id]/guests/export` that loads guests via a shared util, builds a UTF-8-BOM CSV string in memory, and returns it with `Content-Disposition: attachment`. UI adds an `<a download>` button next to existing Import/Add buttons. CSV layout: one row per attending person (primary guest + each attending companion), linked by a shared `group_id`.

**Tech Stack:** Nuxt 3, Drizzle ORM (better-sqlite3), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-09-export-guest-list-design.md`

---

## File Structure

**New files:**
- `server/utils/csv.ts` — `csvEscape(value)`, `csvSlugify(name)` pure helpers.
- `server/utils/event-guests.ts` — `loadEventGuests(eventId)`. The grouping currently inlined in `index.get.ts` moves here so it can be reused.
- `server/utils/guests-csv.ts` — `buildGuestsCsv(guests, courses)` returns the CSV body string (with BOM and CRLF). Pure function, DB-free.
- `server/api/events/[id]/guests/export.get.ts` — HTTP handler (auth + event ownership + load + build + headers).
- `server/utils/__tests__/csv.test.ts` — unit tests for `csvEscape`, `csvSlugify`.
- `server/utils/__tests__/guests-csv.test.ts` — unit tests for `buildGuestsCsv`.
- `server/api/__tests__/guests-export.test.ts` — endpoint tests (mock DB, headers, auth).

**Modified files:**
- `server/api/events/[id]/guests/index.get.ts` — call `loadEventGuests` instead of inlining.
- `pages/dashboard/events/[id]/guests.vue` — add the Export button.
- `i18n/lang/en.json` — `guests.exportCsv`, `guests.exportEmptyHint`.
- `i18n/lang/es.json` — same keys, Spanish.

---

## Task 1: CSV utility helpers (`csv.ts`)

Pure functions with no dependencies. TDD against synthetic input.

**Files:**
- Create: `server/utils/__tests__/csv.test.ts`
- Create: `server/utils/csv.ts`

- [ ] **Step 1: Write the failing test file**

Write `server/utils/__tests__/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { csvEscape, csvSlugify } from '../csv'

describe('csvEscape', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape('')).toBe('')
  })

  it('passes simple strings through unquoted', () => {
    expect(csvEscape('Alice')).toBe('Alice')
    expect(csvEscape('alice@example.com')).toBe('alice@example.com')
  })

  it('quotes fields containing a comma', () => {
    expect(csvEscape('Doe, Jr.')).toBe('"Doe, Jr."')
  })

  it('quotes and doubles internal quotes', () => {
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""')
  })

  it('quotes fields containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('coerces non-string values to strings', () => {
    expect(csvEscape(42)).toBe('42')
    expect(csvEscape(true)).toBe('true')
  })
})

describe('csvSlugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(csvSlugify('Plat principal')).toBe('plat_principal')
  })

  it('strips diacritics', () => {
    expect(csvSlugify('Entrée')).toBe('entree')
    expect(csvSlugify('Café')).toBe('cafe')
  })

  it('collapses runs of non-alphanumerics into a single underscore', () => {
    expect(csvSlugify('Dessert (kid)')).toBe('dessert_kid')
    expect(csvSlugify('A -- B')).toBe('a_b')
  })

  it('trims leading and trailing underscores', () => {
    expect(csvSlugify('  hello world  ')).toBe('hello_world')
    expect(csvSlugify('--abc--')).toBe('abc')
  })

  it('returns empty string for input with no alphanumerics', () => {
    expect(csvSlugify('???')).toBe('')
    expect(csvSlugify('')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/utils/__tests__/csv.test.ts`
Expected: FAIL — module `../csv` cannot be resolved.

- [ ] **Step 3: Implement `csv.ts`**

Write `server/utils/csv.ts`:

```ts
export function csvEscape(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (s.length === 0) return ''
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function csvSlugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/utils/__tests__/csv.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/csv.ts server/utils/__tests__/csv.test.ts
git commit -m "feat(export): csv escape + slug helpers"
```

---

## Task 2: Extract `loadEventGuests` util

Move the existing grouping logic out of `index.get.ts` into a reusable util. The existing `guests.test.ts` covers the output shape, so we just need to ensure those tests still pass after the refactor.

**Files:**
- Create: `server/utils/event-guests.ts`
- Modify: `server/api/events/[id]/guests/index.get.ts`

- [ ] **Step 1: Create `loadEventGuests` util**

Write `server/utils/event-guests.ts`:

```ts
import { db } from '~/server/db'
import { guests, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export type LoadedCompanion = {
  id: number
  position: number
  name: string | null
  attending: boolean
  menuChoices: Record<number, number>
  allergies: ReturnType<typeof parseAllergies>
}

export type LoadedGuest = {
  id: number
  eventId: number
  name: string
  email: string | null
  phone: string | null
  rsvpStatus: string
  companionsAllowed: number
  token: string
  emailSentAt: string | null
  emailOpenedAt: string | null
  createdAt: string | null
  menuChoices: Record<number, number>
  allergies: ReturnType<typeof parseAllergies>
  companions: LoadedCompanion[]
}

export async function loadEventGuests(eventId: number): Promise<LoadedGuest[]> {
  const guestRows = await db.query.guests.findMany({
    where: eq(guests.eventId, eventId),
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
    const companionsOut: LoadedCompanion[] = compRows.map(c => ({
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
}
```

- [ ] **Step 2: Replace inlined logic in `index.get.ts`**

Rewrite `server/api/events/[id]/guests/index.get.ts` to:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { loadEventGuests } from '~/server/utils/event-guests'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  return loadEventGuests(id)
})
```

- [ ] **Step 3: Run existing tests to verify shape unchanged**

Run: `npx vitest run server/api/__tests__/guests.test.ts`
Expected: PASS — all existing tests for `GET /api/events/:id/guests` still green (they exercise the loader output shape).

- [ ] **Step 4: Commit**

```bash
git add server/utils/event-guests.ts server/api/events/\[id\]/guests/index.get.ts
git commit -m "refactor(guests): extract loadEventGuests util"
```

---

## Task 3: CSV builder (`buildGuestsCsv`)

Pure function that takes the loader's output plus the event's menu and produces the CSV body string. DB-free; tested with synthetic input.

**Files:**
- Create: `server/utils/__tests__/guests-csv.test.ts`
- Create: `server/utils/guests-csv.ts`

- [ ] **Step 1: Write the failing tests**

Write `server/utils/__tests__/guests-csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildGuestsCsv, type CsvCourse } from '../guests-csv'
import type { LoadedGuest } from '../event-guests'

const NO_COURSES: CsvCourse[] = []

function guest(overrides: Partial<LoadedGuest> = {}): LoadedGuest {
  return {
    id: 1,
    eventId: 1,
    name: 'Alice',
    email: 'alice@example.com',
    phone: null,
    rsvpStatus: 'pending',
    companionsAllowed: 0,
    token: 'tok',
    emailSentAt: null,
    emailOpenedAt: null,
    createdAt: null,
    menuChoices: {},
    allergies: null,
    companions: [],
    ...overrides,
  }
}

describe('buildGuestsCsv', () => {
  it('emits BOM + header row only when guest list is empty', () => {
    const csv = buildGuestsCsv([], NO_COURSES)
    expect(csv.startsWith('﻿')).toBe(true)
    const body = csv.slice(1)
    expect(body).toBe(
      'group_id,role,companion_position,name,email,phone,rsvp_status,companions_allowed,allergies,invited_at\r\n'
    )
  })

  it('uses CRLF line endings', () => {
    const csv = buildGuestsCsv([guest()], NO_COURSES)
    const lines = csv.slice(1).split('\r\n')
    // header + 1 data row + trailing empty from final CRLF = 3
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('')
  })

  it('renders one primary row per guest with no companions', () => {
    const g = guest({ id: 7, name: 'Alice', email: 'a@x.com', phone: '555', rsvpStatus: 'confirmed', emailSentAt: '2026-05-01T10:00:00Z' })
    const csv = buildGuestsCsv([g], NO_COURSES)
    const rows = csv.slice(1).trim().split('\r\n')
    expect(rows[1]).toBe('7,primary,,Alice,a@x.com,555,confirmed,0,,2026-05-01T10:00:00Z')
  })

  it('only emits companion rows for attending companions', () => {
    const g = guest({
      id: 3,
      name: 'Host',
      companionsAllowed: 2,
      rsvpStatus: 'confirmed',
      companions: [
        { id: 11, position: 1, name: 'Plus One', attending: true, menuChoices: {}, allergies: null },
        { id: 12, position: 2, name: null, attending: false, menuChoices: {}, allergies: null },
      ],
    })
    const rows = buildGuestsCsv([g], NO_COURSES).slice(1).trim().split('\r\n')
    // header + primary + 1 companion = 3 rows
    expect(rows).toHaveLength(3)
    expect(rows[1].startsWith('3,primary,')).toBe(true)
    expect(rows[2]).toBe('3,companion,1,Plus One,,,attending,,,')
  })

  it('emits menu_<slug> columns in course sortOrder, mapping option ids to names', () => {
    const courses: CsvCourse[] = [
      { id: 100, name: 'Starter', sortOrder: 0, options: [{ id: 1001, name: 'Soup' }, { id: 1002, name: 'Salad' }] },
      { id: 200, name: 'Plat principal', sortOrder: 1, options: [{ id: 2001, name: 'Beef' }] },
    ]
    const g = guest({
      id: 5,
      name: 'Alice',
      rsvpStatus: 'confirmed',
      companionsAllowed: 1,
      menuChoices: { 100: 1001, 200: 2001 },
      companions: [
        { id: 21, position: 1, name: 'Bob', attending: true, menuChoices: { 100: 1002 }, allergies: null },
      ],
    })
    const csv = buildGuestsCsv([g], courses)
    const rows = csv.slice(1).trim().split('\r\n')
    expect(rows[0]).toBe(
      'group_id,role,companion_position,name,email,phone,rsvp_status,companions_allowed,allergies,invited_at,menu_starter,menu_plat_principal'
    )
    expect(rows[1].endsWith(',Soup,Beef')).toBe(true)
    expect(rows[2].endsWith(',Salad,')).toBe(true) // companion has no main course pick
  })

  it('formats allergies as "keys, "other"" with raw key names', () => {
    const g = guest({
      id: 1,
      allergies: { keys: ['gluten', 'dairy'] as any, other: 'shellfish bisque' },
    })
    const rows = buildGuestsCsv([g], NO_COURSES).slice(1).trim().split('\r\n')
    // The allergies field contains commas and quotes, so the cell is wrapped in quotes
    // and inner quotes are doubled.
    expect(rows[1]).toContain('"gluten, dairy, ""shellfish bisque"""')
  })

  it('quotes fields containing commas, quotes, and newlines', () => {
    const g = guest({ id: 9, name: 'O\'Hara, Jr.', phone: 'line1\nline2', email: 'a"b@x.com' })
    const rows = buildGuestsCsv([g], NO_COURSES).slice(1).trim().split('\r\n')
    expect(rows[1]).toContain(',"O\'Hara, Jr.",')
    expect(rows[1]).toContain(',"a""b@x.com",')
    expect(rows[1]).toContain(',"line1\nline2",')
  })

  it('disambiguates duplicate slugified course names', () => {
    const courses: CsvCourse[] = [
      { id: 1, name: 'Dessert', sortOrder: 0, options: [] },
      { id: 2, name: 'Dessert', sortOrder: 1, options: [] },
    ]
    const csv = buildGuestsCsv([], courses)
    expect(csv.split('\r\n')[0]).toContain('menu_dessert,menu_dessert_2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/utils/__tests__/guests-csv.test.ts`
Expected: FAIL — module `../guests-csv` cannot be resolved.

- [ ] **Step 3: Implement `buildGuestsCsv`**

Write `server/utils/guests-csv.ts`:

```ts
import { csvEscape, csvSlugify } from './csv'
import type { LoadedGuest } from './event-guests'
import type { Allergies } from '~/shared/menu'

export type CsvCourse = {
  id: number
  name: string
  sortOrder: number
  options: Array<{ id: number; name: string }>
}

const FIXED_HEADERS = [
  'group_id',
  'role',
  'companion_position',
  'name',
  'email',
  'phone',
  'rsvp_status',
  'companions_allowed',
  'allergies',
  'invited_at',
] as const

const BOM = '﻿'
const CRLF = '\r\n'

function formatAllergies(a: Allergies | null): string {
  if (!a) return ''
  const parts: string[] = [...a.keys]
  if (a.other) parts.push(`"${a.other}"`)
  return parts.join(', ')
}

function buildMenuHeaders(courses: CsvCourse[]): { headers: string[]; courseIds: number[] } {
  const sorted = [...courses].sort((a, b) => a.sortOrder - b.sortOrder)
  const seen = new Map<string, number>()
  const headers: string[] = []
  const courseIds: number[] = []
  for (const c of sorted) {
    const base = `menu_${csvSlugify(c.name) || 'course'}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    headers.push(count === 1 ? base : `${base}_${count}`)
    courseIds.push(c.id)
  }
  return { headers, courseIds }
}

export function buildGuestsCsv(guests: LoadedGuest[], courses: CsvCourse[]): string {
  const optionNameById = new Map<number, string>()
  for (const c of courses) {
    for (const o of c.options) optionNameById.set(o.id, o.name)
  }

  const { headers: menuHeaders, courseIds } = buildMenuHeaders(courses)

  const headerRow = [...FIXED_HEADERS, ...menuHeaders].map(csvEscape).join(',')
  const lines: string[] = [headerRow]

  for (const g of guests) {
    // primary row
    const primary: string[] = [
      String(g.id),
      'primary',
      '',
      csvEscape(g.name),
      csvEscape(g.email),
      csvEscape(g.phone),
      csvEscape(g.rsvpStatus),
      String(g.companionsAllowed),
      csvEscape(formatAllergies(g.allergies)),
      csvEscape(g.emailSentAt),
    ]
    for (const cid of courseIds) {
      const optId = g.menuChoices[cid]
      primary.push(csvEscape(optId != null ? optionNameById.get(optId) ?? '' : ''))
    }
    lines.push(primary.join(','))

    // companion rows (only attending)
    for (const c of g.companions) {
      if (!c.attending) continue
      const row: string[] = [
        String(g.id),
        'companion',
        String(c.position),
        csvEscape(c.name),
        '',
        '',
        'attending',
        '',
        csvEscape(formatAllergies(c.allergies)),
        '',
      ]
      for (const cid of courseIds) {
        const optId = c.menuChoices[cid]
        row.push(csvEscape(optId != null ? optionNameById.get(optId) ?? '' : ''))
      }
      lines.push(row.join(','))
    }
  }

  return BOM + lines.join(CRLF) + CRLF
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/utils/__tests__/guests-csv.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/guests-csv.ts server/utils/__tests__/guests-csv.test.ts
git commit -m "feat(export): build CSV body from loaded guests"
```

---

## Task 4: Export endpoint

Wire the loader + builder into an HTTP handler with auth, ownership check, and `Content-Disposition` headers.

**Files:**
- Create: `server/api/__tests__/guests-export.test.ts`
- Create: `server/api/events/[id]/guests/export.get.ts`

- [ ] **Step 1: Write the failing endpoint tests**

Write `server/api/__tests__/guests-export.test.ts`:

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
import { menuCourses, menuOptions, guestMenuChoices, companions as companionsTable } from '../../db/schema'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const exportHandler = (await import('../../api/events/[id]/guests/export.get')).default
const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('GET /api/events/:id/guests/export', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>
  let evt: ReturnType<typeof createTestEvent>

  beforeEach(async () => {
    testDb = createTestDb()
    user = await createTestUser(testDb, { email: 'owner@example.com' })
    evt = createTestEvent(testDb, user.id, { slug: 'alice-and-bob' })
  })

  it('returns 401 without auth', async () => {
    const event = createMockEvent({ params: { id: String(evt.id) } })
    await expect(exportHandler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns 404 when the event is not owned by the user', async () => {
    const intruder = await createTestUser(testDb, { email: 'intruder@example.com' })
    const event = authEvent(intruder.id, intruder.email, { params: { id: String(evt.id) } })
    await expect(exportHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('sets CSV headers with attachment filename containing slug + UTC date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09T08:00:00Z'))

    const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
    const body = (await exportHandler(event)) as string

    expect(event.node.res.getHeader('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(event.node.res.getHeader('Content-Disposition')).toBe(
      'attachment; filename="alice-and-bob-guests-2026-05-09.csv"'
    )
    expect(typeof body).toBe('string')
    expect(body.startsWith('﻿')).toBe(true)

    vi.useRealTimers()
  })

  it('returns header row only when the event has no guests', async () => {
    const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
    const body = (await exportHandler(event)) as string
    const rows = body.slice(1).split('\r\n')
    expect(rows[0]).toBe(
      'group_id,role,companion_position,name,email,phone,rsvp_status,companions_allowed,allergies,invited_at'
    )
    expect(rows.filter(Boolean)).toHaveLength(1) // only the header
  })

  it('emits primary + attending companion rows with menu picks', async () => {
    const guest = createTestGuest(testDb, evt.id, {
      name: 'Alice', email: 'a@x.com', rsvpStatus: 'confirmed', companionsAllowed: 2,
    })
    const [c1] = testDb.insert(companionsTable).values({
      guestId: guest.id, position: 1, name: 'Partner', attending: true,
    }).returning().all()
    testDb.insert(companionsTable).values({
      guestId: guest.id, position: 2, name: null, attending: false,
    }).run()

    const [course] = testDb.insert(menuCourses).values({
      eventId: evt.id, name: 'Plat principal', sortOrder: 0,
    }).returning().all()
    const [optBeef] = testDb.insert(menuOptions).values({
      courseId: course.id, name: 'Beef', sortOrder: 0,
    }).returning().all()
    const [optFish] = testDb.insert(menuOptions).values({
      courseId: course.id, name: 'Fish', sortOrder: 1,
    }).returning().all()
    testDb.insert(guestMenuChoices).values([
      { guestId: guest.id, courseId: course.id, optionId: optBeef.id, companionId: null },
      { guestId: guest.id, courseId: course.id, optionId: optFish.id, companionId: c1.id },
    ]).run()

    const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
    const body = (await exportHandler(event)) as string

    const rows = body.slice(1).split('\r\n').filter(Boolean)
    expect(rows[0]).toContain('menu_plat_principal')
    expect(rows).toHaveLength(3) // header + primary + 1 attending companion
    expect(rows[1]).toContain(',primary,')
    expect(rows[1]).toContain(',Alice,')
    expect(rows[1]).toContain(',Beef')
    expect(rows[2]).toContain(',companion,1,')
    expect(rows[2]).toContain(',Partner,')
    expect(rows[2]).toContain(',Fish')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/api/__tests__/guests-export.test.ts`
Expected: FAIL — `../../api/events/[id]/guests/export.get` cannot be resolved.

- [ ] **Step 3: Implement the endpoint**

Write `server/api/events/[id]/guests/export.get.ts`:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { loadEventGuests } from '~/server/utils/event-guests'
import { buildGuestsCsv, type CsvCourse } from '~/server/utils/guests-csv'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    orderBy: [asc(menuCourses.sortOrder)],
  })
  const courseIds = courses.map(c => c.id)

  const [guests, options] = await Promise.all([
    loadEventGuests(id),
    courseIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; courseId: number; name: string; sortOrder: number }>)
      : db.query.menuOptions.findMany({
          where: (o, { inArray }) => inArray(o.courseId, courseIds),
          orderBy: [asc(menuOptions.sortOrder)],
        }),
  ])

  const optionsByCourse = new Map<number, Array<{ id: number; name: string }>>()
  for (const o of options) {
    if (!optionsByCourse.has(o.courseId)) optionsByCourse.set(o.courseId, [])
    optionsByCourse.get(o.courseId)!.push({ id: o.id, name: o.name })
  }

  const csvCourses: CsvCourse[] = courses.map(c => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    options: optionsByCourse.get(c.id) ?? [],
  }))

  const body = buildGuestsCsv(guests, csvCourses)

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  const filename = `${evt.slug}-guests-${today}.csv`

  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  })

  return body
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/api/__tests__/guests-export.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS — every existing test still green, no new failures.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/\[id\]/guests/export.get.ts server/api/__tests__/guests-export.test.ts
git commit -m "feat(export): GET /api/events/:id/guests/export endpoint"
```

---

## Task 5: UI Export button + i18n

Add the localized "Export CSV" button to the guests admin page. The button is a real anchor element so the browser handles the download natively.

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`
- Modify: `pages/dashboard/events/[id]/guests.vue`

- [ ] **Step 1: Add English i18n keys**

In `i18n/lang/en.json`, find the `"guests"` block and the line `"importCsv": "Import CSV",`. Insert two lines **before** it:

```json
    "exportCsv": "Export CSV",
    "exportEmptyHint": "Add at least one guest to export",
    "importCsv": "Import CSV",
```

- [ ] **Step 2: Add Spanish i18n keys**

In `i18n/lang/es.json`, find the `"guests"` block and the line `"importCsv": "Importar CSV",`. Insert two lines **before** it:

```json
    "exportCsv": "Exportar CSV",
    "exportEmptyHint": "Añade al menos un invitado para exportar",
    "importCsv": "Importar CSV",
```

- [ ] **Step 3: Add the Export button to the page**

In `pages/dashboard/events/[id]/guests.vue`, in the `<script setup>` block, add a computed for the URL near the other computeds (e.g. just below `seatCountLabel`):

```ts
const exportUrl = computed(() => `/api/events/${eventId}/guests/export`)
const exportFilename = computed(() => {
  const slug = evt.value?.slug ?? 'event'
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${slug}-guests-${yyyy}-${mm}-${dd}.csv`
})
```

Then in the action button group in `<template>`, locate this block:

```html
      <div class="flex gap-2">
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
          {{ t('guests.importCsv') }}
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 transition-colors">
          {{ t('guests.addGuest') }}
        </button>
      </div>
```

Replace it with:

```html
      <div class="flex gap-2">
        <a :href="exportUrl" :download="exportFilename"
          :class="[
            'px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200',
            !guests?.length && 'opacity-50 pointer-events-none',
          ]"
          :title="!guests?.length ? t('guests.exportEmptyHint') : undefined">
          {{ t('guests.exportCsv') }}
        </a>
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
          {{ t('guests.importCsv') }}
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 transition-colors">
          {{ t('guests.addGuest') }}
        </button>
      </div>
```

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev`

Then in a browser:
1. Sign in, open an event with at least one guest, navigate to the **Guests** tab.
2. The "Export CSV" button is visible at the top right, before "Import CSV".
3. Click it. The browser downloads a file named `<slug>-guests-<YYYY-MM-DD>.csv`.
4. Open the file in a spreadsheet (LibreOffice / Excel / Google Sheets). Column headers are correct; accented characters render properly; allergies render as a comma-joined list; companions appear as additional rows below their primary; menu picks appear in `menu_*` columns.
5. Switch to a Spanish locale and verify the button label reads "Exportar CSV".
6. Open an event with **zero guests**: the button is greyed out, hover shows the empty hint, click does nothing.

If anything is off, fix it before committing. Stop and ask if you're unsure how to fix something.

- [ ] **Step 5: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json pages/dashboard/events/\[id\]/guests.vue
git commit -m "feat(export): export csv button on guests admin page"
```

---

## Verification Checklist

After all tasks complete, run once more:

- [ ] `npm test` — full suite passes.
- [ ] `npx tsc --noEmit` (or `npm run build`) — no TypeScript errors.
- [ ] Manual download flow works in browser (covered in Task 5 step 4).
- [ ] CSV opens in Excel/LibreOffice with accents intact (BOM verification).

## Spec Coverage

- ✅ Endpoint route: Task 4.
- ✅ Auth + ownership: Task 4 (tests #1, #2).
- ✅ CSV builder one-row-per-person + group_id + role: Task 3.
- ✅ Companions only if attending: Task 3 (test "only emits companion rows for attending companions") + Task 4 integration test.
- ✅ Menu_<slug> dynamic columns: Task 1 (slug) + Task 3 (builder).
- ✅ Allergies formatted: Task 3 (test "formats allergies").
- ✅ CSV escaping: Task 1 (escape) + Task 3 (test "quotes fields containing commas, quotes, and newlines").
- ✅ BOM + CRLF: Task 3.
- ✅ Filename `<slug>-guests-<YYYY-MM-DD>.csv` with UTC date: Task 4 (header test with fake timer).
- ✅ Shared util `loadEventGuests`: Task 2.
- ✅ UI Export button between Import and Add: Task 5 step 3.
- ✅ Disabled state for empty guest list: Task 5 step 3.
- ✅ i18n keys (en, es): Task 5 steps 1–2.

# Localize Date Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All user-visible dates respect the active locale via a single shared helper, with consistent server/client output and preserved time-zone semantics for event dates.

**Architecture:** A pure `shared/date-format.ts` module exposes the named-format options map plus two helpers (`toEventDate` for `YYYY-MM-DD` noon-pinning and `formatDate` for server-side string output). Vue I18n's `datetimeFormats` is wired from the same map so Vue templates get `$d()` / `useI18n().d()`. Server code (rendered HTML, outbound email) imports `formatDate` directly. A `useRelativeTime()` composable wraps `Intl.RelativeTimeFormat` for future use.

**Tech Stack:** Nuxt 3, `@nuxtjs/i18n` v10, Vitest, native `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`.

**Spec:** `docs/superpowers/specs/2026-05-10-localize-date-formatting-design.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `shared/date-format.ts` | NEW | Pure module: format options map, `toEventDate`, `formatDate`. No Vue/Nuxt deps. |
| `shared/__tests__/date-format.test.ts` | NEW | Unit tests for shared module. |
| `composables/useRelativeTime.ts` | NEW | Vue composable wrapping `Intl.RelativeTimeFormat`. |
| `nuxt.config.ts` | MODIFY | Add `datetimeFormats` block sourced from `shared/date-format`. |
| `server/utils/render-invitation.ts` | MODIFY | Replace inline `toLocaleDateString` with shared helpers. |
| `server/utils/__tests__/render-invitation.test.ts` | (no change) | Existing en+es coverage already passes against new impl; we re-run to confirm. |
| `server/api/events/[id]/send-invitations.post.ts` | MODIFY | Drop hardcoded `'en-US'`; use `userEvent.language` + shared helpers. |
| `pages/dashboard/index.vue` | MODIFY | Render `evt.date` via `d()` + `toEventDate`. |
| `pages/dashboard/account.vue` | MODIFY | Replace `formatDate` helper with `d()`. |
| `pages/dashboard/events/[id]/index.vue` | MODIFY | Replace inline `formatDate` with `d()` + `toEventDate`. |
| `pages/dashboard/events/[id]/guests.vue` | MODIFY | Replace `formatSentDate` with `d()`. |

---

## Task 1: Create shared/date-format.ts module (TDD)

**Files:**
- Create: `shared/date-format.ts`
- Create: `shared/__tests__/date-format.test.ts`

- [ ] **Step 1: Write failing tests for `formatDate` and `toEventDate`**

Create `shared/__tests__/date-format.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest'
import { formatDate, toEventDate, dateFormatOptions } from '../date-format'

describe('dateFormatOptions', () => {
  it('exposes short, long, and datetime named formats', () => {
    expect(Object.keys(dateFormatOptions).sort()).toEqual(['datetime', 'long', 'short'])
  })
})

describe('toEventDate', () => {
  it('pins YYYY-MM-DD to local noon so the calendar day survives all TZs', () => {
    const d = toEventDate('2026-05-10')
    // Hours=12 in local TZ means: 12 hours before/after the local-midnight boundary,
    // so even in UTC-11 / UTC+13 the local date stays on May 10.
    expect(d.getHours()).toBe(12)
    expect(d.getDate()).toBe(10)
    expect(d.getMonth()).toBe(4) // May = 4 (0-indexed)
    expect(d.getFullYear()).toBe(2026)
  })
})

describe('formatDate', () => {
  // 2026-05-10 was a Sunday — used to assert weekday output.
  const d = toEventDate('2026-05-10')

  it('formats short dates in English (en)', () => {
    // en short is M/D/YYYY (en-US convention)
    expect(formatDate(d, 'en', 'short')).toMatch(/^5\/10\/2026$/)
  })

  it('formats short dates in Spanish (es)', () => {
    // es short is D/M/YYYY
    expect(formatDate(d, 'es', 'short')).toMatch(/^10\/5\/2026$/)
  })

  it('formats long dates in English (en)', () => {
    expect(formatDate(d, 'en', 'long')).toMatch(/Sunday,\s*May\s*10,\s*2026/)
  })

  it('formats long dates in Spanish (es)', () => {
    // ICU outputs the weekday/month in Spanish; assert on locale-specific tokens.
    expect(formatDate(d, 'es', 'long')).toMatch(/domingo/)
    expect(formatDate(d, 'es', 'long')).toMatch(/mayo/)
    expect(formatDate(d, 'es', 'long')).toMatch(/2026/)
  })

  it('formats datetime values with both date and time parts', () => {
    const dt = new Date('2026-05-10T15:30:00')
    const enOut = formatDate(dt, 'en', 'datetime')
    expect(enOut).toMatch(/2026/)
    // Time part: hour:minute (en defaults to am/pm, but we tolerate either)
    expect(enOut).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns the original input when given an unparsable string', () => {
    expect(formatDate('not-a-date', 'en', 'short')).toBe('not-a-date')
  })

  it('defaults to short format when no name is provided', () => {
    expect(formatDate(d, 'en')).toBe(formatDate(d, 'en', 'short'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/__tests__/date-format.test.ts`
Expected: FAIL — `Cannot find module '../date-format'`.

- [ ] **Step 3: Implement `shared/date-format.ts`**

Create `shared/date-format.ts` with:

```typescript
export type DateFormatName = 'short' | 'long' | 'datetime'

export const dateFormatOptions: Record<DateFormatName, Intl.DateTimeFormatOptions> = {
  short: { year: 'numeric', month: 'numeric', day: 'numeric' },
  long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  datetime: {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
}

export function toEventDate(isoDateString: string): Date {
  return new Date(`${isoDateString}T12:00:00`)
}

export function formatDate(
  input: Date | string | number,
  locale: string,
  format: DateFormatName = 'short',
): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    return typeof input === 'string' ? input : String(input)
  }
  return new Intl.DateTimeFormat(locale, dateFormatOptions[format]).format(date)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/__tests__/date-format.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS — all existing 270 tests + 8 new tests = 278 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add shared/date-format.ts shared/__tests__/date-format.test.ts
git commit -m "feat(i18n): add shared date-format helpers and named format options"
```

---

## Task 2: Wire datetimeFormats into Vue I18n config

**Files:**
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Add the datetimeFormats block**

Open `nuxt.config.ts`. At the top of the file, add an import:

```typescript
import { dateFormatOptions } from './shared/date-format'
```

Inside the existing `i18n: { ... }` block, after `detectBrowserLanguage: { ... }`, add:

```typescript
    datetimeFormats: {
      en: dateFormatOptions,
      es: dateFormatOptions,
    },
```

The full `i18n` block should look like:

```typescript
  i18n: {
    locales: [
      { code: 'en', file: 'en.json', name: 'English', language: 'en-US' },
      { code: 'es', file: 'es.json', name: 'Español', language: 'es-ES' },
    ],
    defaultLocale: 'en',
    langDir: 'lang/',
    strategy: 'prefix_except_default',
    baseUrl: process.env.BASE_URL || '',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      fallbackLocale: 'en',
      redirectOn: 'root',
    },
    datetimeFormats: {
      en: dateFormatOptions,
      es: dateFormatOptions,
    },
  },
```

- [ ] **Step 2: Re-prepare Nuxt to pick up config changes**

Run: `npx nuxt prepare`
Expected: completes without error.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — still 278 tests, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts
git commit -m "feat(i18n): register datetimeFormats for en and es"
```

---

## Task 3: Refactor server/utils/render-invitation.ts to use shared helpers

**Files:**
- Modify: `server/utils/render-invitation.ts`
- Verified by: `server/utils/__tests__/render-invitation.test.ts` (already covers en + es cases)

- [ ] **Step 1: Run existing render-invitation tests to confirm baseline**

Run: `npm test -- server/utils/__tests__/render-invitation.test.ts`
Expected: PASS — 10 tests including `formats the date in Spanish when language is es`.

- [ ] **Step 2: Update render-invitation.ts to import shared helpers**

In `server/utils/render-invitation.ts`, at the top of the file, change the imports to include the shared helpers:

```typescript
import { substituteTemplate, type TemplateData } from './template-substitute'
import { formatDate, toEventDate } from '~/shared/date-format'
```

- [ ] **Step 3: Replace the local `formatDate` function with shared call**

In `server/utils/render-invitation.ts`:

Inside `renderInvitation`, change:

```typescript
  const formattedDate = formatDate(event.date, event.language)
```

to:

```typescript
  const formattedDate = formatDate(toEventDate(event.date), event.language, 'long')
```

Then delete the local `formatDate` function (lines 90-99 of the current file):

```typescript
function formatDate(dateStr: string, language: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
```

- [ ] **Step 4: Run render-invitation tests**

Run: `npm test -- server/utils/__tests__/render-invitation.test.ts`
Expected: PASS — all 10 tests still pass against the new implementation (same en `June 15, 2026` and es `junio` output).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 6: Commit**

```bash
git add server/utils/render-invitation.ts
git commit -m "refactor(i18n): use shared date-format helpers in render-invitation"
```

---

## Task 4: Fix hardcoded en-US in send-invitations.post.ts

**Files:**
- Modify: `server/api/events/[id]/send-invitations.post.ts`

- [ ] **Step 1: Review the existing send-invitations test for coverage**

Run: `npm test -- server/api/__tests__/send-invitations.test.ts`
Expected: PASS — establishes baseline.

- [ ] **Step 2: Update imports**

In `server/api/events/[id]/send-invitations.post.ts`, at the top, add:

```typescript
import { formatDate, toEventDate } from '~/shared/date-format'
```

- [ ] **Step 3: Replace the hardcoded format call**

In the loop body around line 73, change:

```typescript
        date: new Date(userEvent.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
```

to:

```typescript
        date: formatDate(toEventDate(userEvent.date), userEvent.language, 'long'),
```

- [ ] **Step 4: Run send-invitations tests**

Run: `npm test -- server/api/__tests__/send-invitations.test.ts`
Expected: PASS — the existing tests do not assert on date format output, so they remain green.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/[id]/send-invitations.post.ts
git commit -m "fix(invitations): format email wedding date with the event's language"
```

---

## Task 5: Replace toLocaleDateString in pages/dashboard/account.vue

**Files:**
- Modify: `pages/dashboard/account.vue`

- [ ] **Step 1: Update the script setup block**

In `pages/dashboard/account.vue`, find the existing block:

```typescript
const { t } = useI18n()
const { user } = useAuth()
```

and add `d` to the destructuring:

```typescript
const { t, d } = useI18n()
const { user } = useAuth()
```

- [ ] **Step 2: Replace the `formatDate` helper with a call to `d`**

In `pages/dashboard/account.vue`, replace:

```typescript
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}
```

with:

```typescript
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return d(new Date(dateStr), 'short')
}
```

(We keep the wrapper because two template sites call `formatDate(...)` and the null-handling is local UX behavior.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/account.vue
git commit -m "i18n(account): localize subscription renew/cancel date"
```

---

## Task 6: Localize event date on dashboard event list

**Files:**
- Modify: `pages/dashboard/index.vue`

- [ ] **Step 1: Add the import and `d` destructuring**

The current `<script setup>` block in `pages/dashboard/index.vue` is:

```typescript
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { data: events, status } = await useFetch('/api/events')
</script>
```

Replace it with:

```typescript
<script setup lang="ts">
import { toEventDate } from '~/shared/date-format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, d } = useI18n()
const { data: events, status } = await useFetch('/api/events')
</script>
```

- [ ] **Step 2: Replace the raw `{{ evt.date }}` output**

In the template, change line 33:

```html
          <p class="text-sm text-charcoal-500">{{ evt.coupleName1 }} &amp; {{ evt.coupleName2 }} &middot; {{ evt.date }}</p>
```

to:

```html
          <p class="text-sm text-charcoal-500">{{ evt.coupleName1 }} &amp; {{ evt.coupleName2 }} &middot; {{ d(toEventDate(evt.date), 'long') }}</p>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/index.vue
git commit -m "i18n(dashboard): localize event date on the events list"
```

---

## Task 7: Localize event date on event detail page

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`

- [ ] **Step 1: Update imports and destructuring**

Find the existing line at `pages/dashboard/events/[id]/index.vue:4`:

```typescript
const { t, locale } = useI18n()
```

Replace with:

```typescript
const { t, d } = useI18n()
```

(`locale` is only referenced by the inline `formatDate` we're replacing in Step 2, so it can be dropped.)

Add the import for `toEventDate` near the top of the script (after the existing imports/`definePageMeta`):

```typescript
import { toEventDate } from '~/shared/date-format'
```

- [ ] **Step 2: Replace the local `formatDate` function**

In `pages/dashboard/events/[id]/index.vue`, replace:

```typescript
function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString(locale.value, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
```

with:

```typescript
function formatDate(dateStr: string) {
  return d(toEventDate(dateStr), 'long')
}
```

(We keep the wrapper because the template calls `formatDate(evt.date)` in two places — line ~189 and ~235.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/events/[id]/index.vue
git commit -m "i18n(event): localize wedding date on the event detail page"
```

---

## Task 8: Localize last-sent date on guests page

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`

- [ ] **Step 1: Update destructuring**

In `pages/dashboard/events/[id]/guests.vue`, change the `useI18n()` destructure (currently `const { t } = useI18n()` near line 4) to:

```typescript
const { t, d } = useI18n()
```

- [ ] **Step 2: Replace `formatSentDate`**

In `pages/dashboard/events/[id]/guests.vue`, replace:

```typescript
function formatSentDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}
```

with:

```typescript
function formatSentDate(iso: string | null): string {
  if (!iso) return '—'
  return d(new Date(iso), 'short')
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/events/[id]/guests.vue
git commit -m "i18n(guests): localize last-invitation-sent date"
```

---

## Task 9: Add useRelativeTime composable

**Files:**
- Create: `composables/useRelativeTime.ts`
- Create: `composables/__tests__/useRelativeTime.test.ts` (optional — the project has no other composable tests; we'll skip if vitest can't resolve `useI18n`)

- [ ] **Step 1: Implement the composable**

Create `composables/useRelativeTime.ts`:

```typescript
type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'

const UNITS: Array<{ unit: Unit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
]

export function useRelativeTime() {
  const { locale } = useI18n()

  return (from: Date | string | number, to: Date = new Date()): string => {
    const fromDate = from instanceof Date ? from : new Date(from)
    if (Number.isNaN(fromDate.getTime())) {
      return typeof from === 'string' ? from : String(from)
    }

    const diffMs = fromDate.getTime() - to.getTime()
    const absMs = Math.abs(diffMs)

    const match = UNITS.find(u => absMs >= u.ms) ?? UNITS[UNITS.length - 1]
    const value = Math.round(diffMs / match.ms)

    return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(value, match.unit)
  }
}
```

(`useI18n` is auto-imported by `@nuxtjs/i18n` in composables.)

- [ ] **Step 2: Sanity-check via Nuxt prepare and TypeScript**

Run: `npx nuxt prepare`
Expected: completes without error.

Run: `npm test`
Expected: PASS — 278 tests.

- [ ] **Step 3: Commit**

```bash
git add composables/useRelativeTime.ts
git commit -m "feat(i18n): add useRelativeTime composable"
```

---

## Task 10: Manual verification in dev server

**Files:** none — manual smoke check before declaring task complete.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (in a separate terminal or background).
Wait for the Nuxt-ready banner.

- [ ] **Step 2: Verify each touched page renders without hydration errors**

Open the browser to `http://localhost:3000/`.

- Sign in (or use a known dev account) and visit `/dashboard` — confirm event cards show the wedding date in long English form (e.g. `Sunday, May 10, 2026`).
- Switch the locale to Spanish via the language selector. Same page should now show `domingo, 10 de mayo de 2026` style.
- Open an event detail page (`/dashboard/events/<id>`) — confirm the long date renders in the active locale.
- Open the guests tab — if there's an invitation with a sent timestamp, confirm the last-sent column shows in active-locale short form.
- Open the account page — if there's a subscription, confirm the renews/cancels date is in active-locale short form.

Open the browser devtools console and confirm there are NO Vue hydration warnings.

- [ ] **Step 3: Verify the rendered invitation HTML**

In the dashboard, open an event and view the invitation rendered HTML at `/api/invitations/<slug>/rendered.html`. Confirm the date renders in the event's language.

- [ ] **Step 4: Stop the dev server**

Stop the `npm run dev` process.

- [ ] **Step 5: Final test run + commit (if anything was tweaked)**

Run: `npm test`
Expected: PASS — 278 tests.

If any tweaks were needed during manual testing, commit them with an appropriate message. Otherwise no commit required.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|------------------|------|
| Shared helper / single source of truth | Task 1 (`shared/date-format.ts`) |
| Vue I18n wiring of named formats | Task 2 (`nuxt.config.ts`) |
| Replace ad-hoc calls in dashboard event list | Task 6 |
| Replace ad-hoc calls in account page | Task 5 |
| Replace ad-hoc calls in event detail page | Task 7 |
| Replace ad-hoc calls in guests page | Task 8 |
| Replace ad-hoc calls in render-invitation (server) | Task 3 |
| Fix hardcoded en-US in send-invitations email | Task 4 |
| Relative-time helper | Task 9 |
| TZ-preserved wedding date semantics | Task 1 (`toEventDate`) + verified in Tasks 3, 4, 6, 7 |
| SSR safety (no hydration mismatch) | Task 10 (manual verification) |
| Tests | Task 1 (8 new); Task 3 (existing en+es tests re-run) |

All spec sections covered.

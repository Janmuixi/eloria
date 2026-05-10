# Localize date formatting on the frontend — design

**Status:** Approved
**Task:** TASK-004 (`docs/TASKS.md`)
**Area:** Frontend / i18n + supporting server-side date formatting

## Problem

User-visible dates render with a single hardcoded format regardless of the active locale. Example symptoms:

- `pages/dashboard/index.vue:33` shows the raw stored string `evt.date` (e.g. `2026-05-10`).
- `pages/dashboard/account.vue:41` and `pages/dashboard/events/[id]/guests.vue:341` call `toLocaleDateString()` with no locale and no options, falling back to the runtime default rather than the user's chosen locale.
- `pages/dashboard/events/[id]/index.vue:51` does pass `locale.value` but the format definition is duplicated inline.
- `server/api/events/[id]/send-invitations.post.ts:73` hardcodes `'en-US'` when formatting the wedding date for the invitation email — a bug for `es` users.
- `server/utils/render-invitation.ts:90` formats the wedding date with `event.language` but the format options are duplicated separately from the dashboard.

Users currently see inconsistent formats and, in the email path, the wrong locale. The acceptance criteria require a single shared helper, locale-driven output, preserved time-zone semantics for event dates, and SSR consistency.

## Goals

- All user-visible dates respect the active locale (frontend) or the event's language (rendered invitation HTML and outbound email).
- One source of truth for the named format definitions (`short`, `long`, `datetime`).
- Server and client produce identical strings from identical inputs (no SSR hydration mismatch).
- Wedding date semantics preserved: a `YYYY-MM-DD` event date renders as the same calendar day in every time zone.
- Replace every ad-hoc `toLocaleDateString` / `toISOString().slice(...)` / manual format call with the shared helper.
- Provide a relative-time composable for future use even though no current screen displays relative time.

## Non-goals

- Adding new locales. The app currently ships `en` and `es`; this work doesn't add or block adding more.
- Reformatting `<input type="date">` values (those use `YYYY-MM-DD` per the HTML spec — that is correct).
- Changing how dates are stored in the database.
- Changing the time-zone story for absolute timestamps (`emailSentAt`, `currentPeriodEnd`, …). Those continue to render in the user's local TZ, which is the right behavior for billing / activity dates.

## Approach

### Single source of truth: `shared/date-format.ts`

A pure TypeScript module exporting:

```ts
export type DateFormatName = 'short' | 'long' | 'datetime'

export const dateFormatOptions: Record<DateFormatName, Intl.DateTimeFormatOptions> = {
  short:    { year: 'numeric', month: 'numeric', day: 'numeric' },
  long:     { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  datetime: { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' },
}

// Convert a stored event date "YYYY-MM-DD" into a Date pinned at local noon,
// so the calendar day is preserved across time zones. Used in both Vue templates
// (passed to $d()) and server code.
export function toEventDate(isoDateString: string): Date { /* new Date(isoDateString + 'T12:00:00') */ }

// String-producing helper for code paths that don't use Vue I18n (server,
// rendered HTML, emails). Frontend Vue templates use $d() instead.
export function formatDate(
  input: Date | string | number,
  locale: string,
  format: DateFormatName = 'short',
): string { /* new Intl.DateTimeFormat(locale, dateFormatOptions[format]).format(date) */ }
```

`toEventDate` is the noon-pinning helper; `formatDate` is the string-producing helper for server-side callers. Vue templates always use `$d(date, name)` — they never call `formatDate` directly. Server callers chain them: `formatDate(toEventDate(event.date), event.language, 'long')`.

### Vue I18n wiring

`nuxt.config.ts` imports `dateFormatOptions` from `shared/date-format.ts` and registers the same map under each locale code (matching the `code` field of each entry in the `locales` array, which is what `useI18n().locale.value` returns):

```ts
i18n: {
  // ...existing config...
  datetimeFormats: {
    en: dateFormatOptions,
    es: dateFormatOptions,
  },
}
```

Vue templates then use `$d(date, 'long')` / `$d(date, 'short')` / `$d(date, 'datetime')`. The `useI18n().d()` composable is available in `<script setup>`.

Why the same options for both locales: Intl handles the locale-specific output (`'en'` resolves to en-US-style output by default, `'es'` to es-style); the format *recipe* is the same. If we later want per-locale tweaks, we can diverge the maps without changing call sites.

Server-side callers pass `event.language` directly to `formatDate`. The `events.language` column defaults to `'en'` and follows the same `'en'` / `'es'` convention.

### Replacements

| File | Current | After |
|------|---------|-------|
| `pages/dashboard/index.vue:33` | `{{ evt.date }}` | `{{ d(toEventDate(evt.date), 'long') }}` (import `toEventDate` from `~/shared/date-format`; `d` from `useI18n()`) |
| `pages/dashboard/account.vue:39-42` | `new Date(dateStr).toLocaleDateString()` | `d(new Date(dateStr), 'short')` |
| `pages/dashboard/events/[id]/guests.vue:339-342` | `new Date(iso).toLocaleDateString()` | `d(new Date(iso), 'short')` |
| `pages/dashboard/events/[id]/index.vue:51-59` | inline `toLocaleDateString(locale.value, {...})` | `d(toEventDate(dateStr), 'long')` |
| `server/utils/render-invitation.ts:90-99` | inline options | `formatDate(toEventDate(event.date), event.language, 'long')` |
| `server/api/events/[id]/send-invitations.post.ts:73` | `'en-US'` hardcoded | `formatDate(toEventDate(userEvent.date), userEvent.language, 'long')` |

Locale tag mapping in shared util: when frontend code passes `locale.value` (which is `'en'` or `'es'` from the i18n module), the shared `formatDate` accepts it directly — `Intl.DateTimeFormat('en', ...)` and `Intl.DateTimeFormat('en-US', ...)` produce equivalent output for the formats in scope. Server-side, `event.language` follows the same convention.

### Relative-time composable (for future use)

`composables/useRelativeTime.ts`:

```ts
export function useRelativeTime() {
  const { locale } = useI18n()
  return (from: Date | string | number, to: Date = new Date()) => {
    const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
    // pick the largest unit (year/month/week/day/hour/minute/second) and call rtf.format(value, unit)
  }
}
```

Not used anywhere in the codebase today; included to satisfy the acceptance criterion and to provide a clean entry point when a future feature needs it.

### Components

- **`shared/date-format.ts`** — pure module: format options map + `formatDate` + `toEventDate`. No Nuxt/Vue imports.
- **`composables/useRelativeTime.ts`** — Vue composable, browser + SSR.
- **`nuxt.config.ts`** — registers `datetimeFormats` from the shared map.
- **Pages/server files listed above** — call sites updated.

### Data flow

```
shared/date-format.ts (options map)
        │
        ├─→ nuxt.config.ts → @nuxtjs/i18n → $d() / d() in Vue templates
        │
        └─→ server/utils/render-invitation.ts
            server/api/events/[id]/send-invitations.post.ts
```

The Vue side reads format options through Vue I18n; server-side code calls the shared helpers directly. Both ultimately call `Intl.DateTimeFormat` with the same options + locale, guaranteeing matching output.

### Error handling

- Invalid inputs (`NaN` date) → return the original string. Matches existing behavior in `render-invitation.ts:92`.
- Missing locale → `Intl.DateTimeFormat` falls back to `default`; we don't add additional handling.

### Testing

- **`shared/__tests__/date-format.test.ts`** (new):
  - `formatDate` for each named format × `en` / `es`.
  - `formatDate(toEventDate('2026-05-10'), …, 'long')` yields the same calendar day across at least two opposing time zones (run with `process.env.TZ` flipped, e.g. `Pacific/Honolulu` and `Pacific/Auckland`).
  - Invalid date string returns input unchanged.
- **`server/utils/__tests__/render-invitation.test.ts`** (update):
  - Add an `es` case that asserts the Spanish-formatted long date appears in the substituted output.
- **No frontend page/component test changes** — the project does not currently have Vue component tests; the visible behavior change is covered by the shared util tests + the existing render-invitation test.

### SSR considerations

- `$d()` is SSR-safe in `@nuxtjs/i18n` v10 — same locale on server and client → same string.
- For the wedding date, the noon-pin (`+ 'T12:00:00'`) makes the constructed `Date` independent of the runtime TZ, so SSR and client agree.
- Server-side `formatDate` calls don't read any browser globals.

## Risks / open questions

- **Format options are identical for both locales.** If we later want, e.g., `long` to omit the year for `es` to match Spanish typography, we'd need per-locale option maps. Out of scope for now; refactoring later is trivial.
- **`evt.date` stored as a plain `YYYY-MM-DD` string.** Code paths that pass it directly to `$d()` must wrap with the noon-pin. We document this with the `toEventDate` helper to make the right thing easy.
- **`emailSentAt` is an absolute timestamp** rendered in user TZ. If/when we want to render it in event TZ, that's a separate task.

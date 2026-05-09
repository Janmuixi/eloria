# Export guest list with RSVP details

## Goal

Allow the event organizer to download the full guest list of an event as a CSV file containing every piece of RSVP information — guest contact details, RSVP status, menu picks, allergies, and companion data — so it can be used offline for catering, seating, and printing.

## Non-goals

- XLSX or other formats. CSV only.
- Tier gating. Available to all tiers (any organizer can extract their data).
- Streaming / pagination. Tier guest limits keep the dataset small enough for in-memory generation.
- Including columns that have no schema backing (table/seat assignment, custom RSVP responses).
- Exporting only a filtered subset based on the URL query parameters of the guests page. The export is always the complete guest list.
- A new "Companions also export" toggle. Companion inclusion follows a fixed rule (see CSV row model).

## Decisions captured during brainstorming

- **Format:** CSV only (UTF-8 with BOM, CRLF line endings — best Excel compatibility).
- **Tier gating:** none. Every tier can export.
- **Scope:** all guests, regardless of `rsvpStatus`. Companions are included only if `attending = true`; non-attending or unfilled companion slots produce no row.
- **Companion layout:** one row per person (primary guest plus each attending companion). A `role` column (`primary` / `companion`) and a shared `group_id` link rows that belong to the same reservation. This keeps the column count fixed and makes filtering/sorting in Excel simple.
- **Filename:** `<event-slug>-guests-<YYYY-MM-DD>.csv`, where the date is today in UTC.
- **Code reuse:** the data-loading logic shared with `GET /api/events/[id]/guests/index.get.ts` is factored into a small util so both endpoints stay in sync as the schema evolves.

## API endpoint

**Route:** `GET /api/events/[id]/guests/export`
**File:** `server/api/events/[id]/guests/export.get.ts`

**Behavior:**

1. `requireAuth(event)` — 401 if no user.
2. Look up event by `id` + `userId` — 404 if not found / not owned.
3. Load the same payload `index.get.ts` returns (guests with companions, parsed allergies, and per-course menu picks). The shared shape is extracted into `server/utils/event-guests.ts` (`loadEventGuests(eventId: number)`).
4. Load the event's menu courses ordered by `sortOrder` (and the option name lookup) to know what `menu_*` columns to emit and how to map option ids → names.
5. Generate the CSV string in memory with a leading BOM (`﻿`) and CRLF (`\r\n`) terminators.
6. Set response headers and return the string body:
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename="<slug>-guests-<YYYY-MM-DD>.csv"`

The endpoint itself is synchronous string assembly — no streaming, no temp files.

## CSV row model

One row per **person**. The primary guest always produces one row. Each companion produces a row only if `attending === true`; pending or non-attending companion slots are omitted.

### Column order

Fixed columns first, then dynamic per-course menu columns at the end:

| # | column | primary row | companion row |
|---|---|---|---|
| 1 | `group_id` | guest.id | guest.id (same as primary) |
| 2 | `role` | `primary` | `companion` |
| 3 | `companion_position` | _(empty)_ | 1..N (`companion.position`) |
| 4 | `name` | guest.name | companion.name (empty if pending — but a pending companion is by definition not attending, so this is unreachable) |
| 5 | `email` | guest.email or empty | _(always empty)_ |
| 6 | `phone` | guest.phone or empty | _(always empty)_ |
| 7 | `rsvp_status` | `pending` / `confirmed` / `declined` | `attending` |
| 8 | `companions_allowed` | guest.companionsAllowed | _(empty)_ |
| 9 | `allergies` | formatted string (see below) | formatted string |
| 10 | `invited_at` | guest.emailSentAt or empty | _(always empty)_ |
| 11..N | `menu_<course>` (one column per course) | option name or empty | option name or empty |

### Menu column headers

Generated from `menuCourses.name` via a small slug helper:

- Lowercase
- Strip diacritics via Unicode NFD normalization (`s.normalize('NFD').replace(/\p{Diacritic}/gu, '')`)
- Replace any run of non-alphanumeric characters with a single `_`
- Trim leading/trailing `_`
- Prefix with `menu_`

Examples:
- `"Plat principal"` → `menu_plat_principal`
- `"Dessert (kid)"` → `menu_dessert_kid`
- `"Entrée"` → `menu_entree` (diacritics stripped before the alphanumeric filter; the **values** still render with accents because of the BOM)

If two courses slugify to the same header, suffix `_2`, `_3`, …

If the event has no menu, no `menu_*` columns are emitted at all.

### Allergies formatting

Reuse `parseAllergies` from `server/utils/menu-validation.ts` (already returns `{ keys: string[]; other: string }`). Format as:

- Concatenate `keys` (raw key names — `gluten`, `dairy`, etc.) and, if `other` is non-empty, append it wrapped in double quotes.
- Join with `", "`.
- Empty result if both `keys` and `other` are empty.

Example: `gluten, dairy, "shellfish bisque"` (with the inner quotes kept literal — the CSV escaper will double-quote them when needed).

We do **not** localize the allergy keys for the export. Raw keys are stable identifiers; the organizer reads them in any locale, and downstream tooling (mailing the caterer, etc.) gets unambiguous data.

### CSV escaping

Per RFC 4180:

- Quote the field if it contains `,`, `"`, `\r`, or `\n`.
- Inside a quoted field, double every `"`.
- Empty fields render as nothing (no quotes).

Implemented as a private `csvEscape(value: string | null | undefined): string` helper inside the export module. No external CSV library — the format is small enough.

### Field origin reference

| Column | Source |
|---|---|
| `group_id` | `guests.id` |
| `name` (primary) | `guests.name` |
| `name` (companion) | `companions.name` |
| `email` | `guests.email` |
| `phone` | `guests.phone` |
| `rsvp_status` (primary) | `guests.rsvpStatus` |
| `rsvp_status` (companion) | literal `"attending"` |
| `companions_allowed` | `guests.companionsAllowed` |
| `allergies` | `parseAllergies(guests.allergies)` / `parseAllergies(companions.allergies)` |
| `invited_at` | `guests.emailSentAt` (raw ISO string, empty if null) |
| `menu_<course>` | `menuOptions.name` for the option chosen by that person/course, looked up via `guestMenuChoices` (rows with `companion_id IS NULL` for primary, `companion_id = X` for companion X) |

## UI changes

In `pages/dashboard/events/[id]/guests.vue`:

1. Add a new button to the existing top-right action group, **between** "Import CSV" and "Add Guest" (so the order becomes: Export, Import CSV, Add Guest).
2. Implement as an anchor element rather than a `<button @click>` — the browser's native download flow handles the file save:
   ```html
   <a :href="exportUrl" :download="exportFilename"
      class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200"
      :class="{ 'opacity-50 pointer-events-none': !guests?.length }"
      :title="!guests?.length ? t('guests.exportEmptyHint') : undefined">
     {{ t('guests.exportCsv') }}
   </a>
   ```
3. `exportUrl` is the route literal `/api/events/${eventId}/guests/export`.
4. `exportFilename` is computed client-side as `${evt.slug}-guests-${YYYYMMDD}.csv` so it matches what the server header says (the server header is authoritative; the `download` attribute is a fallback hint).
5. Disabled visual + `pointer-events: none` when `guests.length === 0`.

### i18n keys

Add to both `i18n/lang/en.json` and `i18n/lang/es.json`:

- `guests.exportCsv` — `"Export CSV"` / `"Exportar CSV"`
- `guests.exportEmptyHint` — `"Add at least one guest to export"` / `"Añade al menos un invitado para exportar"`

## Tests

Add `server/api/__tests__/guests-export.test.ts` (new file, mirroring the layout of `guests.test.ts`):

1. **401 without auth** — request without `auth_token` cookie throws 401.
2. **404 for foreign event** — authenticated user requesting another user's event throws 404.
3. **Empty event** — returns BOM + header row, no data rows; sets `Content-Type: text/csv; charset=utf-8` and `Content-Disposition` filename matching `<slug>-guests-<today>.csv`.
4. **Single guest, no menu, no allergies** — one data row with the primary fields; no `menu_*` columns.
5. **Guest + 2 companions (1 attending, 1 pending)** — produces 2 rows total (primary + the attending companion); the pending companion is excluded.
6. **Two menu courses + per-companion picks** — two `menu_*` columns appear in `sortOrder`; primary row carries the guest's pick, companion row carries the companion's pick.
7. **Allergies formatting** — primary with `keys=['gluten','dairy']` and `other='shellfish bisque'` renders as `gluten, dairy, "shellfish bisque"`; companion with empty allergies renders as empty.
8. **CSV escaping** — guest with name `"O'Hara, Jr."` and a guest with phone containing a newline are correctly quoted.
9. **BOM present** — body starts with `﻿`.
10. **Filename date in UTC** — when `Date.now` is stubbed, the filename uses today's UTC date.

Use the existing test helpers (`createTestDb`, `createTestUser`, `createTestEvent`, `createTestGuest`) and the import pattern already in `guests.test.ts`. Resolve the new util by `await import('../../utils/event-guests')` so the mock-db pattern continues to work.

## File-by-file change list

- **NEW** `server/api/events/[id]/guests/export.get.ts` — endpoint handler.
- **NEW** `server/utils/event-guests.ts` — `loadEventGuests(eventId)` shared by `index.get.ts` and `export.get.ts`. Returns the same shape `index.get.ts` returns today.
- **MODIFY** `server/api/events/[id]/guests/index.get.ts` — call into the new util instead of inlining the join logic. Output is unchanged.
- **NEW** `server/api/__tests__/guests-export.test.ts` — tests above.
- **MODIFY** `pages/dashboard/events/[id]/guests.vue` — add Export button, `exportUrl`, `exportFilename` computed.
- **MODIFY** `i18n/lang/en.json` — add `guests.exportCsv`, `guests.exportEmptyHint`.
- **MODIFY** `i18n/lang/es.json` — same keys, Spanish translations.

## Out of scope

- XLSX export.
- Per-tier gating of the export feature.
- A "table/seat assignment" column (no such field exists; would require a separate schema change).
- Custom RSVP question/response columns (no such schema today).
- Streaming or chunked response.
- Honoring the page's `?menuOption=` / `?allergy=` query filters in the export.

# Companions replace single +1

## Goal

Generalize the per-guest "+1" model into per-guest *companions*. Today every guest implicitly has at most one optional plus-one. After this change, hosts configure how many companions each guest may bring (0–5, default 0), and the guest fills in each companion's name, attendance, menu picks, and allergies on the RSVP page.

## Non-goals

- Companions are not first-class guests: they have no email, no personal RSVP link, no independent record in the `guests` table.
- No data preservation. Existing rows in dev databases are test data and will be discarded.
- No AI / bulk-fill flows for companion data — guests fill it manually on the RSVP page.

## Decisions captured during brainstorming

- **Tier accounting:** companions count toward `tier.guestLimit`. The "seat count" enforced by the limit is `count(guests) + sum(companionsAllowed)`.
- **Reduction confirm:** when a host decreases `companionsAllowed` and the dropped companion has any data filled in, the admin UI shows a confirm dialog naming that companion. Decrements when the slot is empty are silent.
- **Per-companion attending:** each companion has its own attending toggle. The host's `rsvpStatus` (`confirmed` / `declined`) still determines whether anyone shows up; per-companion attending only matters when the host is `confirmed`.
- **Clean break migration:** the legacy `plusOne`, `plusOneName`, `plusOneAllergies` columns and the `forPlusOne` boolean on `guest_menu_choices` are dropped outright. Existing rows are not preserved.
- **Terminology:** "Companion" (EN) / "Acompañante" (ES). The "+1" / "Plus one" terminology is retired.
- **Admin entry point:** inline stepper `[− N +]` in a new column on the guests table. The add-guest form does not ask for companion count (defaults to 0; bumped after).
- **RSVP layout:** stacked Companion cards, one per configured slot. Each has its own attending toggle that reveals/hides name + menu + allergies fields.

## Data model

### Schema changes to `guests`

Drop:
- `plus_one INTEGER` (boolean)
- `plus_one_name TEXT`
- `plus_one_allergies TEXT`

Add:
- `companions_allowed INTEGER NOT NULL DEFAULT 0` — capped 0–5 in app code (no DB constraint).

### New table `companions`

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
guest_id        INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE
position        INTEGER NOT NULL    -- 1..N within a guest, dense
name            TEXT                -- null until guest fills RSVP
attending       INTEGER NOT NULL DEFAULT 0    -- per-companion attending flag
allergies       TEXT                -- JSON-encoded {keys, other}, same as guests.allergies
created_at      TEXT
UNIQUE (guest_id, position)
```

Companions are created lazily on RSVP submit (upsert by `(guest_id, position)`). The admin UI does not pre-create companion rows when `companionsAllowed` is bumped — empty slots have no row yet. This keeps the table free of placeholder rows for guests who never RSVP.

### Schema changes to `guest_menu_choices`

Drop:
- `for_plus_one INTEGER NOT NULL DEFAULT 0` (boolean)
- Existing unique index `guest_menu_choices_guest_course_plusone_unq` on `(guest_id, course_id, for_plus_one)`.

Add:
- `companion_id INTEGER REFERENCES companions(id) ON DELETE CASCADE`. NULL means the choice belongs to the host themselves.

Replace the unique index with two partial unique indexes:
- `guest_menu_choices_self_unq` on `(guest_id, course_id) WHERE companion_id IS NULL` — at most one self-pick per guest+course.
- `guest_menu_choices_companion_unq` on `(guest_id, course_id, companion_id) WHERE companion_id IS NOT NULL` — at most one pick per companion+course.

This is necessary because SQLite treats NULLs as distinct in unique indexes, so a single index that mixes NULL (self) and non-NULL (companion) would not enforce uniqueness on the self-pick row. Drizzle's `uniqueIndex(...).where(...)` produces partial indexes; if the builder doesn't expose `where()` cleanly for SQLite, the migration is written by hand.

## Tier limit accounting

Define `seats(event) = count(guests for event) + sum(companions_allowed for guests in event)`. The constraint is `seats(event) ≤ tier.guestLimit` (when `tier.guestLimit IS NOT NULL`).

Affected code paths:
- `POST /api/events/[id]/guests` — adding a guest costs 1 seat (companions default to 0).
- `POST /api/events/[id]/guests/import` — each CSV row costs 1 seat. Companion count is not parsed from the CSV.
- `PATCH /api/events/[id]/guests/[guestId]` (new) — increasing `companionsAllowed` from `oldN` to `newN` requires `seats(event) − oldN + newN ≤ tier.guestLimit`. Decreasing is unconditionally allowed.

The header counter on `pages/dashboard/events/[id]/guests.vue` switches from a guest count to a seat count: e.g. *"12 / 50 seats"* instead of *"12 / 50 guests"*. The unlimited variant follows suit.

## API surface

### New: `PATCH /api/events/[id]/guests/[guestId]`

Body: `{ companionsAllowed: number }` (integer 0–5).

- Authenticates as event owner (same pattern as the rest of `/api/events/[id]/*`).
- Validates `0 ≤ companionsAllowed ≤ 5`.
- On increase: enforces the seat-based tier limit. Returns `403` with the same error shape as today's add-guest 403 if it busts.
- On decrease: deletes companion rows whose `position > companionsAllowed`. The `ON DELETE CASCADE` on `guest_menu_choices.companion_id` cleans up their picks.
- Atomic transaction. Returns the updated guest record (including the surviving companions array).

### Modified: `GET /api/events/[id]/guests`

Each guest in the response now includes:
- `companionsAllowed: number`
- `companions: Array<{ id, position, name, attending, menuChoices: { [courseId]: optionId }, allergies: { keys, other } | null }>` — sorted by `position` ascending.

Removed: `plusOne`, `plusOneName`, `plusOneAllergies`, `plusOneMenuChoices`.

### Modified: `GET /api/rsvp/[token]`

Replaces `plusOne`, `plusOneName`, `plusOneChoices`, `plusOneAllergies` with:
- `companionsAllowed: number`
- `companions: Array<{ position, name, attending, menuChoices, allergies }>` — always returns exactly `companionsAllowed` entries with positions 1..N. For positions that have no row yet, fields are zero-valued (`name: null`, `attending: false`, `menuChoices: {}`, `allergies: null`). The synthesis happens in the handler; no rows are written on read.

### Modified: `POST /api/rsvp/[token]`

Body adds `companions: Array<{ position, attending, name, menuChoices, allergies }>`. Removes `plusOne`, `plusOneName`, `plusOneMenuChoices`, `plusOneAllergies`.

Validation rules:
- The companions array must have exactly `companionsAllowed` entries with distinct positions covering 1..N. Any missing or extra position → `400`.
- For each companion with `attending = true` (only enforced when the host's `rsvpStatus = confirmed`):
  - `name` required, non-empty after trim.
  - If a menu exists: `menuChoices` must contain a valid pick for every course (same validation the current `plusOneMenuChoices` path uses).
  - If `allergiesEnabled`: allergies validated via the existing `validateAllergies` helper.
- For each companion with `attending = false`: name is cleared, menu choices for that companion are deleted, allergies cleared.
- When `rsvpStatus = declined`: all companion data is cleared regardless of body content.

Persistence is one transaction:
1. Update `guests` row (`rsvp_status`, plus `allergies` if applicable; legacy `plusOne*` fields are gone).
2. Upsert `companions` rows for every `(guest_id, position)` with the body's data.
3. Delete and re-insert `guest_menu_choices` rows for this guest (matches the current "replace all picks" pattern), now with `companion_id` set per pick (or NULL for the host's own).

## Admin UI

### `pages/dashboard/events/[id]/guests.vue`

- New column **Companions** between Email and RSVP, rendering a stepper `[−] N [+]` (0–5):
  - `+`: optimistic increment, `PATCH` to the new endpoint. On `403`, revert and surface the existing limit-reached error pattern (red banner + "Upgrade plan" CTA), with the new `guests.seatLimitReached` key.
  - `−`: if `position = N` has any data (any of: `name` non-null, `attending = true`, allergies present, any menu pick), show a confirm dialog naming them. Otherwise decrement silently. The confirm uses `guests.confirmRemoveCompanion` / `guests.confirmRemoveCompanionUnnamed`.
  - At cap (5), `+` is disabled. At 0, `−` is disabled.
- Header counter switches to seat count: e.g. *"12 / 50 seats"* — uses new keys `guests.seatCount` / `guests.seatCountUnlimited` (replacing `guests.guestCount` / `guests.guestCountUnlimited`).
- Expand-for-details panel: replaces the single +1 block with one block per configured companion slot (positions 1..`companionsAllowed`). Slots with submitted data render as *"Companion {n} — {name}"* followed by per-course menu picks and allergies. Slots configured but not yet RSVP'd render as *"Companion {n} — pending"* with no body.
- `filteredGuests` (existing menu-option / allergy filters): scans every companion's `menuChoices` and `allergies` in addition to the guest's own.

### Add-guest form / CSV import

No changes. New guests start with `companionsAllowed = 0`; the host bumps it after.

## RSVP UI

### `pages/i/[slug].vue`

When `companionsAllowed > 0` and the guest selects "confirmed":
- Render N stacked Companion cards, one per position 1..N.
- Each card:
  - Header: *"Companion {n}"* (uses `rsvp.companion.label`).
  - "Will {label} attend?" yes/no toggle (`rsvp.companion.attendingQuestion` — interpolates either the entered name once typed, or the position label).
  - When attending = true: name input → menu form (per-course radio groups, same as today's plus-one menu) → allergies form (when enabled).
  - When attending = false: rest of the card is hidden; on submit those fields are sent empty.
- When the host's RSVP is "declined", the entire companions section is hidden — same control flow as today's plus-one section.
- Submit body: `companions: [{ position, attending, name, menuChoices, allergies }]` for positions 1..N.

## i18n

### Removed keys (EN + ES)

- `guests.plusOne`
- `guests.plusOneWithName`
- `guests.guestCount`
- `guests.guestCountUnlimited`
- `guests.guestLimitReached`
- `guests.importLimitExceeded` (text references "guests" — re-worded for seats)
- `rsvp.menu.plusOneTitle`
- `rsvp.allergies.plusOneTitle`
- Any other key whose value mentions "plus one" / "+1" / "acompañante" used in the +1-specific sense.

### New keys

- `guests.companion` — "Companion" / "Acompañante"
- `guests.companions` — "Companions" / "Acompañantes" (table column header)
- `guests.companionLabel` — "Companion {n}" / "Acompañante {n}" (admin detail headings)
- `guests.companionWithName` — "Companion {n} — {name}" / "Acompañante {n} — {name}"
- `guests.companionPending` — "Companion {n} — pending" / "Acompañante {n} — pendiente"
- `guests.confirmRemoveCompanion` — "Remove Companion {n} ({name})? Their RSVP info will be deleted."
- `guests.confirmRemoveCompanionUnnamed` — "Remove Companion {n}? Their RSVP info will be deleted."
- `guests.seatCount` — "{current} / {limit} seats" / "{current} / {limit} plazas"
- `guests.seatCountUnlimited` — "{current} seats" / "{current} plazas"
- `guests.seatLimitReached` — replaces `guests.guestLimitReached`, wording uses "seats"
- `guests.importSeatLimitExceeded` — replaces `guests.importLimitExceeded`
- `rsvp.companion.label` — "Companion {n}" / "Acompañante {n}"
- `rsvp.companion.attendingQuestion` — "Will {label} attend?" / "¿Asistirá {label}?"
- `rsvp.companion.namePlaceholder` — "Their full name" / "Su nombre completo"
- `rsvp.companion.menuTitle` — "Menu — Companion {n}" / "Menú — Acompañante {n}"
- `rsvp.companion.allergiesTitle` — "Allergies — Companion {n}" / "Alergias — Acompañante {n}"

## Tests

### `server/api/__tests__/guests.test.ts`

- `PATCH` endpoint:
  - Valid increase within seat limit → 200, persisted.
  - Increase that would bust seat limit → 403.
  - Decrease that drops a companion with menu picks → companion row and its menu choice rows gone.
  - Out-of-range value (`-1`, `6`) → 400.
- Existing add-guest limit tests: assert seat-based accounting (a guest with 2 companions counts as 3 seats).

### `server/api/__tests__/rsvp.test.ts`

Replace plus-one cases with:
- `companionsAllowed = 0`: companions array must be empty; non-empty body → 400.
- `companionsAllowed = 2`, both attending: companions persisted with names, menu picks, allergies.
- `companionsAllowed = 2`, mixed attending: only the attending one keeps data; the other is cleared.
- Missing position → 400; duplicate position → 400; out-of-range position → 400.
- Attending companion with empty name → 400.
- `rsvpStatus = declined`: all companion data cleared regardless of body.

### `server/api/__tests__/menu.test.ts`

- Menu summary aggregates picks from companions in addition to the host. A guest with 2 attending companions ordering the same option counts that option 3 times.

### `server/__helpers__/db.ts`

- Mirror the new schema (drop `plusOne*`, drop `forPlusOne`, add `companions` table, add `companions_allowed` column, add new partial unique indexes on `guest_menu_choices`).

## Migration

Single Drizzle migration (`0007_*.sql`):
1. `ALTER TABLE guests DROP COLUMN plus_one;`
2. `ALTER TABLE guests DROP COLUMN plus_one_name;`
3. `ALTER TABLE guests DROP COLUMN plus_one_allergies;`
4. `ALTER TABLE guests ADD COLUMN companions_allowed INTEGER NOT NULL DEFAULT 0;`
5. `CREATE TABLE companions (...);` with the unique `(guest_id, position)` index.
6. Drop the existing `guest_menu_choices_guest_course_plusone_unq` index.
7. `ALTER TABLE guest_menu_choices DROP COLUMN for_plus_one;`
8. `ALTER TABLE guest_menu_choices ADD COLUMN companion_id INTEGER REFERENCES companions(id) ON DELETE CASCADE;`
9. Create the two partial unique indexes on `guest_menu_choices`.

Note: SQLite's `ALTER TABLE DROP COLUMN` requires SQLite ≥ 3.35. If the project's runtime is older, the migration becomes the standard SQLite "create new table → copy → drop old → rename" dance for the affected tables. Confirm during implementation.

## Risks and rough edges

- **Partial unique indexes in Drizzle:** if the SQLite builder doesn't expose `.where()` for unique indexes, the migration is hand-written. The schema file still declares the indexes for documentation but uses `sql\`...\`` for the `WHERE` clause — verify in implementation.
- **Empty companion rows on read:** the GET response synthesizes empty entries for unconfigured positions. The host's frontend must not send those synthesized entries back as "real" companions in a non-RSVP context (this only matters for the RSVP page, which is fine — it always submits the full N-entry array).
- **Tier seat accounting on existing events:** if a host upgrades their tier, their seat count is the same; no migration of seats needed since `companions_allowed` defaults to 0.
- **CSV import does not set companion count:** documented intentional limitation. If hosts want bulk-set companion counts, that's a follow-up.

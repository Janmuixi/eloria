# Decouple allergies from menu in event configuration

**Date:** 2026-05-06
**Branch:** `feat/menu-rsvp` (builds on the in-flight menu work)

## Problem

The current event-creation flow has a single toggle, `Include menu selection`,
that controls both the menu builder and the dietary-allergies form on the
guest RSVP page. Couples who do not want to offer a custom menu but still
want to know about guest allergies have no way to enable allergies alone.

## Goal

Make the allergies feature an independent setting, so an event can have
allergies on, menu on, both, or neither — any combination — chosen at event
creation and editable afterwards from the event admin.

## Non-goals

- A `menuEnabled` event flag for symmetry. Menu remains "inferred from
  presence of `menuCourses` rows."
- Per-allergy required/optional fields, allergy reporting/export changes,
  or restructuring the allergen list.
- Backfilling existing menu-on events to also have allergies on. All
  existing events default to `allergiesEnabled = false` (all are test
  events).

## Data model

Add one column to the `events` table:

```
allergies_enabled  boolean  not null  default false
```

A Drizzle migration creates the column. No backfill — every existing row
takes the default `false`.

The two feature gates become:

| Feature   | Source of truth                              |
| --------- | -------------------------------------------- |
| Menu      | Existence of `menuCourses` rows for the event |
| Allergies | `events.allergiesEnabled = true`              |

Guest fields `allergies` and `plusOneAllergies` (text columns on `guests`)
do not change. Toggling `allergiesEnabled` does not delete or clear stored
allergy strings; they simply stop being displayed when the flag is off,
and re-appear if it is turned back on.

## UI surfaces

### Event creation wizard — `pages/dashboard/events/new.vue`

Add a second checkbox `Ask for allergies` next to the existing
`Include menu selection` toggle, on the same wizard step. Independent
state — either, both, or neither can be checked. New form field
`askAllergies: boolean`, sent to the create-event API alongside `offerMenu`
and the menu tree.

### Event admin — `Menu & dietary` tab

Rename the existing `Menu` tab to `Menu & dietary`. Above the menu
builder, show a small card/switch for the allergies toggle. Toggling it
issues a PUT/PATCH to the event endpoint to flip `allergiesEnabled`. The
menu builder below stays as-is.

### Guest RSVP page — `pages/i/[slug].vue`

Move the `MenuAllergyPicker` (allergies block) out of the
`v-if="guestData?.menu"` conditional. Final render conditions:

- Menu picker section: shows iff `guestData.menu` exists.
- Allergies section: shows iff `event.allergiesEnabled === true`.

Both sections render independently. When both are on, they stack
menu-first — the order they have today.

### Admin guest views

Per-guest detail view and the guests-tab summary currently show allergies
columns/fields. Wrap those bits in `v-if="event.allergiesEnabled"` so the
feature toggle is uniform across the admin — when allergies is off, no
empty allergy UI appears anywhere.

## Server-side & API

### Migration

Drizzle migration adds `allergies_enabled boolean not null default false`
to `events`.

### Event endpoints

- **Create event** (`POST /api/events`): accept `allergiesEnabled` in the
  payload, persist it. Independent of any menu courses passed in.
- **Update event** (existing `PUT/PATCH` for the event admin): accept
  `allergiesEnabled` so the admin toggle can flip it without touching menu
  courses. If no generic event-update endpoint exists yet, add a minimal
  one (or a dedicated `PATCH /api/events/[id]/allergies-enabled`) — the
  implementation plan picks the cleanest fit with current patterns.

### RSVP GET — `server/api/rsvp/[token].get.ts`

Add `allergiesEnabled: boolean` to the response so the page knows whether
to render the allergies block. Continue returning existing `allergies`
and `plusOneAllergies` values when the flag is on. Return them as `null`
when the flag is off (defense-in-depth — the client never sees stale data
for a disabled feature).

### RSVP POST — `server/api/rsvp/[token].post.ts`

Decouple the two validations:

- Menu picks: validated and persisted iff `isConfirming && hasMenu`
  (unchanged).
- Allergies: validated and persisted iff `isConfirming && event.allergiesEnabled`,
  regardless of menu state. When `allergiesEnabled` is false, ignore any
  allergy fields the client sends (do not persist them).

### Render-invitation utility

No changes — `server/utils/render-invitation.ts` does not touch menu or
allergies today.

## i18n

Add to `i18n/lang/en.json` and `i18n/lang/es.json`:

| Key                              | EN                                       | ES (placeholder; final wording in PR) |
| -------------------------------- | ---------------------------------------- | ------------------------------------- |
| `menu.wizard.askAllergies`       | "Ask for allergies"                      | "Preguntar alergias"                  |
| `menu.wizard.askAllergiesHint`   | helper text under the wizard checkbox    | (translated)                          |
| `menu.allergies.toggleLabel`     | label of the admin-tab allergies toggle  | (translated)                          |
| `menu.allergies.toggleHint`      | helper text for the admin-tab toggle     | (translated)                          |

Edit existing `menu.tab.label` to `Menu & dietary` / `Menú y dietas`.

Existing `rsvp.allergies.*` and `allergies.*` keys (allergen options,
placeholders) stay unchanged.

## Edge cases

- **Plus-one allergies** follow the same gate as primary-guest allergies
  (asked iff `allergiesEnabled` is true and a plus-one is present). Same
  as today.
- **Toggling OFF after RSVPs are in:** stored `allergies` /
  `plusOneAllergies` strings remain in the database but stop appearing in
  admin views. Re-enabling shows them again. No auto-clear, no data loss.
- **Toggling ON mid-flow:** already-submitted RSVPs have empty allergy
  fields; no re-prompting. New RSVPs collect allergies normally.

## Out of scope

- `menuEnabled` flag on the event row (menu stays inferred from courses).
- Allergy-required validation (allergies remain optional input).
- Reporting / CSV export changes.

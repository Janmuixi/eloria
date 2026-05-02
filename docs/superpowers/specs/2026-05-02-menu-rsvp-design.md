# Menu Selection & Allergy Reporting — Design Spec

**Date:** 2026-05-02
**Status:** Approved (pending implementation)

## Goal

Let couples optionally define a multi-course menu for their wedding event. When a menu is configured, guests pick one option per course while RSVPing and report any allergies or dietary restrictions. The couple sees both per-guest preferences and aggregated catering totals on the dashboard.

## Non-goals

- Editing an RSVP after submission (matches existing behavior).
- Couples assigning menus on behalf of guests.
- Capacity limits per option (e.g. "only 30 Beef available").
- Exporting menu summaries to PDF/CSV (possible follow-up).
- Showing menu options on the printed invitation itself.

## Product decisions (from brainstorming)

| Question | Decision |
|---|---|
| Menu structure | Multi-course; couple defines course names ("First course", "Second course"…), each with its own options. |
| Plus-one picks | Plus-one picks separately and reports separate allergies. |
| Where couple manages it | New dedicated **Menu** tab on the event detail page. |
| How couple sees preferences | Aggregated counts on Menu tab **and** per-guest detail on Guests tab. |
| Allergy capture | Preset checkboxes (`nuts`, `gluten`, `dairy`, `shellfish`, `eggs`, `vegetarian`, `vegan`) plus free-text "other". |
| Tier gating | None — feature available to all events. |
| Per-course pick required? | Yes. If a course exists, the guest must pick to submit. Allergies stay optional. |
| Show in creation wizard? | Yes, in step 1 (Event details) behind an opt-in checkbox: "Offer a menu for your guests *(You can do this later)*". |

## Schema

Three new tables. One column added to `guests`, one parallel column for the plus-one.

```ts
// menu_courses — couple-defined courses per event
menu_courses {
  id:        integer pk
  eventId:   integer FK → events.id        (cascade on delete)
  name:      text                            // e.g. "First course"
  sortOrder: integer
  createdAt: text
}

// menu_options — options within a course
menu_options {
  id:        integer pk
  courseId:  integer FK → menu_courses.id   (cascade on delete)
  name:      text                            // e.g. "Beef Wellington"
  sortOrder: integer
  createdAt: text
}

// guest_menu_choices — picks; one row per (guest, course, forPlusOne)
guest_menu_choices {
  id:         integer pk
  guestId:    integer FK → guests.id           (cascade)
  courseId:   integer FK → menu_courses.id     (cascade)
  optionId:   integer FK → menu_options.id     (set null on delete)
  forPlusOne: integer (boolean, default false)
  createdAt:  text
  // unique (guestId, courseId, forPlusOne)
}

// guests — add allergy fields
guests {
  …existing…
  allergies:        text   // nullable. JSON when set: { keys: string[], other: string }. NULL = guest didn't fill the section.
  plusOneAllergies: text   // same shape
}
```

**Allergen keys** are a fixed enum living in code (TypeScript const), not in the database:
`nuts | gluten | dairy | shellfish | eggs | vegetarian | vegan`. Plus a free-text `other` string capped at 200 characters. Labels are translated via i18n keys (`allergies.nuts`, `allergies.gluten`, …).

**Why store `courseId` on `guest_menu_choices` even though it's reachable via `optionId → menu_options.courseId`:** if the couple deletes an option a guest had picked, the dashboard should still show "Anna had no choice for First course" rather than the choice silently vanishing. With `optionId` set null and `courseId` retained, the row says "this guest had a pick for this course but the option is gone".

**Migration:** new SQL file under `server/db/migrations/`, idempotent and matching the existing migration style.

## API endpoints

### Couple side (auth-required, owner of event only)

```
GET  /api/events/[id]/menu
  → { courses: [{ id, name, sortOrder, options: [{ id, name, sortOrder }] }] }

PUT  /api/events/[id]/menu
  body: { courses: [{ id?, name, sortOrder, options: [{ id?, name, sortOrder }] }] }
  → returns saved menu with new ids

  Behavior: replaces the full menu in one transaction.
    - Existing rows keep their ids (preserves guest picks across rename / reorder).
    - Rows missing from the payload are deleted (cascading per FK rules).
    - Server validates: each course must have at least one option and a non-empty name; if any course fails validation the entire PUT is rejected with 400 and no changes are persisted.

GET  /api/events/[id]/menu/summary
  → {
      courses: [
        { id, name, options: [{ id, name, count }], unpickedConfirmedGuests: N }
      ],
      allergies: {
        keys: { nuts: 5, gluten: 2, … },
        other: [{ text: "sesame", guestIds: [1, 4] }, …]
      }
    }
```

A single PUT that takes the whole tree (rather than per-course/per-option CRUD endpoints) keeps the builder simple — the page sends current state, the server diffs and applies.

### Guest side

`GET /api/rsvp/[token]` (existing) — extend the response with:

```
{
  …existing…
  menu: { courses: [...] } | null,
  choices: { [courseId]: optionId },
  plusOneChoices: { [courseId]: optionId },
  allergies: { keys: string[], other: string } | null,
  plusOneAllergies: { keys: string[], other: string } | null
}
```

`POST /api/rsvp/[token]` (existing) — extend the body:

```
{
  rsvpStatus, plusOne, plusOneName,
  menuChoices?: { [courseId]: optionId },
  plusOneMenuChoices?: { [courseId]: optionId },
  allergies?: { keys: string[], other: string },
  plusOneAllergies?: { keys: string[], other: string }
}
```

**Server-side validation:**
- If `rsvpStatus !== 'confirmed'`: ignore all menu/allergy fields.
- If event has a menu and `rsvpStatus === 'confirmed'`: every course must have a valid pick.
- If `plusOne` is true and event has a menu: every course must also have a plus-one pick.
- If `plusOne` is false: discard any plus-one fields.
- Allergen keys must be from the allowed enum; `other` capped at 200 chars.
- `optionId` must belong to the named `courseId` and to this event.

### Event creation wizard

`POST /api/events` (existing) — add an optional `menu` field on the body:

```
{ …existing event fields…, menu?: { courses: [...] } }
```

When present, the event and menu are created in the same transaction.

## UI

### Couple — new Menu tab

`pages/dashboard/events/[id]/menu.vue`. Added to the existing tab nav: **Overview · Template · Guests · Menu · Settings**.

Two stacked sections:

**1. Menu builder** (top):
- Empty state with "Set up a menu for your guests to choose from" + "Create menu" button.
- Course list rendered as cards. Each card has:
  - Course name input (placeholder: "First course")
  - Option rows (name input + delete button)
  - "Add option" button
  - Course actions: move up / move down / delete course
- "Add course" button at the bottom.
- Single "Save" button; dirty-state indicator. Saves via `PUT /api/events/[id]/menu`.
- Before deleting a course or option that has existing picks, show a confirm: "{count} guests have picked this. Their choice will be cleared."

**2. Live summary** (below, only when menu exists and ≥ 1 confirmed guest):
- Per-course panel: option name → count + bar (e.g. `Beef Wellington · 18 · ████████`); a "No choice yet" row for confirmed guests with no pick (only happens for guests who RSVPd before the menu existed or after an option was deleted).
- Allergies panel: each preset allergen with its count; free-text "Other" entries listed verbatim with guest counts.
- Each count has a "View guests" link that jumps to the Guests tab pre-filtered (e.g. `?menuOption=12` or `?allergy=nuts`).

**Reorder UX:** simple up/down arrows, not drag-and-drop, to keep surface area small. `sortOrder` is recomputed on save.

**Components:**
- `pages/dashboard/events/[id]/menu.vue` — page shell, fetch / save state, dirty tracking
- `components/menu/MenuBuilder.vue` — the editor (course cards + reorder)
- `components/menu/MenuSummary.vue` — aggregated counts view

The same `MenuBuilder.vue` component is reused inside the creation wizard.

### Couple — overview & guests page additions

- **Overview** (`events/[id]/index.vue`): small "Menu" card. If no menu yet, "Add menu options →" CTA; if menu exists, summary line ("3 courses · 24 guests have picked").
- **Guests** (`events/[id]/guests.vue`): each guest row gains an expandable detail showing their picks per course, allergies, and plus-one's picks/allergies. Filter via query string params: `?menuOption=<id>` or `?allergy=<key>`.

### Couple — creation wizard

`pages/dashboard/events/new.vue` step 1 (Event details) gains:

- Checkbox: "Offer a menu for your guests" with helper text "(You can do this later)"
- When checked, the inline `MenuBuilder` component appears below the checkbox.
- Wizard state holds the menu in memory; submitted as the optional `menu` field on `POST /api/events`.
- Toggling the checkbox off clears the local menu state without prompting.

### Guest — invitation page

`pages/i/[slug].vue`. When the event has no menu, the page is unchanged.

When the event has a menu and the guest selects "Accept", the form expands to show, in order:

1. **Plus-one** (existing) — name input
2. **Your menu** — one block per course (course name as `<legend>`); options as required radios
3. **Plus-one's menu** (only when plus-one is ticked) — same shape, separate radio groups
4. **Allergies & dietary** — checkbox grid for the 7 preset keys plus an "Other" free-text input
5. **Plus-one's allergies** (only when plus-one is ticked) — same shape

**Submit button** is disabled until rsvpStatus is set AND every required course (own + plus-one if applicable) has a pick. Server re-validates.

**After submission**, the existing "Thank you" card replaces the form (no edit-after-submit).

**Decline path** shows no menu / allergy section.

**Re-visit while pending** (status = 'pending'): existing `watch(guestData)` block already restores form state; extend to also restore picks and allergies.

**Accessibility:** each course is a `<fieldset>` with `<legend>`. Allergy group is also a fieldset.

## i18n

New keys to add in `i18n/locales/en.json` and `es.json`:

```
menu.tab.label
menu.builder.title
menu.builder.empty
menu.builder.addCourse
menu.builder.addOption
menu.builder.coursePlaceholder
menu.builder.optionPlaceholder
menu.builder.deleteWarning            // "{count} guests have picked this. Their choice will be cleared."
menu.summary.title
menu.summary.noChoiceYet
menu.summary.viewGuests
menu.summary.allergies.title
menu.wizard.offerMenu
menu.wizard.offerMenuHint             // "You can do this later"

allergies.nuts
allergies.gluten
allergies.dairy
allergies.shellfish
allergies.eggs
allergies.vegetarian
allergies.vegan
allergies.other
allergies.otherPlaceholder

rsvp.menu.title
rsvp.menu.plusOneTitle
rsvp.menu.required
rsvp.allergies.title
rsvp.allergies.plusOneTitle
```

**Course and option names are user-supplied** — stored verbatim, never translated. The couple writes them in whatever language they want.

## Edge cases

| Case | Behavior |
|---|---|
| Couple deletes an option a guest picked | Pick row kept (`courseId` denormalized, `optionId` null); summary shows guest under "No choice yet" for that course; couple is warned before deleting. |
| Couple deletes a whole course | Cascade deletes options and choices. |
| Guest already RSVP'd before menu existed | Counted under "No choice yet" in summary; existing "Thank you" UI prevents re-edit (consistent with today's flow). |
| Guest declines | No menu/allergy section shown; no picks stored. |
| Plus-one toggled off after picking | Plus-one picks/allergies discarded server-side on submit. |
| Couple toggles wizard checkbox off after adding courses | Local wizard state cleared; nothing persisted. |

## Testing

Vitest, mirroring existing `server/api/__tests__` style:

- `events/[id]/menu.put.test.ts` — create menu, update preserving option ids on rename, delete option cascades to picks (option-side null), delete course cascades, validation (at least one option per course), ownership check.
- `events/[id]/menu/summary.get.test.ts` — counts roll up correctly across confirmed guests, allergies aggregate, free-text "other" entries listed verbatim.
- `rsvp/[token].post.test.ts` (extend existing) — picks ignored when rsvpStatus != 'confirmed', missing course pick rejects with 400, plus-one picks ignored when plusOne=false, allergen enum validation, optionId must belong to the named course and event.
- `rsvp/[token].get.test.ts` — response includes menu + existing choices when applicable.

Frontend unit tests are not currently part of the suite (no component tests in the repo today); manual verification via the dev server, plus existing API-level coverage, is the testing posture for the UI changes.

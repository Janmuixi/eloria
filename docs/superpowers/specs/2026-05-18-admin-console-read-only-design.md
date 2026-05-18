# Admin console — read-only

## Goal

Give the project owner a single place to inspect everything stored in the database: users, their tiers/subscriptions, events with full guest detail, plus static config (tiers, templates). Read-only — no mutations in this iteration.

## Non-goals

- Mutations of any kind: no edits, deletes, role grants, payment status flips.
- Impersonation / login-as-user.
- Audit log of admin reads.
- CSV export from the admin views (separate feature).
- A real RBAC / roles table. Admin access is allow-list by email.
- i18n. The admin surface is internal-only and stays in English.
- Rate limiting (already gated behind admin-only auth).

## Decisions captured during brainstorming

- **Admin auth:** `ADMIN_EMAILS` env var (comma-separated, case-insensitive). No schema change.
- **Surface:** Dashboard UI pages under `/dashboard/admin/*`, backed by `/api/admin/*` JSON endpoints.
- **Resources:** users, events, subscriptions, tiers, templates — all four categories.
- **Depth:** list views per resource + detail drill-down (click a row to see joined data).
- **Response shape:** raw rows from Drizzle `query.X.findMany({ with: { … } })` plus a few aggregate counts. No DTO layer.
- **Styling:** plain Tailwind tables matching the existing dashboard palette (ivory/charcoal/champagne).

## Admin authentication

### Util

**File:** `server/utils/admin.ts`

```ts
import type { H3Event } from 'h3'
import { requireAuth } from './auth'
import { resolveEnvVar } from './resolve-env-var'

function adminEmails(): string[] {
  const raw = resolveEnvVar('ADMIN_EMAILS', '')
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false
  return adminEmails().includes(user.email.toLowerCase())
}

export async function requireAdmin(event: H3Event) {
  const user = await requireAuth(event)
  if (!isAdmin(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
```

### Wiring

- **`.env.example`** — append `ADMIN_EMAILS=` line.
- **`nuxt.config.ts`** — add `ADMIN_EMAILS: process.env.ADMIN_EMAILS` to `runtimeConfig` (matches the pattern of other env vars).
- **`server/api/auth/me.get.ts`** — extend the response with `isAdmin: isAdmin(user)` so the dashboard layout can conditionally show the Admin nav link without an extra round trip.
- **`composables/useAuth.ts`** — extend the local `User` interface with `isAdmin: boolean`. The composable already assigns `user.value = data.user` from `/api/auth/me`, so widening the type plus extending the API response is enough for `user.value.isAdmin` to be available everywhere.

## API endpoints

All routes:
- Live under `server/api/admin/`.
- Are `GET` only.
- Call `requireAdmin(event)` first (401 if unauthenticated, 403 if not in `ADMIN_EMAILS`).
- Return JSON (no streaming, no special headers).

### Paginated list endpoints

Each accepts `limit` (default 50, max 200) and `offset` (default 0) query params. The list response is:

```ts
{ rows: T[], total: number, limit: number, offset: number }
```

`total` is a `count(*)` over the same filters (no offset/limit). The UI uses it to render "Showing X–Y of Z" and to enable/disable the next-page button.

**`GET /api/admin/users`** — `server/api/admin/users/index.get.ts`

Query params:
- `limit`, `offset` — as above.
- `q` — optional substring match against `users.email` OR `users.name` (case-insensitive `LIKE %q%`).

Each row shape:
```ts
{
  id, email, name, emailVerified, googleId, stripeCustomerId, createdAt,
  eventCount: number,                      // count of events.user_id = users.id
  activeSubscription: {                    // null if none with status='active'
    id, status, price, currentPeriodEnd, canceledAt
  } | null
}
```

Ordering: `createdAt DESC`.

**`GET /api/admin/events`** — `server/api/admin/events/index.get.ts`

Query params:
- `limit`, `offset`.
- `q` — substring match against `events.title` or the joined `users.email` (case-insensitive).
- `paymentStatus` — exact match against `events.paymentStatus` (one of `pending`, `paid`, `locked`, etc.). Empty string or missing means no filter.

Each row shape:
```ts
{
  id, title, coupleName1, coupleName2, date, venue, slug,
  paymentStatus, invitationType, language, createdAt,
  user: { id, email, name },
  tier: { id, slug, name } | null,
  template: { id, slug, name } | null,
  guestCount: number
}
```

Ordering: `createdAt DESC`.

**`GET /api/admin/subscriptions`** — `server/api/admin/subscriptions/index.get.ts`

Query params:
- `limit`, `offset`.
- `status` — exact match against `subscriptions.status`. Empty/missing means no filter.

Each row shape:
```ts
{
  id, stripeSubscriptionId, stripeCustomerId, status, price,
  currentPeriodStart, currentPeriodEnd, canceledAt, createdAt,
  user: { id, email, name }
}
```

Ordering: `createdAt DESC`.

### Static config endpoints (no pagination)

**`GET /api/admin/tiers`** — `server/api/admin/tiers/index.get.ts`

Returns the full `tiers` table ordered by `sortOrder ASC`. Plain rows, no joins. (No pagination; there are <10 tiers.)

**`GET /api/admin/templates`** — `server/api/admin/templates/index.get.ts`

Returns the full `templates` table with the minimum-tier slug joined:
```ts
{
  id, name, slug, category, colorScheme, fontPairings, tags, createdAt,
  minimumTier: { id, slug, name }
}
```

The bulky `htmlTemplate` and `cssTemplate` fields are **omitted** from the list response (kept off the wire — they're large and not useful in a table view). They'd be re-fetched on a future template detail page if needed; not required for this iteration.

Ordering: `category ASC, name ASC`.

### Detail drill-down endpoints

**`GET /api/admin/users/[id]`** — `server/api/admin/users/[id].get.ts`

Returns:
```ts
{
  user: { …full users row including passwordHash:null elided, but keep resetToken redacted to 'set'|null… },
  events: Array<{ id, title, date, paymentStatus, tier: { slug, name }|null, createdAt, slug, guestCount }>,
  subscriptions: Array<{ …full subscriptions row… }>
}
```

Redaction rules:
- `passwordHash` — replaced with `null` (presence only matters here, and only via the `hasPassword: boolean` field added alongside).
- `resetToken` — replaced with `null` (and add `hasResetToken: boolean`).
- All other fields returned raw.

404 if user not found.

**`GET /api/admin/events/[id]`** — `server/api/admin/events/[id].get.ts`

Returns:
```ts
{
  event: { …full events row… },
  owner: { id, email, name },
  tier: { …full tiers row… } | null,
  template: { id, slug, name, category } | null,         // no html/css here either
  guests: ReturnType<typeof loadEventGuests>,            // already returns guests + companions + menu choices
  menu: Array<{ id, name, sortOrder, options: Array<{ id, name, sortOrder }> }>
}
```

`loadEventGuests` is the existing util at `server/utils/event-guests.ts` — reused as-is so the admin view always shows the same guest payload the owner-facing endpoint does. No changes to that util.

The `menu` block is loaded separately (the existing util returns menu picks per guest but not the full course/option tree). Drizzle query: `db.query.menuCourses.findMany({ where: eq(menuCourses.eventId, id), orderBy: asc(sortOrder), with: { options: { orderBy: asc(sortOrder) } } })`.

404 if event not found.

### Stats endpoint

**`GET /api/admin/stats`** — `server/api/admin/stats/index.get.ts`

Returns the counters shown on the admin landing page:
```ts
{
  users: number,                    // count(*) from users
  events: number,                   // count(*) from events
  paidEvents: number,               // count(*) from events where payment_status='paid'
  activeSubscriptions: number       // count(*) from subscriptions where status='active'
}
```

One round trip, four COUNT queries. Acceptable; the dataset is small.

## UI

### Middleware

**File:** `middleware/admin.ts`

```ts
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchUser, loading } = useAuth()
  if (loading.value) await fetchUser()
  const localePath = useLocalePath()
  if (!user.value) return navigateTo(localePath('/auth/login'))
  if (!user.value.isAdmin) return navigateTo(localePath('/dashboard'))
})
```

Every admin page declares `definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })`. The chain runs `auth` first (redirect to login if unauthenticated), then `admin` (redirect to dashboard if not in allow-list). `admin` is defensive — server endpoints enforce 403 independently.

### Layout — Admin nav link

In `layouts/dashboard.vue`, add an "Admin" link wrapped in `v-if="user?.isAdmin"` in **both** nav blocks (mobile sidebar at lines ~29-45 and desktop sidebar at lines ~56-72). Targets `/dashboard/admin`. Styled the same as the other `NuxtLinkLocale` nav items. Hardcoded English label `"Admin"` (no i18n key).

### Pages

All pages live under `pages/dashboard/admin/`. All page-level data is fetched with `useFetch('/api/admin/…')` — no custom client state.

**`pages/dashboard/admin/index.vue`** — landing

- Four stat tiles: Users / Events / Paid events / Active subscriptions. Source: `/api/admin/stats`.
- Four nav cards linking to `/dashboard/admin/{users,events,subscriptions,tiers,templates}`. (Five cards; tiers and templates each get their own card.)

**`pages/dashboard/admin/users/index.vue`** — users list

- Search input bound to `q` query param (debounced 300ms via `watchDebounced` or a simple `setTimeout`).
- Table columns: id, email, name, verified (✓/—), events, active sub status, created at.
- Each row links to `/dashboard/admin/users/[id]`.
- Pagination footer: "Showing X–Y of Z" + Prev/Next buttons. Page size 50.

**`pages/dashboard/admin/users/[id].vue`** — user detail

- Section "User": labeled key/value grid of every user field (verified, `hasPassword`, `hasResetToken`, googleId, stripeCustomerId, etc.).
- Section "Subscriptions": table of that user's subscriptions.
- Section "Events": table of that user's events, each linking to `/dashboard/admin/events/[id]`.

**`pages/dashboard/admin/events/index.vue`** — events list

- Search input (`q`), status `<select>` (`paymentStatus`).
- Table columns: id, title, owner email, date, payment status, tier, guest count, created at.
- Each row links to `/dashboard/admin/events/[id]`.
- Pagination as above.

**`pages/dashboard/admin/events/[id].vue`** — event detail

- Section "Event": key/value grid of every event field, including customization JSON dumped into a `<pre>` block.
- Section "Owner": link to `/dashboard/admin/users/[ownerId]`.
- Section "Tier": tier slug + features.
- Section "Template": template slug + category (no html/css preview).
- Section "Menu": for each course, the course name and its options.
- Section "Guests": table of guests. Each row is expandable (`<details>` element or a v-show toggle) to reveal:
  - Per-course menu picks for the primary guest.
  - Companions (if any), with their attending flag, allergies, and per-course picks.

**`pages/dashboard/admin/subscriptions/index.vue`** — subscriptions list

- Status `<select>` filter.
- Table columns: id, user email, status, price, current_period_end, canceled_at, created_at.
- User-email cell links to `/dashboard/admin/users/[userId]`.
- Pagination.

**`pages/dashboard/admin/tiers/index.vue`** — tiers list

- One-shot fetch (no pagination/filters).
- Table columns: id, slug, name, price, sortOrder, guestLimit, hasEmailDelivery, hasPdfExport, hasAiTextGeneration, removeBranding, hasMultipleVariants, createdAt.
- Booleans render as ✓/—.

**`pages/dashboard/admin/templates/index.vue`** — templates list

- One-shot fetch.
- Table columns: id, slug, name, category, minimumTier slug, tags, createdAt.

### Styling notes

Reuse the existing dashboard color palette (`ivory-100`, `charcoal-700`, `champagne-500`). Tables use a simple `<table>` with `<thead>` styled `bg-ivory-100 text-charcoal-700 text-xs uppercase`. No new shared components — if a table component emerges naturally during implementation, it can be extracted, but don't pre-design one.

## Tests

### Unit — admin util

`server/utils/__tests__/admin.test.ts`:

1. `isAdmin(null)` returns false.
2. `isAdmin({ email: 'x@y.z' })` returns false when `ADMIN_EMAILS` is unset.
3. `isAdmin({ email: 'X@Y.Z' })` returns true when `ADMIN_EMAILS='x@y.z'` (case-insensitive match).
4. `isAdmin({ email: 'a@b.c' })` returns true when `ADMIN_EMAILS='  a@b.c , d@e.f  '` (whitespace + multi-entry).
5. `requireAdmin` throws 401 when unauthenticated (no cookie).
6. `requireAdmin` throws 403 when authenticated but not in the allow-list.
7. `requireAdmin` returns the user when in the allow-list.

Use `resolveEnvVar`'s existing test-mocking pattern (it's already used in the project — see `server/utils/__tests__/resolve-env-var.test.ts`).

### API — admin endpoints

`server/api/__tests__/admin.test.ts`:

For each endpoint, the same three cases:
- **401** — no `auth_token` cookie.
- **403** — authenticated user whose email is NOT in `ADMIN_EMAILS`.
- **200** — authenticated user whose email IS in `ADMIN_EMAILS`.

Then per-endpoint shape checks (one or two assertions each — not exhaustive column coverage):

- `GET /api/admin/stats` — returns numeric counters; reflects fixture state (e.g. 2 users seeded → `users: 2`).
- `GET /api/admin/users` — returns `{rows, total, limit, offset}`; `rows[0].eventCount` and `activeSubscription` reflect joined fixture data; `q` filter narrows results; pagination respects `limit`/`offset`.
- `GET /api/admin/users/[id]` — returns redacted user (`passwordHash: null`, `hasPassword: true`), plus the user's events and subscriptions; 404 for unknown id.
- `GET /api/admin/events` — `{rows, total, limit, offset}`; `rows[0].user.email` joined correctly; `paymentStatus` filter narrows results.
- `GET /api/admin/events/[id]` — returns event + owner + tier + template + guests (delegated to `loadEventGuests`) + menu tree; 404 for unknown id.
- `GET /api/admin/subscriptions` — `{rows, total, limit, offset}`; `status` filter narrows results.
- `GET /api/admin/tiers` — array of all tiers ordered by `sortOrder`.
- `GET /api/admin/templates` — array of all templates, includes `minimumTier.slug`, omits `htmlTemplate` and `cssTemplate`.

Use the existing test helpers (`createTestDb`, `createTestUser`, `createTestEvent`, `createTestGuest`) and the import pattern already in `events.test.ts` / `guests-export.test.ts`. Mock `ADMIN_EMAILS` per-test via the same env-mocking approach already in the project.

No UI tests — consistent with the project's current testing surface (no Vue page is unit-tested today).

## File-by-file change list

- **NEW** `server/utils/admin.ts` — `isAdmin`, `requireAdmin`.
- **NEW** `server/utils/__tests__/admin.test.ts` — util tests.
- **NEW** `server/api/admin/stats/index.get.ts` — counters.
- **NEW** `server/api/admin/users/index.get.ts` — paginated users list.
- **NEW** `server/api/admin/users/[id].get.ts` — user detail.
- **NEW** `server/api/admin/events/index.get.ts` — paginated events list.
- **NEW** `server/api/admin/events/[id].get.ts` — event detail.
- **NEW** `server/api/admin/subscriptions/index.get.ts` — paginated subscriptions list.
- **NEW** `server/api/admin/tiers/index.get.ts` — tiers list.
- **NEW** `server/api/admin/templates/index.get.ts` — templates list (without html/css).
- **NEW** `server/api/__tests__/admin.test.ts` — endpoint tests.
- **NEW** `middleware/admin.ts` — client-side admin gate.
- **NEW** `pages/dashboard/admin/index.vue` — landing.
- **NEW** `pages/dashboard/admin/users/index.vue` — users list.
- **NEW** `pages/dashboard/admin/users/[id].vue` — user detail.
- **NEW** `pages/dashboard/admin/events/index.vue` — events list.
- **NEW** `pages/dashboard/admin/events/[id].vue` — event detail.
- **NEW** `pages/dashboard/admin/subscriptions/index.vue` — subscriptions list.
- **NEW** `pages/dashboard/admin/tiers/index.vue` — tiers list.
- **NEW** `pages/dashboard/admin/templates/index.vue` — templates list.
- **MODIFY** `nuxt.config.ts` — register `ADMIN_EMAILS` in `runtimeConfig`.
- **MODIFY** `.env.example` — add `ADMIN_EMAILS=` line.
- **MODIFY** `server/api/auth/me.get.ts` — include `isAdmin` flag in response.
- **MODIFY** `layouts/dashboard.vue` — show "Admin" nav link when `user.isAdmin`.
- **MODIFY** `composables/useAuth.ts` — add `isAdmin: boolean` to the `User` interface.

## Open considerations (deferred, not in this spec)

- Mutations: editing a user's email, flipping `paymentStatus`, refunding a subscription, etc. — all explicitly out of scope, but if/when added, they'd live alongside these endpoints as `PUT/DELETE` routes guarded by the same `requireAdmin`.
- Per-tier guest counts and revenue rollups on the stats page.
- CSV/JSON export of admin tables.
- A real audit log of admin reads.
- Bulk operations (delete N orphan events, resend N verification emails, …).
- Admin role stored in the DB (`users.is_admin` column) once there's a need for more than one admin and code/deploy edits become friction.

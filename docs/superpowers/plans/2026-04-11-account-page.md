# Account Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/dashboard/account` page that shows the authenticated user's name, email, and total number of events created, accessible via a new "My Account" sidebar link.

**Architecture:** New `GET /api/auth/me/stats` endpoint counts the user's events from the DB. The account page reads user data from the existing `useAuth()` composable and fetches the event count from the new endpoint. A new sidebar nav link is added to `layouts/dashboard.vue`.

**Tech Stack:** Nuxt 3, Vue 3 (Composition API), Drizzle ORM, better-sqlite3 (tests), Vitest, i18next (vue-i18n)

---

## File Map

| Action | File |
|---|---|
| Modify | `i18n/lang/en.json` |
| Modify | `i18n/lang/es.json` |
| Create | `server/api/auth/me/stats.get.ts` |
| Modify | `server/api/__tests__/auth.test.ts` |
| Modify | `layouts/dashboard.vue` |
| Create | `pages/dashboard/account.vue` |

---

## Task 1: Add i18n keys

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Add keys to `en.json`**

In `i18n/lang/en.json`, add `"myAccount"` inside the existing `"nav"` object and add a new top-level `"account"` object. The file currently ends the `"nav"` block at line 30 with `"getStarted": "Get Started"`.

```json
  "nav": {
    "templates": "Templates",
    "pricing": "Pricing",
    "dashboard": "Dashboard",
    "signIn": "Sign in",
    "signOut": "Sign out",
    "getStarted": "Get Started",
    "myAccount": "My Account"
  },
```

And add after the `"nav"` block (after line 30, before `"footer"`):

```json
  "account": {
    "title": "My Account",
    "name": "Name",
    "email": "Email",
    "eventsCreated": "Events Created"
  },
```

- [ ] **Step 2: Add keys to `es.json`**

Same structure in `i18n/lang/es.json`:

```json
  "nav": {
    "templates": "Plantillas",
    "pricing": "Precios",
    "dashboard": "Panel",
    "signIn": "Iniciar sesión",
    "signOut": "Cerrar sesión",
    "getStarted": "Comenzar",
    "myAccount": "Mi cuenta"
  },
```

```json
  "account": {
    "title": "Mi cuenta",
    "name": "Nombre",
    "email": "Correo electrónico",
    "eventsCreated": "Eventos creados"
  },
```

- [ ] **Step 3: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "feat: add i18n keys for account page"
```

---

## Task 2: API endpoint — GET /api/auth/me/stats

**Files:**
- Create: `server/api/auth/me/stats.get.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// server/api/auth/me/stats.get.ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.userId, user.id))

  return { eventCount }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/auth/me/stats.get.ts
git commit -m "feat: add GET /api/auth/me/stats endpoint"
```

---

## Task 3: Tests for GET /api/auth/me/stats

**Files:**
- Modify: `server/api/__tests__/auth.test.ts`

- [ ] **Step 1: Update imports in the test file**

In `server/api/__tests__/auth.test.ts`, update the helpers import (line 3) to include `createTestEvent`:

```typescript
import { createTestDb, createTestUser, createTestEvent, type TestDb } from '../../__helpers__/db'
```

Then alongside the other handler imports (around line 22–24), add:

```typescript
const statsHandler = (await import('../auth/me/stats.get')).default
```

- [ ] **Step 2: Write failing tests**

At the end of the `describe('Auth API', ...)` block in `server/api/__tests__/auth.test.ts`, add:

```typescript
describe('GET /api/auth/me/stats', () => {
  it('returns event count of 0 when user has no events', async () => {
    const user = await createTestUser(testDb, { email: 'stats-zero@example.com' })
    const event = authEvent(user.id, user.email)

    const result = await statsHandler(event)

    expect(result.eventCount).toBe(0)
  })

  it('returns correct event count for a user with events', async () => {
    const user = await createTestUser(testDb, { email: 'stats-events@example.com' })
    createTestEvent(testDb, user.id)
    createTestEvent(testDb, user.id)
    const event = authEvent(user.id, user.email)

    const result = await statsHandler(event)

    expect(result.eventCount).toBe(2)
  })

  it('only counts events belonging to the authenticated user', async () => {
    const user = await createTestUser(testDb, { email: 'stats-owner@example.com' })
    const otherUser = await createTestUser(testDb, { email: 'stats-other@example.com' })
    createTestEvent(testDb, user.id)
    createTestEvent(testDb, otherUser.id)
    createTestEvent(testDb, otherUser.id)
    const event = authEvent(user.id, user.email)

    const result = await statsHandler(event)

    expect(result.eventCount).toBe(1)
  })

  it('rejects unauthenticated requests with 401', async () => {
    const event = createMockEvent({})

    await expect(statsHandler(event)).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd /home/jmg/projects/weddingplanner && npx vitest run server/api/__tests__/auth.test.ts
```

Expected: all tests pass, including the 4 new stats tests.

- [ ] **Step 4: Commit**

```bash
git add server/api/__tests__/auth.test.ts
git commit -m "test: add tests for GET /api/auth/me/stats"
```

---

## Task 4: Add "My Account" sidebar link

**Files:**
- Modify: `layouts/dashboard.vue`

- [ ] **Step 1: Add link to desktop sidebar**

In `layouts/dashboard.vue`, inside the desktop `<nav>` block (around line 45–56), add after the "Create Event" link:

```html
<NuxtLink to="/dashboard/account"
  class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
  active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
  {{ t('nav.myAccount') }}
</NuxtLink>
```

- [ ] **Step 2: Add link to mobile sidebar**

In `layouts/dashboard.vue`, inside the mobile `<nav>` block (around line 25–35), add after the "Create Event" link:

```html
<NuxtLink to="/dashboard/account" @click="sidebarOpen = false"
  class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
  active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
  {{ t('nav.myAccount') }}
</NuxtLink>
```

- [ ] **Step 3: Commit**

```bash
git add layouts/dashboard.vue
git commit -m "feat: add My Account link to dashboard sidebar"
```

---

## Task 5: Account page

**Files:**
- Create: `pages/dashboard/account.vue`

- [ ] **Step 1: Create the page**

```vue
<!-- pages/dashboard/account.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { user } = useAuth()
const { data: stats } = await useFetch('/api/auth/me/stats')
</script>

<template>
  <div>
    <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-6">{{ t('account.title') }}</h1>

    <div class="bg-white border border-charcoal-200 rounded-2xl p-6 max-w-lg">
      <div class="mb-5">
        <p class="text-xs font-semibold text-charcoal-400 uppercase tracking-wide mb-1">{{ t('account.name') }}</p>
        <p class="text-sm text-charcoal-900">{{ user?.name }}</p>
      </div>
      <div class="mb-5">
        <p class="text-xs font-semibold text-charcoal-400 uppercase tracking-wide mb-1">{{ t('account.email') }}</p>
        <p class="text-sm text-charcoal-900">{{ user?.email }}</p>
      </div>
      <div>
        <p class="text-xs font-semibold text-charcoal-400 uppercase tracking-wide mb-1">{{ t('account.eventsCreated') }}</p>
        <p class="text-sm text-charcoal-900">{{ stats?.eventCount ?? '—' }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/account.vue
git commit -m "feat: add account page at /dashboard/account"
```

---

## Verification

- [ ] Start the dev server: `npm run dev`
- [ ] Log in and navigate to `/dashboard/account`
- [ ] Verify name, email display correctly
- [ ] Verify event count matches the number of events in "My Events"
- [ ] Verify sidebar link highlights correctly when on the account page (champagne active state)
- [ ] Verify mobile sidebar link works and closes the overlay on click
- [ ] Run full test suite: `npx vitest run`

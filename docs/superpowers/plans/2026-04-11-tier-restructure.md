# Tier Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the old Pro one-time tier's features into Premium ($35, unlimited guests, all features) and remove the old Pro one-time tier from the codebase.

**Architecture:** Tier data lives in two places: `server/db/seed.ts` (real DB seeding) and `server/__helpers__/db.ts` (test helper). Both must be updated together. The pricing page and event wizard step 5 render tiers dynamically from the API, so they automatically reflect the new data — only their grid layout (3-column → 2-column) needs a manual fix. A pre-existing bug in the tiers test (`seedTiers(testDb).run()` called twice) is fixed as part of updating the test expectations.

**Tech Stack:** Nuxt 3, Drizzle ORM, better-sqlite3, Vitest, Tailwind CSS, vue-i18n

---

## File Map

| Action | File |
|---|---|
| Modify | `server/db/seed.ts` |
| Modify | `server/__helpers__/db.ts` |
| Modify | `server/api/__tests__/tiers.test.ts` |
| Modify | `i18n/lang/en.json` |
| Modify | `i18n/lang/es.json` |
| Modify | `pages/pricing.vue` |
| Modify | `pages/dashboard/events/new.vue` |

---

## Task 1: Update seed data

**Files:**
- Modify: `server/db/seed.ts`
- Modify: `server/__helpers__/db.ts`

- [ ] **Step 1: Update `server/db/seed.ts`**

Replace the entire `db.insert(tiers).values([...])` call (lines 12–49) with:

```typescript
  await db.insert(tiers).values([
    {
      name: 'Basic',
      slug: 'basic',
      price: 1500,
      sortOrder: 1,
      guestLimit: 50,
      hasEmailDelivery: false,
      hasPdfExport: false,
      hasAiTextGeneration: false,
      removeBranding: false,
      hasMultipleVariants: false,
    },
    {
      name: 'Premium',
      slug: 'premium',
      price: 3500,
      sortOrder: 2,
      guestLimit: null,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: true,
    },
  ]).onConflictDoNothing()
```

Changes vs. old file: Premium `price` 3000→3500, `guestLimit` 200→null, `hasMultipleVariants` false→true. Pro row removed.

- [ ] **Step 2: Update `server/__helpers__/db.ts`**

Replace the `seedTiers` function (lines 95–134):

```typescript
export function seedTiers(db: TestDb) {
  return db.insert(tiers).values([
    {
      name: 'Basic',
      slug: 'basic',
      price: 1500,
      sortOrder: 1,
      guestLimit: 50,
      hasEmailDelivery: false,
      hasPdfExport: false,
      hasAiTextGeneration: false,
      removeBranding: false,
      hasMultipleVariants: false,
    },
    {
      name: 'Premium',
      slug: 'premium',
      price: 3500,
      sortOrder: 2,
      guestLimit: null,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: true,
    },
  ]).run()
}
```

Same changes: Premium updated, Pro removed.

- [ ] **Step 3: Commit**

```bash
git add server/db/seed.ts server/__helpers__/db.ts
git commit -m "feat: update Premium tier and remove Pro one-time tier from seed data"
```

---

## Task 2: Update tiers test

**Files:**
- Modify: `server/api/__tests__/tiers.test.ts`

Note: There is a **pre-existing bug** in this test file. Line 26 calls `seedTiers(testDb).run()`, but `seedTiers` already calls `.run()` internally and returns `undefined`. Calling `.run()` on `undefined` throws `TypeError: seedTiers(...).run is not a function`. This bug must be fixed as part of this task.

- [ ] **Step 1: Update the test file**

Replace the entire content of `server/api/__tests__/tiers.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  seedTiers,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const handler = (await import('../tiers/index.get')).default

describe('Tiers API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('GET /api/tiers', () => {
    it('lists tiers in sort order', async () => {
      seedTiers(testDb)

      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Basic')
      expect(result[0].sortOrder).toBe(1)
      expect(result[1].name).toBe('Premium')
      expect(result[1].sortOrder).toBe(2)
    })

    it('returns correct Premium tier features', async () => {
      seedTiers(testDb)

      const event = createMockEvent()

      const result = await handler(event)
      const premium = result[1]

      expect(premium.price).toBe(3500)
      expect(premium.guestLimit).toBeNull()
      expect(premium.hasEmailDelivery).toBe(true)
      expect(premium.hasPdfExport).toBe(true)
      expect(premium.hasAiTextGeneration).toBe(true)
      expect(premium.removeBranding).toBe(true)
      expect(premium.hasMultipleVariants).toBe(true)
    })

    it('returns empty array when no tiers seeded', async () => {
      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toEqual([])
    })
  })
})
```

Key changes:
- `seedTiers(testDb)` — no `.run()` chained (bug fix)
- `expect(result).toHaveLength(2)` — was 3
- Pro assertions removed; replaced with a new test verifying Premium features
- Added test for Premium tier values (price $3500, unlimited guests, all features)

- [ ] **Step 2: Run the tests**

```bash
cd /home/jmg/projects/weddingplanner && npx vitest run server/api/__tests__/tiers.test.ts
```

Expected output:
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- [ ] **Step 3: Commit**

```bash
git add server/api/__tests__/tiers.test.ts
git commit -m "fix: fix seedTiers double-.run() bug and update tier test expectations"
```

---

## Task 3: Update i18n strings

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Update `en.json`**

In `i18n/lang/en.json`, find and update `pricing.seoDescription`:

Old:
```json
"seoDescription": "Simple per-event pricing for your wedding invitations. Choose from Basic, Premium, or Pro plans.",
```

New:
```json
"seoDescription": "Simple per-event pricing for your wedding invitations. Choose from Basic or Premium plans.",
```

- [ ] **Step 2: Update `es.json`**

In `i18n/lang/es.json`, find and update `pricing.seoDescription`:

Old:
```json
"seoDescription": "Precios simples por evento para tus invitaciones de boda. Elige entre los planes Básico, Premium o Pro.",
```

New:
```json
"seoDescription": "Precios simples por evento para tus invitaciones de boda. Elige entre los planes Básico o Premium.",
```

- [ ] **Step 3: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "fix: update pricing SEO description to remove Pro plan reference"
```

---

## Task 4: Update pricing page grid layout

**Files:**
- Modify: `pages/pricing.vue`

The pricing page renders a `grid-cols-3` grid. With only 2 tiers it should be `grid-cols-2` so the cards aren't stretched.

- [ ] **Step 1: Update the grid class**

In `pages/pricing.vue`, find line 50:

```html
<div v-if="tiers" class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
```

Change to:

```html
<div v-if="tiers" class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
```

Also update `formatPrice` to show Premium's billing cadence correctly. Find line 69:

```html
<span v-if="tier.price > 0" class="text-charcoal-500 text-sm ml-1">{{ $t('common.oneTime') }}</span>
```

This already correctly shows "one-time" for both Basic and Premium — no change needed.

- [ ] **Step 2: Commit**

```bash
git add pages/pricing.vue
git commit -m "fix: update pricing page grid to 2 columns for 2-tier layout"
```

---

## Task 5: Update event wizard step 5 grid layout

**Files:**
- Modify: `pages/dashboard/events/new.vue`

Step 5 of the event wizard renders a `md:grid-cols-3` grid. With only 2 tiers, update to `md:grid-cols-2`.

- [ ] **Step 1: Update the grid class**

In `pages/dashboard/events/new.vue`, find line 546 (inside `<!-- Step 5: Tier Selection & Payment -->`):

```html
<div v-else class="grid md:grid-cols-3 gap-6">
```

Change to:

```html
<div v-else class="grid md:grid-cols-2 gap-6 max-w-2xl">
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard/events/new.vue
git commit -m "fix: update payment step grid to 2 columns for 2-tier layout"
```

---

## Verification

- [ ] Run full test suite: `npx vitest run`
- [ ] Confirm tiers test passes (3/3)
- [ ] Confirm no other tests regressed (guests, auth, events tests should all still pass)
- [ ] Start dev server (`npm run dev`) and verify:
  - Pricing page shows 2 cards side by side (Basic $15, Premium $35)
  - Premium card shows "Unlimited guests" and all feature checkmarks including Multiple Variants
  - Premium card has "Most Popular" badge
  - Event wizard step 5 shows 2 cards (Basic and Premium only)

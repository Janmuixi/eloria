# Wedding Planner Subscription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a $49/month subscription for wedding planners with unlimited event creation and all Premium features.

**Architecture:** Separate `subscriptions` table tracks user subscription state. Active subscribers skip payment step during event creation. Events are locked when subscription expires. Stripe Subscriptions handles recurring billing.

**Tech Stack:** Nuxt 3, Drizzle ORM, SQLite, Stripe Subscriptions API

---

## Task 1: Add Subscription Schema

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/api/__tests__/subscriptions.test.ts`

**Step 1: Add subscriptions table to schema**

In `server/db/schema.ts`, add after the `users` table definition:

```typescript
export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  status: text('status').notNull(),
  price: integer('price').notNull(),
  currentPeriodStart: text('current_period_start'),
  currentPeriodEnd: text('current_period_end'),
  canceledAt: text('canceled_at'),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}))
```

**Step 2: Add stripeCustomerId to users table**

In `server/db/schema.ts`, add to the `users` table:

```typescript
stripeCustomerId: text('stripe_customer_id'),
```

**Step 3: Run migration**

Run: `npm run db:push`

**Step 4: Commit**

```bash
git add server/db/schema.ts
git commit -m "feat: add subscriptions table and stripeCustomerId to users"
```

---

## Task 2: Create Subscription Helper Utilities

**Files:**
- Create: `server/utils/subscription.ts`
- Create: `server/utils/__tests__/subscription.test.ts`

**Step 1: Write failing tests for subscription helper**

Create `server/utils/__tests__/subscription.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '~/server/db'
import { users, subscriptions } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { getActiveSubscription, hasActiveSubscription } from '../subscription'

describe('subscription utils', () => {
  let testUser: { id: number }

  beforeEach(async () => {
    const [user] = await db.insert(users).values({
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
      name: 'Test User',
    }).returning()
    testUser = user
  })

  describe('hasActiveSubscription', () => {
    it('returns false when user has no subscription', async () => {
      const result = await hasActiveSubscription(testUser.id)
      expect(result).toBe(false)
    })

    it('returns true when user has active subscription', async () => {
      await db.insert(subscriptions).values({
        userId: testUser.id,
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        status: 'active',
        price: 4900,
      })
      const result = await hasActiveSubscription(testUser.id)
      expect(result).toBe(true)
    })

    it('returns false when subscription is expired', async () => {
      await db.insert(subscriptions).values({
        userId: testUser.id,
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        status: 'expired',
        price: 4900,
      })
      const result = await hasActiveSubscription(testUser.id)
      expect(result).toBe(false)
    })
  })

  describe('getActiveSubscription', () => {
    it('returns null when user has no subscription', async () => {
      const result = await getActiveSubscription(testUser.id)
      expect(result).toBeNull()
    })

    it('returns subscription when active', async () => {
      await db.insert(subscriptions).values({
        userId: testUser.id,
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        status: 'active',
        price: 4900,
      })
      const result = await getActiveSubscription(testUser.id)
      expect(result).not.toBeNull()
      expect(result?.status).toBe('active')
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test server/utils/__tests__/subscription.test.ts`
Expected: FAIL - cannot find module '../subscription'

**Step 3: Implement subscription helpers**

Create `server/utils/subscription.ts`:

```typescript
import { db } from '~/server/db'
import { subscriptions } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export async function hasActiveSubscription(userId: number): Promise<boolean> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })
  return subscription?.status === 'active'
}

export async function getActiveSubscription(userId: number): Promise<{
  id: number
  status: string
  currentPeriodEnd: string | null
} | null> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })
  if (!subscription || subscription.status !== 'active') {
    return null
  }
  return {
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test server/utils/__tests__/subscription.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/utils/subscription.ts server/utils/__tests__/subscription.test.ts
git commit -m "feat: add subscription helper utilities"
```

---

## Task 3: Create Subscription Checkout Endpoint

**Files:**
- Create: `server/api/subscriptions/create-checkout.post.ts`
- Create: `server/api/__tests__/subscriptions-checkout.test.ts`

**Step 1: Write failing tests**

Create `server/api/__tests__/subscriptions-checkout.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { $fetch } from 'ofetch'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'

describe('POST /api/subscriptions/create-checkout', () => {
  let authToken: string
  let testUser: { id: number }

  beforeEach(async () => {
    const email = `test-${Date.now()}@example.com`
    const [user] = await db.insert(users).values({
      email,
      passwordHash: '$2b$10$test',
      name: 'Test',
    }).returning()
    testUser = user

    const loginRes = await $fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: { email, password: 'password123' },
    })
    authToken = loginRes.token
  })

  it('requires authentication', async () => {
    await expect($fetch('http://localhost:3000/api/subscriptions/create-checkout', {
      method: 'POST',
      body: {},
    })).rejects.toThrow('Unauthorized')
  })

  it('creates a Stripe checkout session for subscription', async () => {
    const res = await $fetch('http://localhost:3000/api/subscriptions/create-checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: {},
    })
    expect(res.url).toBeDefined()
    expect(res.url).toContain('checkout.stripe.com')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test server/api/__tests__/subscriptions-checkout.test.ts`
Expected: FAIL - endpoint not found

**Step 3: Implement checkout endpoint**

Create `server/api/subscriptions/create-checkout.post.ts`:

```typescript
import Stripe from 'stripe'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { users, subscriptions } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  if (!stripeKey || stripeKey.startsWith('sk_test_...')) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe not configured' })
  }

  const stripe = new Stripe(stripeKey)
  const user = await requireAuth(event)

  let customerId = user.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id.toString() },
    })
    customerId = customer.id
    await db.update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, user.id))
  }

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Eloria Pro - Wedding Planner Subscription',
          description: 'Unlimited event creation with all Premium features',
        },
        unit_amount: 4900,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${baseUrl}/dashboard?subscription=success`,
    cancel_url: `${baseUrl}/pricing`,
    metadata: { userId: user.id.toString() },
  })

  return { url: session.url }
})
```

**Step 4: Run tests**

Run: `npm test server/api/__tests__/subscriptions-checkout.test.ts`
Expected: PASS (may need to skip if no Stripe key in test env)

**Step 5: Commit**

```bash
git add server/api/subscriptions/create-checkout.post.ts server/api/__tests__/subscriptions-checkout.test.ts
git commit -m "feat: add subscription checkout endpoint"
```

---

## Task 4: Create Subscription Webhook Handler

**Files:**
- Create: `server/api/subscriptions/webhook.post.ts`
- Create: `server/api/__tests__/subscriptions-webhook.test.ts`

**Step 1: Write failing tests**

Create `server/api/__tests__/subscriptions-webhook.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '~/server/db'
import { users, subscriptions, events, tiers } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

describe('POST /api/subscriptions/webhook', () => {
  let testUser: { id: number }
  let premiumTier: { id: number }

  beforeEach(async () => {
    const [user] = await db.insert(users).values({
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
      name: 'Test',
    }).returning()
    testUser = user

    const tier = await db.query.tiers.findFirst({
      where: eq(tiers.slug, 'premium'),
    })
    premiumTier = tier!
  })

  it('creates subscription on checkout.session.completed', async () => {
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_test',
          subscription: 'sub_test',
          metadata: { userId: testUser.id.toString() },
        },
      },
    })

    const res = await $fetch('http://localhost:3000/api/subscriptions/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': 'test_sig' },
    })

    expect(res.received).toBe(true)

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, testUser.id),
    })
    expect(sub).toBeDefined()
    expect(sub?.status).toBe('active')
  })

  it('locks events on subscription deletion', async () => {
    await db.insert(subscriptions).values({
      userId: testUser.id,
      stripeSubscriptionId: 'sub_test',
      stripeCustomerId: 'cus_test',
      status: 'active',
      price: 4900,
    })

    await db.insert(events).values({
      userId: testUser.id,
      title: 'Test Event',
      coupleName1: 'A',
      coupleName2: 'B',
      date: '2025-01-01',
      venue: 'Venue',
      venueAddress: 'Address',
      slug: 'test-event',
      paymentStatus: 'paid',
      tierId: premiumTier.id,
    })

    const payload = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
        },
      },
    })

    await $fetch('http://localhost:3000/api/subscriptions/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': 'test_sig' },
    })

    const userEvents = await db.query.events.findMany({
      where: eq(events.userId, testUser.id),
    })
    expect(userEvents[0].paymentStatus).toBe('locked')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test server/api/__tests__/subscriptions-webhook.test.ts`
Expected: FAIL - endpoint not found

**Step 3: Implement webhook handler**

Create `server/api/subscriptions/webhook.post.ts`:

```typescript
import Stripe from 'stripe'
import { db } from '~/server/db'
import { users, subscriptions, events } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  const webhookSecret = resolveEnvVar('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET')

  if (!stripeKey || !webhookSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe not configured' })
  }

  const stripe = new Stripe(stripeKey)
  const body = await readRawBody(event)
  const signature = getHeader(event, 'stripe-signature')

  if (!body || !signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing body or signature' })
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature' })
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session
    const userId = parseInt(session.metadata?.userId || '0')

    if (userId && session.subscription && session.customer) {
      await db.insert(subscriptions).values({
        userId,
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
        status: 'active',
        price: 4900,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }
  }

  if (stripeEvent.type === 'customer.subscription.updated') {
    const sub = stripeEvent.data.object as Stripe.Subscription
    await db.update(subscriptions)
      .set({
        status: sub.status,
        currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const sub = stripeEvent.data.object as Stripe.Subscription
    
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, sub.id),
    })

    if (subscription) {
      await db.update(subscriptions)
        .set({ status: 'expired', canceledAt: new Date().toISOString() })
        .where(eq(subscriptions.id, subscription.id))

      await db.update(events)
        .set({ paymentStatus: 'locked' })
        .where(eq(events.userId, subscription.userId))
    }
  }

  return { received: true }
})
```

**Step 4: Run tests**

Run: `npm test server/api/__tests__/subscriptions-webhook.test.ts`

**Step 5: Commit**

```bash
git add server/api/subscriptions/webhook.post.ts server/api/__tests__/subscriptions-webhook.test.ts
git commit -m "feat: add subscription webhook handler"
```

---

## Task 5: Create Subscription Status Endpoint

**Files:**
- Create: `server/api/subscriptions/status.get.ts`

**Step 1: Implement status endpoint**

Create `server/api/subscriptions/status.get.ts`:

```typescript
import { requireAuth } from '~/server/utils/auth'
import { getActiveSubscription } from '~/server/utils/subscription'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const subscription = await getActiveSubscription(user.id)

  return {
    hasActiveSubscription: subscription !== null,
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    } : null,
  }
})
```

**Step 2: Commit**

```bash
git add server/api/subscriptions/status.get.ts
git commit -m "feat: add subscription status endpoint"
```

---

## Task 6: Update Event Creation for Subscribers

**Files:**
- Modify: `server/api/events/index.post.ts`

**Step 1: Modify event creation to handle subscribers**

Update `server/api/events/index.post.ts`:

```typescript
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, tiers } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { hasActiveSubscription } from '~/server/utils/subscription'

function generateSlug(name1: string, name2: string): string {
  const base = `${name1}-and-${name2}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { title, coupleName1, coupleName2, date, venue, venueAddress, venueMapUrl, description } = body

  if (!title || !coupleName1 || !coupleName2 || !date || !venue || !venueAddress) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  const slug = generateSlug(coupleName1, coupleName2)

  const isSubscriber = await hasActiveSubscription(user.id)

  const premiumTier = await db.query.tiers.findFirst({
    where: eq(tiers.slug, 'premium'),
  })

  const eventData: any = {
    userId: user.id,
    title,
    coupleName1,
    coupleName2,
    date,
    venue,
    venueAddress,
    venueMapUrl: venueMapUrl || null,
    description: description || null,
    slug,
  }

  if (isSubscriber && premiumTier) {
    eventData.paymentStatus = 'paid'
    eventData.tierId = premiumTier.id
  }

  const [newEvent] = await db.insert(events).values(eventData).returning()

  return newEvent
})
```

**Step 2: Commit**

```bash
git add server/api/events/index.post.ts
git commit -m "feat: auto-set paid status for subscriber events"
```

---

## Task 7: Skip Payment Step for Subscribers

**Files:**
- Modify: `pages/dashboard/events/new.vue`

**Step 1: Add subscription check and skip logic**

At the top of the script section in `pages/dashboard/events/new.vue`, add:

```typescript
const { data: subscriptionStatus } = await useFetch('/api/subscriptions/status')
const isSubscriber = computed(() => subscriptionStatus.value?.hasActiveSubscription === true)
```

**Step 2: Modify stepLabels to hide payment for subscribers**

Change:

```typescript
const stepLabels = computed(() => [t('eventForm.stepDetails'), t('eventForm.stepTemplate'), t('eventForm.stepCustomize'), t('eventForm.stepPreview'), t('eventForm.stepPayment')])
```

To:

```typescript
const stepLabels = computed(() => {
  const labels = [t('eventForm.stepDetails'), t('eventForm.stepTemplate'), t('eventForm.stepCustomize'), t('eventForm.stepPreview')]
  if (!isSubscriber.value) {
    labels.push(t('eventForm.stepPayment'))
  }
  return labels
})
```

**Step 3: Modify confirmPreview to skip payment for subscribers**

Change `confirmPreview` function:

```typescript
function confirmPreview() {
  if (isSubscriber.value) {
    navigateTo(`/dashboard/events/${eventId.value}`)
  } else {
    currentStep.value = 5
  }
}
```

**Step 4: Commit**

```bash
git add pages/dashboard/events/new.vue
git commit -m "feat: skip payment step for subscribers"
```

---

## Task 8: Add Pro Tier to Pricing Page

**Files:**
- Modify: `server/db/seed.ts`
- Modify: `pages/pricing.vue`

**Step 1: Add Pro tier to seed data**

Update `server/db/seed.ts`:

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
  {
    name: 'Pro',
    slug: 'pro',
    price: 4900,
    sortOrder: 3,
    guestLimit: null,
    hasEmailDelivery: true,
    hasPdfExport: true,
    hasAiTextGeneration: true,
    removeBranding: true,
    hasMultipleVariants: true,
  },
]).onConflictDoNothing()
```

**Step 2: Run seed**

Run: `npm run db:seed`

**Step 3: Update pricing page to handle Pro tier**

Modify `pages/pricing.vue` to show Pro tier differently (monthly vs one-time):

```typescript
function isPro(slug: string): boolean {
  return slug === 'pro'
}
```

Update the template to show "/month" for Pro tier and link to subscription checkout.

**Step 4: Commit**

```bash
git add server/db/seed.ts pages/pricing.vue
git commit -m "feat: add Pro tier to pricing page"
```

---

## Task 9: Add Subscription Management to Account Page

**Files:**
- Modify: `pages/dashboard/account.vue`

**Step 1: Add subscription section**

Fetch subscription status and show management options.

**Step 2: Commit**

```bash
git add pages/dashboard/account.vue
git commit -m "feat: add subscription management to account page"
```

---

## Task 10: Add Event Locking UI

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`
- Modify: `server/api/events/[id].get.ts`

**Step 1: Block access to locked events**

Check paymentStatus === 'locked' and show subscription prompt.

**Step 2: Commit**

```bash
git add pages/dashboard/events/[id]/index.vue server/api/events/[id].get.ts
git commit -m "feat: add locked event UI for expired subscriptions"
```

---

## Task 11: Add i18n Translations

**Files:**
- Modify: `i18n/en.json`
- Modify: `i18n/es.json`

**Step 1: Add translation keys for subscription-related UI**

Add keys for:
- Pro tier label and description
- Subscription status messages
- Cancellation/reactivation buttons
- Locked event messages

**Step 2: Commit**

```bash
git add i18n/en.json i18n/es.json
git commit -m "feat: add i18n keys for subscription feature"
```

---

## Task 12: End-to-End Testing

**Step 1: Run all tests**

Run: `npm test`

**Step 2: Fix any failing tests**

**Step 3: Manual testing checklist**

- [ ] Subscribe from pricing page
- [ ] Create event as subscriber (no payment step)
- [ ] Subscribe from event creation pipeline
- [ ] Cancel subscription
- [ ] Verify events are locked after cancellation
- [ ] Reactivate subscription
- [ ] Verify events are unlocked

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify subscription flow end-to-end"
```

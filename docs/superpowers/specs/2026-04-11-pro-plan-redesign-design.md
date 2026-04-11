# Pro Plan Redesign Design

**Date:** 2026-04-11
**Status:** Approved

## Overview

Restructure the pricing model from three one-time per-event plans into two one-time plans (Basic, Premium) and a monthly subscription plan (Pro) aimed at professional wedding planners. This is decomposed into two independent sub-projects implemented in sequence.

---

## Sub-project 1: Tier Restructure

### Goal

Merge the old Pro one-time tier into Premium and remove the old Pro one-time tier. No new infrastructure — only data and display changes.

### New Tier Table

| Tier | Price | Model | Guest Limit | Email | PDF | AI | Branding | Variants |
|---|---|---|---|---|---|---|---|---|
| Basic | $15 | One-time/event | 50 | ✗ | ✗ | ✗ | ✗ | ✗ |
| Premium | $35 | One-time/event | Unlimited | ✓ | ✓ | ✓ | ✓ | ✓ |

The old Pro one-time tier is removed from seed data. The new subscription Pro tier is not in the `tiers` table — it lives on the user (see Sub-project 2).

### Files Affected

- `server/db/seed.ts` — update Basic price stays $1500 cents, Premium to $3500 cents with unlimited guests (`guestLimit: null`) and `hasMultipleVariants: true`; remove Pro row
- `pages/dashboard/events/new.vue` — step 5 now shows only Basic and Premium (Pro subscription option added in Sub-project 2)
- `pages/pricing.vue` — reflects new two-tier structure with correct prices and features
- `i18n/lang/en.json` and `es.json` — update any hardcoded copy that references the old Pro tier

### Notes

- Existing paid events that reference the old Pro `tierId` are unaffected — those events retain their feature flags through the existing `event.tier` relation. The old Pro tier row can remain in the DB (just not re-seeded) to avoid breaking FK references; only the seed file is changed.
- If a fresh DB is seeded, only Basic and Premium exist.

---

## Sub-project 2: Pro Subscription

### Goal

Add a monthly recurring subscription plan for wedding planners at $49/month. Subscribers create unlimited events that are immediately active with all premium features. If the subscription lapses, events remain accessible but lose premium features.

### Data Model

Add three columns to the `users` table:

```sql
pro_subscription_status   TEXT        -- 'active' | 'cancelled' | NULL
pro_stripe_subscription_id TEXT       -- Stripe subscription ID, nullable
pro_subscription_ends_at  TEXT        -- ISO timestamp, nullable (end of current period)
```

Add via Drizzle schema update and migration script.

### Feature Gating Utility

Replace direct `event.tier?.hasXxx` checks across the codebase with a shared utility:

```ts
// server/utils/feature-access.ts
function canAccessFeature(
  feature: 'emailDelivery' | 'pdfExport' | 'aiTextGeneration' | 'removeBranding' | 'multipleVariants' | 'unlimitedGuests',
  event: { tier: Tier | null; userId: number },
  user: { proSubscriptionStatus: string | null }
): boolean
```

Returns `true` if:
- The event's tier grants the feature, OR
- The event owner has `proSubscriptionStatus === 'active'`

This function is called in every endpoint that gate-checks a feature. Existing per-event paid events continue to work through their `event.tier` relation; Pro-created events have `tierId: null` and unlock via the user check.

### Pro Event Creation Flow

When a Pro subscriber reaches step 5 of the event wizard:
- The wizard detects `user.proSubscriptionStatus === 'active'` (from a new field on the `/api/auth/me` response)
- Step 5 is skipped; the wizard calls `POST /api/events/:id/activate-pro` (see below), which marks the event `paymentStatus: 'paid'`, `tierId: null`
- User is redirected directly to the event dashboard

**`POST /api/events/:id/activate-pro`**
- Requires auth; verifies the event belongs to the user
- Checks `user.proSubscriptionStatus === 'active'`; throws 403 if not
- Sets `paymentStatus: 'paid'`, `tierId: null` on the event
- Returns the updated event

### New API Endpoints

**`POST /api/payments/create-subscription`**
- Requires auth
- Creates a Stripe Checkout Session in `subscription` mode for the Pro plan price
- Success URL: `/dashboard/account?subscription=success`
- Cancel URL: returns to origin (pricing page or wizard)
- Returns `{ url }` to redirect client

**`POST /api/payments/subscription-webhook`**
- Stripe webhook (verified via Stripe signature)
- Handles:
  - `checkout.session.completed` (mode: subscription) → store `proStripeSubscriptionId`, set `proSubscriptionStatus: 'active'`
  - `customer.subscription.updated` → sync `proSubscriptionStatus` (active/cancelled) and `proSubscriptionEndsAt` from Stripe's `current_period_end`
  - `customer.subscription.deleted` → set `proSubscriptionStatus: 'cancelled'`
  - `invoice.payment_failed` → set `proSubscriptionStatus: 'cancelled'`

**`POST /api/payments/cancel-subscription`**
- Requires auth
- Calls Stripe to cancel the user's subscription at period end
- Updates `proSubscriptionStatus: 'cancelled'` in DB
- Returns updated subscription state

**Updated `GET /api/auth/me`**
- Add `proSubscriptionStatus` and `proSubscriptionEndsAt` to response

### Pricing Page Changes

The pricing page becomes subscription-aware based on auth state:

| User state | Pro card CTA |
|---|---|
| Not logged in | "Subscribe" → `/auth/register` |
| Logged in, not Pro | "Subscribe" → `POST /api/payments/create-subscription` |
| Logged in, active Pro | "Current Plan" label, no action button |

The page fetches the current user's subscription status from `/api/auth/me` when logged in.

### Event Wizard (Step 5) Changes

Step 5 shows three options when the user is not a Pro subscriber:
1. **Basic** ($15, one-time) — existing flow
2. **Premium** ($35, one-time) — existing flow
3. **Pro** ($49/month) — triggers `POST /api/payments/create-subscription` instead of `create-checkout`

When the user **is** an active Pro subscriber, step 5 is skipped entirely: the event is activated immediately (no Stripe interaction).

### Account Page Changes

Add a "Subscription" section to the account page (below the existing profile card):

- **Active:** "Pro Plan · Renews [date]" + "Cancel subscription" button
- **Cancelled:** "Pro Plan · Active until [date]" (no cancel button)
- **None:** "No active subscription" + "Subscribe to Pro" link → pricing page

Cancel triggers `POST /api/payments/cancel-subscription` with a confirmation prompt.

### Environment Variables

New required env var:
- `STRIPE_PRO_PRICE_ID` — Stripe Price ID for the $49/month recurring price
- `STRIPE_WEBHOOK_SECRET_SUBSCRIPTION` — webhook signing secret for the subscription webhook (separate from any existing webhook secret)

### Out of Scope

- Annual billing option (future)
- Team/agency seats under one Pro account (future)
- Reactivating a cancelled subscription via the app (user goes to Stripe customer portal)
- Trial periods (future)
- Migrating existing one-time Pro purchasers to the new Premium tier (handled manually)

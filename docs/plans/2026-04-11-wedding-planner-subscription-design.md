# Wedding Planner Subscription Design

## Overview

Add a monthly subscription tier for wedding planners at $49/month that provides unlimited event creation with all Premium tier features. Subscribers skip the payment step during event creation.

## Requirements

- $49/month subscription price
- All Premium tier features (unlimited guests, email delivery, PDF export, AI text generation, no branding, multiple variants)
- Unlimited event creation
- No payment step during event creation for active subscribers
- Subscribe from: pricing page, account settings, event creation pipeline
- Stripe Subscriptions for recurring billing
- Lock all events when subscription expires/cancels
- No free trial
- No migration needed for existing per-event users

## User States

1. **Free user** - No subscription, pays per event (current behavior)
2. **Active subscriber** - $49/month, unlimited events with Premium features
3. **Expired subscriber** - Subscription ended, all events locked

## Database Schema

### New `subscriptions` table

```sql
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'active' | 'canceled' | 'past_due' | 'expired'
  price INTEGER NOT NULL, -- 4900 = $49.00 in cents
  current_period_start TEXT,
  current_period_end TEXT,
  canceled_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Add to `users` table

```sql
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
```

### No changes to existing tables

- `events` table: Subscribers get events with `paymentStatus = 'paid'` and `tierId = premium`
- `tiers` table: No changes needed

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/subscriptions/create-checkout` | POST | Create Stripe checkout session for subscription |
| `/api/subscriptions/webhook` | POST | Handle Stripe subscription webhooks |
| `/api/subscriptions/status` | GET | Get current subscription status for logged-in user |
| `/api/subscriptions/cancel` | POST | Cancel subscription (at period end) |
| `/api/subscriptions/reactivate` | POST | Reactivate canceled subscription |

## Event Creation Flow Changes

### Step 5 (Payment) becomes conditional

1. **Active subscriber:**
   - Skip payment step entirely
   - Event created with `paymentStatus = 'paid'`, `tierId = premium`
   - Redirect directly to event dashboard

2. **Free user:**
   - Show tier selection (current behavior)
   - Add subscription upsell banner: "Unlimited events for $49/month →"

### Modified files

- `pages/dashboard/events/new.vue` - Check subscription status, skip step 5 for subscribers
- `server/api/events/index.post.ts` - Set `paymentStatus = 'paid'` for subscribers

## Pricing Page

Add a third "Pro" tier card:

| Tier | Price | Features |
|------|-------|----------|
| Basic | $15/event | 50 guests, basic features |
| Premium | $35/event | Unlimited guests, all features |
| Pro | $49/month | Unlimited events, all Premium features |

### Modified files

- `pages/pricing.vue` - Add Pro tier card
- `server/db/seed.ts` - Add Pro tier to seed data
- `i18n/` - Add translation keys

## Account Settings

New subscription management section:

- Current subscription status with renewal date
- "Cancel subscription" button (cancels at period end)
- "Reactivate" button if canceled but not yet expired
- Link to billing portal (optional)

### Modified files

- `pages/dashboard/account.vue` - Add subscription management section

## Stripe Webhooks

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription record, set status = active |
| `customer.subscription.updated` | Update status, period dates |
| `customer.subscription.deleted` | Set status = expired, lock all user's events |
| `invoice.payment_failed` | Set status = past_due, notify user |

## Event Locking Logic

When subscription expires or is canceled:

1. All events with matching `userId` get `paymentStatus = 'locked'`
2. Event dashboard shows locked state with "Reactivate subscription" CTA
3. RSVP page remains accessible for guests (invitations still work)
4. Attempting to edit/manage locked events redirects to subscription page

### Modified files

- `server/api/events/[id].get.ts` - Check subscription status
- `server/api/events/[id].put.ts` - Block edits for locked events
- `pages/dashboard/events/[id]/index.vue` - Show locked state UI

## Implementation Phases

### Phase 1: Database & Backend
- Add subscriptions table to schema
- Add stripeCustomerId to users table
- Create subscription API endpoints
- Update event creation for subscribers

### Phase 2: Frontend - Subscription Flow
- Pricing page Pro tier card
- Subscription checkout flow
- Account settings subscription management

### Phase 3: Event Creation Integration
- Skip payment step for subscribers
- Upsell banner for free users

### Phase 4: Event Locking
- Lock events on subscription expiry
- Locked event UI

### Phase 5: Testing & Polish
- End-to-end subscription flow tests
- Webhook handling tests
- Edge case handling

## Open Questions

None - all requirements clarified during design phase.

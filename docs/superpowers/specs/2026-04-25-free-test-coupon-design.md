# Free Test Coupon — Design

## Goal

Allow the team and partners to test the production checkout flow without paying, by enabling Stripe-native promotion codes on both checkout flows. Entering a 100%-off promo code on Stripe's hosted checkout page brings the total to €0 and exercises the full webhook / DB flow.

## Approach

Use Stripe's built-in **promotion code** feature. Add `allow_promotion_codes: true` to both checkout session creations. The coupon and promotion code are configured in the Stripe Dashboard (one-time, manual). No app-level UI, no database schema changes, no new endpoints.

## Code Changes

Two lines, one in each file:

- `server/api/subscriptions/create-checkout.post.ts` — Pro subscription flow.
- `server/api/payments/create-checkout.post.ts` — Basic/Premium per-event flow.

Add `allow_promotion_codes: true` to the `stripe.checkout.sessions.create({...})` options object.

## Stripe Dashboard Setup

Done out-of-band in the Stripe Dashboard:

- Coupon: 100% off, duration **Forever** (so subscription renewals stay free).
- Promotion code linked to the coupon — the shared secret distributed to testers/partners.
- Optional: max redemptions / expiration if desired.

## Behavior

- User clicks subscribe / pay → Stripe checkout page → clicks "Add promotion code" → enters code → total = €0 → completes checkout.
- Webhooks fire normally (`checkout.session.completed`, `customer.subscription.*`).
- Subscription / event records are created identically to paying customers; the `subscriptions.price` column stores the plan list price (4900), since `item.price.unit_amount` reflects the plan, not the discounted amount.
- Stripe charges no processing fees on €0 transactions.

## Risks & Notes

- The "Add promotion code" link is visible to all users on Stripe checkout. The code is the only secret; this is a standard e-commerce pattern and is acceptable.
- A "Forever 100% off" Pro subscription auto-renews at €0 indefinitely. If a partner no longer needs free access, cancel their subscription manually in the Stripe Dashboard.
- This change does not introduce any app-side concept of "test users" or "comp accounts" — discounts are driven entirely by Stripe.

## Out of Scope

- In-app coupon input field.
- App-level bypass that skips Stripe checkout entirely.
- Tracking promo code usage in our DB (Stripe Dashboard already does this).
- Per-user comp / whitelist accounts.

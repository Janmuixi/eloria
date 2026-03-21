# Known Bugs

## BUG-001: Event preview card not scrollable in create event flow

**Status:** Fixed
**Area:** Create Event Flow / UI

When visualizing the event in the create event flow, the preview card content is not scrollable. If the event details exceed the visible area of the card, the user cannot scroll to see the rest of the content.

**Root cause:** The iframe in `TemplatePreview.vue` had a fixed `min-height: 600px` with `pointer-events: none` (blocking scroll interaction) and parent containers used `overflow-hidden` (clipping overflowing content).

**Fix:** Added dynamic iframe height resizing in `components/invitation/TemplatePreview.vue` that measures the content height after rendering and adjusts the iframe to match, so the full invitation is visible by scrolling the page.

---

## BUG-002: Redirected to login page after returning from Stripe

**Status:** Fixed
**Area:** Authentication / Stripe Integration

After completing a payment flow on Stripe and being redirected back to the app, the user is sent to the login page even though they were already authenticated. The session or auth state is not being preserved across the Stripe redirect.

**Root cause:** The `fetchUser()` function in `composables/useAuth.ts` called `$fetch('/api/auth/me')` without forwarding cookies during SSR. On a full page load (which happens after any external redirect like Stripe), Nuxt runs on the server first. The internal `$fetch` call during SSR does not automatically include the browser's cookies, so `/api/auth/me` saw no `auth_token` cookie, returned 401, and the auth middleware redirected to login.

**Fix:** Added `useRequestHeaders(['cookie'])` in `composables/useAuth.ts` to forward the browser's cookies to the internal API call during SSR. On the client side this is a no-op since the browser handles cookies automatically.

---

## BUG-003: Event shows as pending payment after successful payment

**Status:** Fixed
**Area:** Dashboard / Payment Status

After a successful Stripe payment, the event still appears as "pending payment" in the dashboard. The payment status is not being updated correctly after the Stripe checkout completes.

**Root cause:** The payment status update relied entirely on the Stripe webhook (`server/api/payments/webhook.post.ts`). If the webhook failed to fire (misconfigured endpoint, wrong secret, body parsing issues, no `stripe listen` in dev), or was simply delayed, the DB was never updated. The success page was completely inert -- it showed a green checkmark but did nothing to verify or update the payment status. Additionally, the `success_url` didn't include a Stripe session ID, making client-side verification impossible.

**Fix:** Three changes:
1. `server/api/payments/create-checkout.post.ts` -- Added `{CHECKOUT_SESSION_ID}` to the success URL so Stripe injects the real session ID on redirect.
2. `server/api/payments/verify.post.ts` (new) -- Endpoint that retrieves the Stripe checkout session, confirms `payment_status === 'paid'`, and updates the DB. Acts as a fallback to the webhook.
3. `pages/dashboard/events/[id]/success.vue` -- On mount, reads `session_id` from the query string and calls the verify endpoint. Shows loading, success, or error states accordingly.

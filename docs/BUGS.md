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

---

## BUG-004: Invitation iframe leaves a large empty area on mobile

**Status:** Fixed
**Area:** Public RSVP page / Dashboard event overview / Create-event preview

On `/i/<slug>` and on the dashboard event overview, the rendered-invitation iframe was much taller than its actual visible content on mobile portrait viewports. Result: a large empty band between the invitation card and the next section (the RSVP form on the public page, the stats grid on the dashboard).

**Root cause:** Every template's body uses `min-height: 100vh` with `display: flex; align-items: center; justify-content: center`. The iframe-height-measuring code in `server/utils/render-invitation.ts` (used by `pages/i/[slug].vue`) and in `components/invitation/TemplatePreview.vue` read `document.documentElement.scrollHeight || document.body.scrollHeight`. Because the body's `min-height: 100vh` resolves to the iframe's current viewport height, that read returned the iframe's *current* height — not the height of the actual content. So the resize never shrank: the iframe stayed at its default (1200px on `/i`, 600px in `TemplatePreview`), the body filled it, and `scrollHeight` reported the same value back. On mobile, where the card scales down to ~150–300px tall, this left 300–900px of empty space inside the iframe.

A second timing issue: on `/i/<slug>` the in-iframe script's first `post()` (from the `load` event) often fired before Vue had bound `iframeRef`, and the parent's `handleMessage` exited early because `ev.source !== iframeRef.value?.contentWindow` is true when `iframeRef.value` is `null`.

**Fix:** Three small changes:
1. `server/utils/render-invitation.ts` — measure the invitation wrapper (`.card` in `classic-elegant`, `.invitation` in the others) plus body padding instead of `body.scrollHeight`. Also schedule a follow-up `post()` after 50ms so the height arrives even if the parent's listener wasn't attached when `load` fired.
2. `components/invitation/TemplatePreview.vue` — same wrapper-based measurement in `resizeIframe()`.
3. `pages/i/[slug].vue` — `handleMessage` accepts the message when `iframeRef.value` is still null, only enforcing the source check once the ref is bound.

---

## BUG-005: classic-elegant template card is awkwardly small and clips text on mobile portrait

**Status:** Fixed
**Area:** Templates / classic-elegant

The `classic-elegant` template (a.k.a. "Floral Navy") set `aspect-ratio: 5463 / 3875` on `.card` (≈1.41 landscape). On a mobile portrait viewport (390px wide → ~315px usable width inside body padding), the card became ~315×222 px. With realistic content (wording + venue name + venue address), text overflowed below the card, and the floral artwork plus the "names" column were both cramped to <50% of the screen.

**Fix:** Added a `@media (max-width: 600px)` block in `server/db/templates/classic-elegant/template.html` that keeps the original landscape card and floral background art but drops the `clamp()` minimums that the desktop typography relies on, and tightens body and card padding. The whole card scales down with the viewport via the existing container queries (`cqw` units), so all the right-column copy now fits inside the constrained card height on a 360–414px portrait screen. The desktop card is unchanged.

Run `npm run db:seed-templates` after editing the template HTML to re-upsert it into the DB.

---

## BUG-006: Guest list header buttons wrap awkwardly on mobile

**Status:** Fixed
**Area:** Dashboard / Guests tab

On `/dashboard/events/<id>/guests` at 390px wide, the header row contained the title `Guest List (N seats)` and four action buttons ("All invited", "Export CSV", "Import CSV", "Add Guest") on the same flex row. There wasn't room for all of them, so the buttons wrapped with their text wrapping inside each button (e.g. "All / invited", "Export / CSV"), and `(0 seats)` dropped below the title.

**Fix:** Changed the header wrapper in `pages/dashboard/events/[id]/guests.vue` from `flex items-center justify-between` to `flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between`, and added `flex-wrap` to the button group. Below the `sm` breakpoint (640px) the title and the action group stack vertically and the buttons wrap onto multiple rows with their full label intact; at `sm` and above the original side-by-side layout is preserved.

---

## QA-2026-05-10: Mobile QA pass matrix (TASK-005)

Run on Chromium via Playwright on the dev server. "Pass" = no horizontal scroll, no clipped or overlapping content (excluding the Nuxt DevTools indicator), tappable controls, readable text. "Issue" links to the bug above.

**Viewports tested:** 360×640 (small portrait), 390×844 (iPhone-ish portrait), 414×896 (large portrait), 844×390 (landscape spot-check).

### Flows

| Flow                                            | 360 portrait | 390 portrait | 414 portrait | 844 landscape |
|-------------------------------------------------|--------------|--------------|--------------|---------------|
| Marketing home (`/`)                            | Pass         | Pass         | Pass         | Pass (renders desktop layout — md: breakpoint kicks in) |
| Register (`/auth/register`)                     | Pass         | Pass         | Pass         | n/a           |
| Dashboard (`/dashboard`)                        | Pass         | Pass         | Pass         | n/a           |
| Create event step 1 (Event Details)             | Pass         | Pass         | Pass         | n/a           |
| Create event step 2 (Choose Template)           | Pass         | Pass         | Pass         | n/a           |
| Create event step 3 (Customize / Live Preview)  | Pass         | Pass\*       | Pass         | n/a           |
| Create event step 4 (Preview)                   | Pass         | Pass\*       | Pass         | n/a           |
| Create event step 5 (Choose plan)               | Pass         | Pass         | Pass         | n/a           |
| Event overview (`/dashboard/events/<id>`)       | Pass\*       | Pass\*       | Pass\*       | n/a           |
| Event guests (`/.../guests`)                    | BUG-006 (fixed) | BUG-006 (fixed) | Pass     | n/a           |
| Event menu & dietary                            | Pass         | Pass         | Pass         | n/a           |
| Event settings                                  | Pass         | Pass         | Pass         | n/a           |
| Public invitation no token (`/i/<slug>`)        | BUG-004 (fixed) | BUG-004 (fixed) | BUG-004 (fixed) | Pass    |
| RSVP form, accept + menu + 3 companions         | Pass         | Pass         | Pass         | Pass          |
| RSVP confirmation screen                        | Pass         | Pass         | Pass         | Pass          |

\* The `Invitation Preview` / `Live Preview` iframes on the create-event flow and the dashboard overview page are subject to BUG-004; the fix lands in the same change as this QA pass.

### Templates (rendered at 390×844 via `/dev/templates/<slug>` and via `/i/<slug>`)

| Template          | Layout fits      | Notes |
|-------------------|------------------|-------|
| classic-elegant   | Pass (fixed)     | BUG-005 — fixed by lowering typography/padding clamp minimums on mobile so the original landscape card scales down to fit. |
| delicate-elegant  | Pass             | Portrait aspect-ratio; renders well. |
| minimalist        | Pass             | Vertical "Maria + James" treatment is readable. |
| modern-minimal    | Pass             | No fixed aspect-ratio; flows naturally. |
| modern-wedding    | Pass             | Portrait aspect-ratio; renders well. |
| rustic-autumn     | Pass             | No fixed aspect-ratio; long content wraps fine. |

# Template Rendering on Public Invitation Page — Design

**Date:** 2026-04-21
**Status:** Approved, awaiting implementation plan

## Problem

Couples pick a visual template when building their event. The selected template is persisted on `events.templateId`, loaded by `/api/invitations/[slug]`, and rendered in the dashboard preview and template-shopping flow. But on the public invitation page at `pages/i/[slug].vue` — the page the guest actually sees — the chosen template is ignored. Every guest sees the same hardcoded champagne/charcoal layout.

The template chooser currently affects the preview thumbnail, not the guest experience.

## Goal

On `/i/[slug]`, render the template the couple selected. The guest sees the chosen design, not a hardcoded fallback.

## Scope decisions

These were settled during brainstorming:

1. **Template owns the invitation body.** The template renders the full invitation including venue, map link, and description — not just a decorative hero. Only the RSVP form (interactive, needs Vue reactivity) and the "powered by" footer stay outside the template and use app styling. (Option C of A/B/C.)

2. **Rendering method: iframe.** The template is a self-contained HTML document served by a new endpoint; the Vue page hosts an `<iframe>` pointing at it. Full CSS isolation, zero structural changes to existing templates. (Option A of A/B/C.)

3. **A template is required for any paid/sent invitation.** Events without `templateId` cannot be paid or have invitations sent. The public page 500s if it ever encounters a paid event with no template (should be unreachable).

4. **Print mode redirects to the raw rendered endpoint.** `?print=true` navigates the browser directly to the server-rendered HTML for a clean print.

5. **No SEO on the public invitation page.** These are private per-couple URLs. No `useSeoMeta`; an explicit `robots: noindex, nofollow` is set on both the Vue page and the rendered HTML endpoint.

6. **No data migration.** Pre-production; no paid+template-less events exist to backfill.

## Architecture

### Server endpoint — new

`GET /api/invitations/[slug]/rendered.html`

- Looks up the event by slug, joins `template`.
- Requires `paymentStatus === 'paid'` → 404 otherwise (mirrors existing `/api/invitations/[slug]`).
- Requires `templateId != null` → 500 otherwise (shouldn't happen; fail loud).
- Builds `TemplateData` from the event row.
- Loads translations for `event.language` (the same mechanism used by the dev preview route).
- Calls `substituteTemplate`, appends a height-reporting `<script>` before `</body>`, inserts a `<meta name="robots" content="noindex, nofollow">` in `<head>`.
- Returns `text/html; charset=utf-8`.

### Public page — rewritten

`pages/i/[slug].vue`

- Drops all `useSeoMeta` calls; adds `useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })`.
- Fetches `/api/invitations/[slug]` for `removeBranding` only.
- Fetches `/api/rsvp/[token]` when a `g` query param is present (unchanged).
- Renders:
  - An `<iframe src="/api/invitations/[slug]/rendered.html">` sized via `postMessage` handshake. The parent listens for `{ type: 'invitation-height', height }` messages and updates the iframe's `height` style.
  - Below the iframe, the RSVP card (unchanged markup/logic; tokens and submit flow identical to today).
  - Below the RSVP card, the "powered by" footer gated by `removeBranding`.
- On mount: if `route.query.print === 'true'`, call `navigateTo('/api/invitations/[slug]/rendered.html', { external: true })`.

### Template contract

Each of the 5 templates (`classic-elegant`, `delicate-elegant`, `minimalist`, `modern-minimal`, `rustic-autumn`) gains two optional blocks and one new data token:

- `{{venueMapUrl}}` — string or empty. Wrapped in `{{#if venueMapUrl}}...{{/if}}`.
- `{{description}}` — string or empty. Wrapped in `{{#if description}}...{{/if}}`.

The map label uses `{{t:templates.viewOnMap}}` (new i18n key added to all locale files).

Template authors choose placement of these two blocks within their design.

### Substitution engine — extended

`server/utils/template-substitute.ts` grows block-conditional support:

- `{{#if <var>}}...{{/if}}` blocks are kept when the named variable resolves to a non-empty string, stripped otherwise.
- No nested blocks (explicit limitation; keeps the regex simple).
- Block stripping runs *before* variable substitution, so values interpolated inside stripped blocks are never materialised.
- `TemplateData` gains `venueMapUrl?: string` and `description?: string`.

### Validation guards

- `server/api/events/[id]/send-invitations.post.ts` — reject with 400 "Select a template before sending invitations" if `event.templateId == null`.
- Payment endpoint(s) — same guard (exact files identified during implementation planning). Belt-and-suspenders: an event cannot reach `paymentStatus === 'paid'` without a template.

## Component boundaries

| Unit | Purpose | Dependencies |
|------|---------|--------------|
| `server/utils/template-substitute.ts` (modified) | Pure string substitution + new block conditionals | None |
| `server/utils/render-invitation.ts` (new) | Compose template HTML from event + template + translations; append height script; inject robots meta | `template-substitute` |
| `server/api/invitations/[slug]/rendered.html.get.ts` (new) | HTTP handler: resolve event, load translations, call renderer, return HTML | `render-invitation`, db |
| `server/api/events/[id]/send-invitations.post.ts` (modified) | Add `templateId != null` guard | — |
| Payment handler(s) (modified) | Add `templateId != null` guard | — |
| `pages/i/[slug].vue` (rewritten, smaller) | Host iframe + RSVP card + footer; handle iframe sizing; handle print redirect | — |
| `server/db/templates/*/template.html` (modified, 5 files) | Template markup with optional map-link + description blocks | — |
| `i18n/lang/*.json` (modified) | Add `templates.viewOnMap` key | — |

Each unit is independently testable. `render-invitation` is pure (no db/network) and has the bulk of the interesting logic.

## Error handling

- Unknown slug → 404.
- Unpaid event → 404 (avoid leaking draft state, matches existing pattern).
- Paid event with null `templateId` → 500 (guards upstream should prevent this).
- Iframe load failure → browser's default broken-iframe UI; the Vue page renders normally around it. Not worth special handling.
- `postMessage` handshake never arrives (e.g., CSP blocks inline script, old browser) → iframe falls back to a default height (say 800px) so content is still visible, just potentially scrollable-within.

## Testing

### Unit

- `server/utils/__tests__/template-substitute.test.ts` — new cases: block kept when var non-empty; block stripped when var empty or missing; stripped blocks don't interpolate; flat substitution unaffected by block logic.
- `server/utils/__tests__/render-invitation.test.ts` — new file: renders a fixture event against a fixture template and asserts substituted output contains expected values and the height script; robots meta is present.

### Integration

- `server/api/__tests__/rendered-invitation.test.ts` — new file: 200 for paid+templated, 404 for unpaid, 404 for unknown slug, 500 for paid event with null templateId.
- `server/api/__tests__/send-invitations.test.ts` — extend (or create): 400 when `templateId` is null.

### Manual

- Load `/i/[slug]?g={token}` in a browser for each of the 5 templates. Confirm the template renders, RSVP submits, iframe height adjusts on window resize, `?print=true` navigates to bare HTML.
- Clean up `.playwright-mcp/` after any Playwright runs.

### Out of scope

- Visual regression of the templates themselves (covered by existing screenshot pipeline).
- Email delivery (unchanged).

## Open items for the implementation plan

- Identify the exact payment endpoint(s) that need the `templateId != null` guard.
- Decide the default fallback iframe height if the height handshake doesn't fire.
- Confirm how translations are loaded for non-English locales at the server endpoint (the dev preview hardcodes `en.json`; the rendered endpoint must use `event.language`).

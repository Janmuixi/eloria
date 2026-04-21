# Template Rendering on Public Invitation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the couple's chosen template on the public invitation page `/i/[slug]` instead of the current hardcoded layout. The template owns the invitation body (couple names, date, venue, map link, description); the Vue page keeps the RSVP card and "powered by" footer.

**Architecture:** Templates stay as file-system HTML documents seeded into the DB. A new server endpoint renders the chosen template with substitutions and returns raw HTML. The public page loads that HTML inside an `<iframe>` sized via `postMessage`, and appends the existing RSVP Vue card below. Payment and send-invitation endpoints gain a `templateId != null` guard so a paid event always has a template.

**Tech Stack:** Nuxt 3, Vue 3, Vitest, better-sqlite3 + Drizzle, existing `substituteTemplate` utility.

**Spec:** `docs/superpowers/specs/2026-04-21-template-rendering-on-invitation-page-design.md`

---

## File Structure

### New files

- `server/utils/render-invitation.ts` — pure composer: builds `TemplateData` from event row, calls `substituteTemplate`, injects robots meta and height script. No db/network.
- `server/api/invitations/[slug]/rendered.html.get.ts` — HTTP handler: resolves event + translations, calls the composer, returns `text/html`.
- `server/utils/__tests__/render-invitation.test.ts` — unit tests for the composer.
- `server/api/__tests__/rendered-invitation.test.ts` — integration tests for the endpoint.

### Modified files

- `server/utils/template-substitute.ts` — add `{{#if <var>}}…{{/if}}` block handling; extend `TemplateData` with `venueMapUrl?` and `description?`.
- `server/utils/__tests__/template-substitute.test.ts` — add conditional-block cases.
- `server/db/templates/classic-elegant/template.html` — add optional map-link and description blocks.
- `server/db/templates/delicate-elegant/template.html` — same.
- `server/db/templates/minimalist/template.html` — same (careful: large base64 background image inline).
- `server/db/templates/modern-minimal/template.html` — same.
- `server/db/templates/rustic-autumn/template.html` — same.
- `i18n/lang/en.json` — add `templates.viewOnMap` under the second `"templates"` block (line ~431).
- `i18n/lang/es.json` — add same key.
- `server/api/events/[id]/send-invitations.post.ts` — add `templateId != null` guard.
- `server/api/payments/create-checkout.post.ts` — add `templateId != null` guard.
- `server/api/__tests__/payments.test.ts` — new test for the guard.
- `server/api/__tests__/send-invitations.test.ts` — new test for the guard (or create if missing).
- `pages/i/[slug].vue` — rewrite: drop `useSeoMeta`, add `useHead` for noindex, replace hardcoded template markup with `<iframe>`, keep RSVP card, handle print-mode redirect.

### Unchanged

- `server/api/invitations/[slug].get.ts` — still used by the Vue page for `removeBranding`. No change.
- `server/api/rsvp/[token].get.ts` and `server/api/rsvp/[token].post.ts` — no change.
- `server/db/seed-templates.ts`, `server/db/load-templates.ts` — templates are re-seeded by existing tooling after edits.

---

## Task 1: Extend `substituteTemplate` with block conditionals

**Files:**
- Modify: `server/utils/template-substitute.ts`
- Test: `server/utils/__tests__/template-substitute.test.ts`

- [ ] **Step 1: Add failing test for `{{#if}}` block kept when variable non-empty**

Append to `server/utils/__tests__/template-substitute.test.ts` (inside the existing `describe('substituteTemplate', …)` block, before the closing `})`):

```ts
  it('keeps {{#if var}}...{{/if}} blocks when the variable is non-empty', () => {
    const html = 'A{{#if venueMapUrl}} <a href="{{venueMapUrl}}">Map</a>{{/if}} Z'
    const result = substituteTemplate(html, {
      coupleName1: '', coupleName2: '', date: '',
      venue: '', venueAddress: '', wording: '',
      venueMapUrl: 'https://maps.example.com/x',
    })
    expect(result).toBe('A <a href="https://maps.example.com/x">Map</a> Z')
  })

  it('strips {{#if var}}...{{/if}} blocks when the variable is empty', () => {
    const html = 'A{{#if venueMapUrl}} <a href="{{venueMapUrl}}">Map</a>{{/if}} Z'
    const result = substituteTemplate(html, {
      coupleName1: '', coupleName2: '', date: '',
      venue: '', venueAddress: '', wording: '',
      venueMapUrl: '',
    })
    expect(result).toBe('A Z')
  })

  it('strips {{#if var}}...{{/if}} blocks when the variable is undefined', () => {
    const html = 'A{{#if description}}<p>{{description}}</p>{{/if}}Z'
    const result = substituteTemplate(html, {
      coupleName1: '', coupleName2: '', date: '',
      venue: '', venueAddress: '', wording: '',
    })
    expect(result).toBe('AZ')
  })

  it('handles multiple independent conditional blocks', () => {
    const html = '{{#if venueMapUrl}}MAP{{/if}}|{{#if description}}DESC{{/if}}'
    const result = substituteTemplate(html, {
      coupleName1: '', coupleName2: '', date: '',
      venue: '', venueAddress: '', wording: '',
      venueMapUrl: 'x',
      description: '',
    })
    expect(result).toBe('MAP|')
  })

  it('does not substitute variables inside a stripped block', () => {
    // {{venueMapUrl}} inside the block must not leak even though it's empty.
    // Stripping happens before variable substitution.
    const html = 'before{{#if venueMapUrl}}[{{venueMapUrl}}]{{/if}}after'
    const result = substituteTemplate(html, {
      coupleName1: '', coupleName2: '', date: '',
      venue: '', venueAddress: '', wording: '',
      venueMapUrl: '',
    })
    expect(result).toBe('beforeafter')
  })

  it('does not treat {{#if t:foo}} as a conditional (only data vars supported)', () => {
    // The conditional regex only matches [a-zA-Z0-9_]+ as a variable name, so
    // a colon-containing token like {{#if t:foo}} is NOT recognised as a
    // conditional. The tokens stay in the output verbatim.
    const html = '{{#if t:foo}}X{{/if}}'
    const result = substituteTemplate(
      html,
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { t: { foo: 'yes' } },
    )
    expect(result).toBe('{{#if t:foo}}X{{/if}}')
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run server/utils/__tests__/template-substitute.test.ts`
Expected: FAIL — the conditional-block tests fail because the feature doesn't exist yet. The existing tests continue to pass.

- [ ] **Step 3: Implement block-conditional support**

Replace the contents of `server/utils/template-substitute.ts` with:

```ts
export type TemplateData = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  wording: string
  venueMapUrl?: string
  description?: string
}

export type TemplateTranslations = Record<string, unknown>
export type TemplateTranslator = (path: string) => string | undefined

const TRANSLATION_TOKEN_REGEX = /\{\{t:([a-zA-Z0-9_.]+)\}\}/g
const CONDITIONAL_BLOCK_REGEX = /\{\{#if ([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g

export function substituteTemplate(
  html: string,
  data: TemplateData,
  translations?: TemplateTranslations | TemplateTranslator,
): string {
  // Strip conditional blocks first so variables inside stripped blocks are
  // never interpolated.
  let out = html.replace(CONDITIONAL_BLOCK_REGEX, (_match, varName: string, body: string) => {
    const value = (data as Record<string, unknown>)[varName]
    return typeof value === 'string' && value.length > 0 ? body : ''
  })

  out = out
    .replace(/\{\{coupleName1\}\}/g, data.coupleName1)
    .replace(/\{\{coupleName2\}\}/g, data.coupleName2)
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{venue\}\}/g, data.venue)
    .replace(/\{\{venueAddress\}\}/g, data.venueAddress)
    .replace(/\{\{wording\}\}/g, data.wording)
    .replace(/\{\{venueMapUrl\}\}/g, data.venueMapUrl ?? '')
    .replace(/\{\{description\}\}/g, data.description ?? '')

  if (translations) {
    const resolve = typeof translations === 'function'
      ? translations
      : (path: string) => {
          const v = resolveTranslation(translations, path)
          return typeof v === 'string' ? v : undefined
        }

    out = out.replace(TRANSLATION_TOKEN_REGEX, (match, path: string) => {
      const resolved = resolve(path)
      return typeof resolved === 'string' ? resolved : match
    })
  }

  return out
}

function resolveTranslation(root: TemplateTranslations, path: string): unknown {
  const segments = path.split('.')
  let node: unknown = root
  for (const seg of segments) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[seg]
  }
  return node
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run server/utils/__tests__/template-substitute.test.ts`
Expected: PASS for all cases (both old and new).

- [ ] **Step 5: Commit**

```bash
git add server/utils/template-substitute.ts server/utils/__tests__/template-substitute.test.ts
git commit -m "feat(templates): add {{#if}} block conditionals to substituteTemplate"
```

---

## Task 2: Add `templates.viewOnMap` i18n key

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Add key to `en.json`**

In `i18n/lang/en.json`, find the SECOND `"templates": {` block (around line 431, the one that contains `"together"`, `"venue"`, etc. — NOT the first one at line 332 which contains `"seoTitle"`). Add a `viewOnMap` key:

```json
  "templates": {
    "together": "Together with their families",
    "venue": "Venue",
    "viewOnMap": "View on map",
    "weddingInvitation": "Wedding Invitation",
```

- [ ] **Step 2: Add key to `es.json`**

Same location in `i18n/lang/es.json` (around line 431):

```json
  "templates": {
    "together": "Junto con sus familias",
    "venue": "Lugar",
    "viewOnMap": "Ver en el mapa",
    "weddingInvitation": "Invitación de boda",
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/lang/en.json','utf-8')); JSON.parse(require('fs').readFileSync('i18n/lang/es.json','utf-8')); console.log('ok')"`
Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n(templates): add viewOnMap key for invitation templates"
```

---

## Task 3: Add map-link and description blocks to templates

Each template grows two optional sections. Placement is up to the template's existing aesthetic. The concrete markup below is a starting point — adjust the CSS classes to match each file's conventions, but keep the tokens (`{{venueMapUrl}}`, `{{description}}`, `{{t:templates.viewOnMap}}`) and the `{{#if}}` wrappers exact.

**Files:**
- Modify: `server/db/templates/classic-elegant/template.html`
- Modify: `server/db/templates/delicate-elegant/template.html`
- Modify: `server/db/templates/minimalist/template.html`
- Modify: `server/db/templates/modern-minimal/template.html`
- Modify: `server/db/templates/rustic-autumn/template.html`

- [ ] **Step 1: Read `classic-elegant/template.html` in full**

Use the Read tool. Note the venue block structure (currently around lines 157-161).

- [ ] **Step 2: Add a map-link anchor inside the venue section (classic-elegant)**

In `server/db/templates/classic-elegant/template.html`, find the venue section:

```html
      <div class="venue-section">
        <h3>{{t:templates.venue}}</h3>
        <p class="venue-name">{{venue}}</p>
        <p class="venue-address">{{venueAddress}}</p>
      </div>
```

Replace with:

```html
      <div class="venue-section">
        <h3>{{t:templates.venue}}</h3>
        <p class="venue-name">{{venue}}</p>
        <p class="venue-address">{{venueAddress}}</p>
        {{#if venueMapUrl}}
        <p class="venue-map"><a href="{{venueMapUrl}}" target="_blank" rel="noopener noreferrer">{{t:templates.viewOnMap}}</a></p>
        {{/if}}
      </div>
```

Also add a CSS rule inside the existing `<style>` block (after the `.venue-address` rule):

```css
  .venue-map {
    margin-top: 10px;
  }
  .venue-map a {
    font-family: 'Cinzel', serif;
    font-size: 12px;
    color: #c9a84c;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    text-decoration: none;
    border-bottom: 1px solid rgba(201, 168, 76, 0.4);
    padding-bottom: 2px;
  }
```

- [ ] **Step 3: Add a description block (classic-elegant)**

Immediately BEFORE the closing `<div class="ornament">&#10022; &#10022; &#10022;</div>` at the bottom of `.gold-border`, insert:

```html
      {{#if description}}
      <div class="gold-line"></div>
      <div class="description">{{description}}</div>
      {{/if}}
```

Add CSS for `.description` inside the `<style>` block:

```css
  .description {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 16px;
    line-height: 1.8;
    color: #a89a80;
    max-width: 420px;
    margin: 0 auto;
    white-space: pre-line;
  }
```

- [ ] **Step 4: Apply equivalent edits to `delicate-elegant/template.html`**

Read the file. Identify its venue block and its footer/bottom. Insert the same two `{{#if}}` blocks (map link inside venue, description above the closing decorative element). Adapt the CSS class names/colors/fonts to match the template's existing palette (check the template's own `<style>` for color variables to reuse).

- [ ] **Step 5: Apply equivalent edits to `minimalist/template.html`**

**Careful:** this file is ~600KB because of an inline base64 background image. Read it with `limit: 110` lines (the markup sits in the first ~110 lines, before the base64 blob). Make targeted edits only to the markup/CSS, never to the `data:image/jpeg;base64,...` string.

- [ ] **Step 6: Apply equivalent edits to `modern-minimal/template.html`**

Read the file. Insert the two `{{#if}}` blocks in style-appropriate locations. Adapt class names/colors.

- [ ] **Step 7: Apply equivalent edits to `rustic-autumn/template.html`**

Same.

- [ ] **Step 8: Re-seed templates into the DB**

Run: `npm run db:seed:templates` (or, if no such script exists, `npx tsx server/db/seed-templates.ts`).
Expected output: `[seed-templates] upserted 5 templates.`

If the script name is different, check `package.json` scripts for a template-seeding entry.

- [ ] **Step 9: Regenerate screenshot previews (optional but recommended)**

Run: `rm -f public/images/templates/*.jpg && npx tsx server/db/templates-screenshots.ts`
Expected: 5 fresh JPGs in `public/images/templates/`.

Note: this shells out to Puppeteer and takes ~30s. Skip if Puppeteer is unavailable in the dev environment — the plan does not depend on the screenshots.

- [ ] **Step 10: Commit**

```bash
git add server/db/templates public/images/templates
git commit -m "feat(templates): add optional venueMapUrl and description blocks to all templates"
```

---

## Task 4: Create `render-invitation` utility

**Files:**
- Create: `server/utils/render-invitation.ts`
- Test: `server/utils/__tests__/render-invitation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/utils/__tests__/render-invitation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderInvitation } from '../render-invitation'

const sampleTemplate = `<!DOCTYPE html>
<html><head><title>T</title></head>
<body>
<h1>{{coupleName1}} &amp; {{coupleName2}}</h1>
<p>{{date}}</p>
<p>{{venue}}, {{venueAddress}}</p>
<p>{{wording}}</p>
{{#if venueMapUrl}}<a href="{{venueMapUrl}}">{{t:templates.viewOnMap}}</a>{{/if}}
{{#if description}}<p class="desc">{{description}}</p>{{/if}}
</body></html>`

const sampleTranslations = {
  templates: { viewOnMap: 'View on map' },
}

const baseEvent = {
  coupleName1: 'Alice',
  coupleName2: 'Bob',
  date: '2026-06-15',
  venue: 'Grand Hotel',
  venueAddress: '123 Main St',
  venueMapUrl: null as string | null,
  description: null as string | null,
  customization: null as string | null,
  language: 'en',
}

describe('renderInvitation', () => {
  it('substitutes couple, date, and venue values', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).toContain('Alice &amp; Bob')
    expect(out).toContain('Grand Hotel, 123 Main St')
  })

  it('formats the date using the event language', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    // en locale, long date
    expect(out).toMatch(/June 15, 2026/)
  })

  it('formats the date in Spanish when language is es', () => {
    const out = renderInvitation({ ...baseEvent, language: 'es' }, sampleTemplate, {})
    expect(out).toMatch(/junio/)
  })

  it('uses wording from customization JSON when present', () => {
    const event = { ...baseEvent, customization: JSON.stringify({ wording: 'Please celebrate with us' }) }
    const out = renderInvitation(event, sampleTemplate, sampleTranslations)
    expect(out).toContain('Please celebrate with us')
  })

  it('falls back to empty wording when customization is null', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    // no throw, no literal "{{wording}}" left in output
    expect(out).not.toContain('{{wording}}')
  })

  it('includes the map link block when venueMapUrl is set', () => {
    const event = { ...baseEvent, venueMapUrl: 'https://maps.example.com/x' }
    const out = renderInvitation(event, sampleTemplate, sampleTranslations)
    expect(out).toContain('href="https://maps.example.com/x"')
    expect(out).toContain('View on map')
  })

  it('omits the map link block when venueMapUrl is null', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).not.toContain('View on map')
  })

  it('includes the description block when description is set', () => {
    const event = { ...baseEvent, description: 'Ceremony outdoors' }
    const out = renderInvitation(event, sampleTemplate, sampleTranslations)
    expect(out).toContain('class="desc">Ceremony outdoors')
  })

  it('injects a noindex robots meta tag into <head>', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).toMatch(/<meta name="robots" content="noindex, nofollow"\s*\/?>/i)
    // Must land inside <head>, before </head>
    const headEnd = out.indexOf('</head>')
    const metaIdx = out.search(/<meta name="robots"/i)
    expect(metaIdx).toBeGreaterThan(-1)
    expect(metaIdx).toBeLessThan(headEnd)
  })

  it('injects a height-reporting script before </body>', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).toMatch(/postMessage\(\s*\{\s*type:\s*['"]invitation-height['"]/)
    const scriptIdx = out.search(/postMessage\(\s*\{\s*type:\s*['"]invitation-height['"]/)
    const bodyEnd = out.indexOf('</body>')
    expect(scriptIdx).toBeGreaterThan(-1)
    expect(scriptIdx).toBeLessThan(bodyEnd)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/utils/__tests__/render-invitation.test.ts`
Expected: FAIL — module `../render-invitation` does not exist.

- [ ] **Step 3: Implement `render-invitation.ts`**

Create `server/utils/render-invitation.ts`:

```ts
import { substituteTemplate, type TemplateData } from './template-substitute'

export type EventRowForRender = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  venueMapUrl: string | null
  description: string | null
  customization: string | null
  language: string
}

const HEIGHT_SCRIPT = `<script>
(function() {
  function post() {
    var h = document.documentElement.scrollHeight || document.body.scrollHeight;
    parent.postMessage({ type: 'invitation-height', height: h }, '*');
  }
  window.addEventListener('load', post);
  if (window.ResizeObserver) {
    new ResizeObserver(post).observe(document.body);
  } else {
    window.addEventListener('resize', post);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(post);
  }
})();
</script>`

const ROBOTS_META = '<meta name="robots" content="noindex, nofollow">'

export function renderInvitation(
  event: EventRowForRender,
  htmlTemplate: string,
  translations: Record<string, unknown>,
): string {
  const wording = extractWording(event.customization)
  const formattedDate = formatDate(event.date, event.language)

  const data: TemplateData = {
    coupleName1: event.coupleName1,
    coupleName2: event.coupleName2,
    date: formattedDate,
    venue: event.venue,
    venueAddress: event.venueAddress,
    wording,
    venueMapUrl: event.venueMapUrl ?? '',
    description: event.description ?? '',
  }

  const substituted = substituteTemplate(htmlTemplate, data, translations)
  return injectMetaAndScript(substituted)
}

function extractWording(customization: string | null): string {
  if (!customization) return ''
  try {
    const parsed = JSON.parse(customization)
    return typeof parsed?.wording === 'string' ? parsed.wording : ''
  } catch {
    return ''
  }
}

function formatDate(dateStr: string, language: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function injectMetaAndScript(html: string): string {
  let out = html
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${ROBOTS_META}</head>`)
  } else {
    out = `${ROBOTS_META}${out}`
  }
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${HEIGHT_SCRIPT}</body>`)
  } else {
    out = `${out}${HEIGHT_SCRIPT}`
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run server/utils/__tests__/render-invitation.test.ts`
Expected: PASS for all 10 cases.

- [ ] **Step 5: Commit**

```bash
git add server/utils/render-invitation.ts server/utils/__tests__/render-invitation.test.ts
git commit -m "feat(invitations): add renderInvitation utility with robots meta and height script"
```

---

## Task 5: Create `/api/invitations/[slug]/rendered.html` endpoint

**Files:**
- Create: `server/api/invitations/[slug]/rendered.html.get.ts`
- Test: `server/api/__tests__/rendered-invitation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/api/__tests__/rendered-invitation.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  seedTiers,
  seedTemplate,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const handler = (await import('../invitations/[slug]/rendered.html.get')).default

describe('Rendered invitation HTML endpoint', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  it('returns substituted HTML for a paid event with a template', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'r@test.com', name: 'R' })
    const template = seedTemplate(testDb, 2)
    createTestEvent(testDb, user!.id, {
      slug: 'render-ok',
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })

    const event = createMockEvent({ params: { slug: 'render-ok' } })
    const result = await handler(event)

    expect(typeof result).toBe('string')
    // seedTemplate uses "<div>{{coupleName1}} & {{coupleName2}}</div>" as html
    expect(result).toContain('Alice & Bob')
    expect(result).toContain('noindex, nofollow')
    expect(result).toMatch(/invitation-height/)
  })

  it('returns 404 for an unpaid event', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'np@test.com', name: 'NP' })
    const template = seedTemplate(testDb, 2)
    createTestEvent(testDb, user!.id, {
      slug: 'unpaid',
      paymentStatus: 'pending',
      templateId: template!.id,
    })

    const event = createMockEvent({ params: { slug: 'unpaid' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 404 for an unknown slug', async () => {
    const event = createMockEvent({ params: { slug: 'missing' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 500 for a paid event with no template', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'nt@test.com', name: 'NT' })
    createTestEvent(testDb, user!.id, {
      slug: 'paid-no-template',
      paymentStatus: 'paid',
      templateId: null,
    })

    const event = createMockEvent({ params: { slug: 'paid-no-template' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
  })

  it('sets Content-Type to text/html', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'ct@test.com', name: 'CT' })
    const template = seedTemplate(testDb, 2)
    createTestEvent(testDb, user!.id, {
      slug: 'ct-test',
      paymentStatus: 'paid',
      templateId: template!.id,
    })

    const setHeaderSpy = vi.fn()
    const event = createMockEvent({
      params: { slug: 'ct-test' },
      setHeader: setHeaderSpy,
    })
    await handler(event)

    expect(setHeaderSpy).toHaveBeenCalledWith(
      expect.anything(),
      'content-type',
      expect.stringMatching(/text\/html/),
    )
  })
})
```

Check `server/__helpers__/event.ts` for the `createMockEvent` shape. If it does not already support a `setHeader` spy, look at how other tests intercept response headers (they usually mock Nitro's `setHeader` globally or pass it via the event stub). Adapt the last test accordingly — if impractical, drop that single assertion and keep the four behavioural tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/api/__tests__/rendered-invitation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the handler**

Create directory and file `server/api/invitations/[slug]/rendered.html.get.ts`:

```ts
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { renderInvitation } from '~/server/utils/render-invitation'

const LOCALES_DIR = 'i18n/lang'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug required' })

  const evt = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: { template: true },
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (evt.paymentStatus !== 'paid') {
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  }
  if (!evt.template) {
    throw createError({ statusCode: 500, statusMessage: 'Event has no template' })
  }

  const translations = loadTranslations(evt.language)

  const html = renderInvitation(
    {
      coupleName1: evt.coupleName1,
      coupleName2: evt.coupleName2,
      date: evt.date,
      venue: evt.venue,
      venueAddress: evt.venueAddress,
      venueMapUrl: evt.venueMapUrl,
      description: evt.description,
      customization: evt.customization,
      language: evt.language,
    },
    evt.template.htmlTemplate,
    translations,
  )

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return html
})

function loadTranslations(language: string): Record<string, unknown> {
  const preferred = join(LOCALES_DIR, `${language}.json`)
  const fallback = join(LOCALES_DIR, 'en.json')
  const path = existsSync(preferred) ? preferred : fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/api/__tests__/rendered-invitation.test.ts`
Expected: PASS for all cases.

- [ ] **Step 5: Commit**

```bash
git add server/api/invitations/[slug]/rendered.html.get.ts server/api/__tests__/rendered-invitation.test.ts
git commit -m "feat(invitations): add rendered.html endpoint returning template HTML"
```

---

## Task 6: Guard `send-invitations` against missing template

**Files:**
- Modify: `server/api/events/[id]/send-invitations.post.ts`
- Test: `server/api/__tests__/send-invitations.test.ts` (create or extend)

- [ ] **Step 1: Check for existing send-invitations test file**

Run: `ls server/api/__tests__/send-invitations.test.ts 2>/dev/null || echo "missing"`

If missing, create it. If it exists, append the new case.

- [ ] **Step 2: Write the failing test**

If creating from scratch, create `server/api/__tests__/send-invitations.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  seedTiers,
  seedTemplate,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

vi.mock('~/server/utils/email', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}))

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('POST /api/events/[id]/send-invitations', () => {
  const originalEnv = process.env

  beforeEach(() => {
    testDb = createTestDb()
    process.env = { ...originalEnv, RESEND_API_KEY: 'test_key', BASE_URL: 'http://localhost:3000' }
  })

  it('rejects with 400 when the event has no template', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'guard@test.com', name: 'G' })
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2, // premium has hasEmailDelivery
      templateId: null,
    })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringMatching(/template/i),
    })
  })

  it('proceeds when the event has a template (no guests → 0 sent)', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'ok@test.com', name: 'O' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
  })
})
```

- [ ] **Step 3: Run tests to verify the guard test fails**

Run: `npx vitest run server/api/__tests__/send-invitations.test.ts`
Expected: The first test FAILS (guard not implemented). The second one may also fail depending on order of existing checks; that's fine.

- [ ] **Step 4: Add the guard in `send-invitations.post.ts`**

In `server/api/events/[id]/send-invitations.post.ts`, locate the block:

```ts
  if (!userEvent.tier?.hasEmailDelivery) {
    throw createError({ statusCode: 403, statusMessage: 'Email delivery is not available on your plan' })
  }
```

Insert directly after it:

```ts
  if (userEvent.templateId == null) {
    throw createError({ statusCode: 400, statusMessage: 'Select a template before sending invitations' })
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/api/__tests__/send-invitations.test.ts`
Expected: PASS for both tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/[id]/send-invitations.post.ts server/api/__tests__/send-invitations.test.ts
git commit -m "feat(invitations): require template before sending invitations"
```

---

## Task 7: Guard `create-checkout` against missing template

**Files:**
- Modify: `server/api/payments/create-checkout.post.ts`
- Test: `server/api/__tests__/payments.test.ts`

- [ ] **Step 1: Add failing test**

In `server/api/__tests__/payments.test.ts`, inside the existing `describe('POST /api/payments/create-checkout', () => { ... })`, add a new test after the `'rejects invalid tier slug (400)'` test:

```ts
    it('rejects when event has no template (400)', async () => {
      vi.resetModules()
      const handler = (await import('../payments/create-checkout.post')).default
      seedTiers(testDb)
      const user = await createTestUser(testDb, { email: 'notpl@test.com', name: 'NoTpl' })
      const evt = createTestEvent(testDb, user!.id, { title: 'No Template Wedding', templateId: null })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { eventId: evt!.id, tierSlug: 'premium' },
      })

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: expect.stringMatching(/template/i),
      })
      expect(mockCheckoutCreate).not.toHaveBeenCalled()
    })
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `npx vitest run server/api/__tests__/payments.test.ts`
Expected: the new test FAILS (guard missing); existing tests continue to pass.

- [ ] **Step 3: Add the guard in `create-checkout.post.ts`**

In `server/api/payments/create-checkout.post.ts`, after the `if (!tier) { ... }` block and BEFORE the `await db.update(events)...` line, insert:

```ts
  if (userEvent.templateId == null) {
    throw createError({ statusCode: 400, statusMessage: 'Select a template before paying' })
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/api/__tests__/payments.test.ts`
Expected: PASS for all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add server/api/payments/create-checkout.post.ts server/api/__tests__/payments.test.ts
git commit -m "feat(payments): require template before Stripe checkout"
```

---

## Task 8: Rewrite `pages/i/[slug].vue` with iframe

**Files:**
- Modify: `pages/i/[slug].vue`

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `pages/i/[slug].vue` with:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'blank' })

const { t } = useI18n()
const route = useRoute()
const slug = route.params.slug as string
const guestToken = computed(() => route.query.g as string | undefined)
const isPrint = computed(() => route.query.print === 'true')

const renderedUrl = `/api/invitations/${slug}/rendered.html`

useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

if (import.meta.client && isPrint.value) {
  window.location.replace(renderedUrl)
}

const { data: invitation, error } = await useFetch(`/api/invitations/${slug}`)

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: t('errors.invitationNotFound') })
}

const { data: guestData, refresh: refreshGuest } = await useFetch(
  () => guestToken.value ? `/api/rsvp/${guestToken.value}` : '',
  { immediate: !!guestToken.value },
)

const rsvpForm = reactive({
  rsvpStatus: '' as string,
  plusOne: false,
  plusOneName: '',
})

const rsvpSubmitting = ref(false)
const rsvpError = ref('')

watch(guestData, (data) => {
  if (data) {
    rsvpForm.rsvpStatus = data.rsvpStatus !== 'pending' ? data.rsvpStatus : ''
    rsvpForm.plusOne = data.plusOne || false
    rsvpForm.plusOneName = data.plusOneName || ''
  }
}, { immediate: true })

async function submitRsvp() {
  if (!guestToken.value || !rsvpForm.rsvpStatus) return
  rsvpSubmitting.value = true
  rsvpError.value = ''

  try {
    await $fetch(`/api/rsvp/${guestToken.value}`, {
      method: 'POST',
      body: {
        rsvpStatus: rsvpForm.rsvpStatus,
        plusOne: rsvpForm.plusOne,
        plusOneName: rsvpForm.plusOneName,
      },
    })
    await refreshGuest()
  } catch (e: any) {
    rsvpError.value = e.data?.statusMessage || t('errors.somethingWentWrong')
  } finally {
    rsvpSubmitting.value = false
  }
}

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeHeight = ref(1200)

function handleMessage(ev: MessageEvent) {
  if (ev.source !== iframeRef.value?.contentWindow) return
  if (ev.data?.type !== 'invitation-height') return
  const h = Number(ev.data.height)
  if (Number.isFinite(h) && h > 0) iframeHeight.value = h
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage)
})
</script>

<template>
  <div v-if="invitation" class="min-h-screen bg-[#faf8f5]">
    <iframe
      ref="iframeRef"
      :src="renderedUrl"
      :style="{ height: iframeHeight + 'px' }"
      class="w-full border-0 block bg-white"
      title="Wedding invitation"
    />

    <div v-if="!isPrint" class="max-w-2xl mx-auto px-6 py-10">
      <section class="mb-10">
        <div class="bg-white rounded-2xl shadow-sm border border-charcoal-100 p-8 text-center">
          <h2 class="font-serif text-2xl text-charcoal-900 mb-6">{{ $t('rsvp.title') }}</h2>

          <div v-if="!guestToken">
            <p class="text-charcoal-300">{{ $t('rsvp.usePersonalLink') }}</p>
          </div>

          <div v-else-if="guestData?.rsvpStatus && guestData.rsvpStatus !== 'pending'">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-green-600 text-xl">&#10003;</span>
            </div>
            <p class="text-lg font-medium text-charcoal-900 mb-1">{{ $t('rsvp.thankYou', { name: guestData?.name }) }}</p>
            <p class="text-charcoal-300">
              <template v-if="guestData.rsvpStatus === 'confirmed'">{{ $t('rsvp.cantWait') }}</template>
              <template v-else-if="guestData.rsvpStatus === 'declined'">{{ $t('rsvp.sorryMissYou') }}</template>
              <template v-else>{{ $t('rsvp.hopeToSee') }}</template>
            </p>
          </div>

          <div v-else-if="guestData">
            <p class="text-charcoal-500 mb-6">
              {{ $t('rsvp.dearGuest', { name: guestData.name }) }}
            </p>

            <div v-if="rsvpError" class="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{{ rsvpError }}</div>

            <div class="space-y-3 mb-6">
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'confirmed' ? 'border-green-300 bg-green-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="confirmed" class="text-green-600" />
                <span class="text-sm font-medium">{{ $t('rsvp.accept') }}</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'declined' ? 'border-red-300 bg-red-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="declined" class="text-red-600" />
                <span class="text-sm font-medium">{{ $t('rsvp.decline') }}</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'maybe' ? 'border-yellow-300 bg-yellow-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="maybe" class="text-yellow-600" />
                <span class="text-sm font-medium">{{ $t('rsvp.maybe') }}</span>
              </label>
            </div>

            <div v-if="rsvpForm.rsvpStatus === 'confirmed'" class="mb-6 text-left">
              <label class="flex items-center gap-3 mb-3 cursor-pointer">
                <input type="checkbox" v-model="rsvpForm.plusOne" class="rounded text-champagne-600" />
                <span class="text-sm font-medium text-charcoal-500">{{ $t('rsvp.plusOne') }}</span>
              </label>
              <input
                v-if="rsvpForm.plusOne"
                v-model="rsvpForm.plusOneName"
                type="text"
                :placeholder="$t('rsvp.plusOneName')"
                class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500 focus:border-champagne-500"
              />
            </div>

            <button
              @click="submitRsvp"
              :disabled="!rsvpForm.rsvpStatus || rsvpSubmitting"
              class="w-full bg-champagne-600 text-white py-3 rounded-lg font-medium hover:bg-champagne-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ rsvpSubmitting ? $t('rsvp.submitting') : $t('rsvp.submit') }}
            </button>
          </div>

          <div v-else>
            <p class="text-charcoal-200">{{ $t('common.loading') }}</p>
          </div>
        </div>
      </section>

      <footer v-if="!invitation.removeBranding" class="text-center pt-8 border-t border-charcoal-100">
        <p class="text-xs text-charcoal-200">{{ $t('rsvp.poweredBy') }}</p>
      </footer>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Start the dev server and verify the page manually**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`.

In a browser, navigate to a paid event's invitation URL. You should see the chosen template rendered inside the page (via iframe), followed by the RSVP card. Verify:
- The iframe resizes to fit content (no scrollbar inside the iframe).
- Navigating to `?print=true` on the same URL redirects to `/api/invitations/<slug>/rendered.html` and prints cleanly.
- Submitting the RSVP form still updates the guest's status (refresh and verify).

If there is no seeded paid event, create one in the dashboard, run through the payment flow in Stripe test mode, pick a template, then retry.

- [ ] **Step 3: Clean up any Playwright screenshot artefacts**

Run: `rm -rf .playwright-mcp/`

- [ ] **Step 4: Commit**

```bash
git add pages/i/[slug].vue
git commit -m "feat(invitations): render selected template via iframe on public page"
```

---

## Task 9: Full test-suite check and wrap-up

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests pass. If any previously passing test now fails, investigate before wrapping up — the most likely cause is an assumption about the `/i/[slug]` page markup that changed.

- [ ] **Step 2: Type-check**

Run: `npx nuxi typecheck` (or `npx tsc --noEmit` if the Nuxt script is unavailable).
Expected: zero errors.

- [ ] **Step 3: Review the diff**

Run: `git log --oneline master..HEAD` and `git diff master..HEAD --stat`
Confirm all 8 commits are present and touch only the files listed in the File Structure section.

- [ ] **Step 4: Update spec status**

Edit `docs/superpowers/specs/2026-04-21-template-rendering-on-invitation-page-design.md` — change the `**Status:**` line from `Approved, awaiting implementation plan` to `Implemented`.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/specs/2026-04-21-template-rendering-on-invitation-page-design.md
git commit -m "docs: mark template-rendering spec as implemented"
```

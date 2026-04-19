# Template i18n Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make decorative text in templates translate to the user's active UI locale, by adding a new `{{t:<i18n.key>}}` token kind handled by the shared substitution helper and callers.

**Architecture:** Extend `substituteTemplate(html, data)` with an optional third argument — a translations object. Resolve `{{t:a.b.c}}` tokens by walking the object; unknown keys pass through unchanged. Add translated strings to `i18n/lang/{en,es}.json` under a new `templates` namespace. Update each template HTML to use tokens in place of hardcoded English decoration. Wire callers (Vue preview component, dev route, screenshot script) to pass translations in.

**Tech Stack:** TypeScript, Nuxt 3, `@nuxtjs/i18n`, vitest.

---

## File Structure

**Modified files:**
- `server/utils/template-substitute.ts` — extend `substituteTemplate` with optional translations arg; add `resolveTranslation` helper.
- `server/utils/__tests__/template-substitute.test.ts` — new tests for `t:` token resolution.
- `i18n/lang/en.json` — add `templates` namespace.
- `i18n/lang/es.json` — add `templates` namespace (Spanish strings).
- `components/invitation/TemplatePreview.vue` — pass `messages` from `useI18n()` as translations.
- `server/routes/dev/templates/[slug].get.ts` — load `i18n/lang/en.json` and pass as translations.
- `server/db/templates-screenshots.ts` — load `i18n/lang/en.json` and pass as translations.
- `server/db/templates/classic-elegant/template.html` — swap decorative text for tokens.
- `server/db/templates/delicate-elegant/template.html` — swap decorative text for tokens; add `text-transform: uppercase` on `.together`.
- `server/db/templates/modern-minimal/template.html` — swap decorative text for tokens.
- `server/db/templates/rustic-autumn/template.html` — swap decorative text for tokens.

**No new files.** Every change extends existing code or data.

---

## Task 1: Extend `substituteTemplate` to resolve `{{t:key}}` tokens

**Files:**
- Modify: `server/utils/template-substitute.ts`
- Modify: `server/utils/__tests__/template-substitute.test.ts`

- [ ] **Step 1: Write failing tests for the new behavior**

Append to `server/utils/__tests__/template-substitute.test.ts` inside the existing `describe('substituteTemplate', ...)` block:

```ts
  it('resolves {{t:a.b}} from a translations object', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Junto con sus familias' } },
    )
    expect(result).toBe('<p>Junto con sus familias</p>')
  })

  it('resolves deeply nested translation paths', () => {
    const result = substituteTemplate(
      '<p>{{t:a.b.c.d}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { a: { b: { c: { d: 'deep value' } } } },
    )
    expect(result).toBe('<p>deep value</p>')
  })

  it('passes unknown translation keys through unchanged', () => {
    const result = substituteTemplate(
      '<p>{{t:no.such.key}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi' } },
    )
    expect(result).toBe('<p>{{t:no.such.key}}</p>')
  })

  it('passes t: tokens through unchanged when translations arg is omitted', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
    )
    expect(result).toBe('<p>{{t:templates.together}}</p>')
  })

  it('resolves data and translation tokens in the same template', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p><h1>{{coupleName1}}</h1>',
      {
        coupleName1: 'Maria', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi' } },
    )
    expect(result).toBe('<p>Hi</p><h1>Maria</h1>')
  })

  it('does not re-expand placeholders that appear inside a translation value', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p>',
      {
        coupleName1: 'Maria', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi {{coupleName1}}' } },
    )
    expect(result).toBe('<p>Hi {{coupleName1}}</p>')
  })

  it('passes a t: token through when the resolved path is not a string', () => {
    const result = substituteTemplate(
      '<p>{{t:templates}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi' } },
    )
    expect(result).toBe('<p>{{t:templates}}</p>')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/utils/__tests__/template-substitute.test.ts`
Expected: the 4 existing tests pass; the new ones fail because `substituteTemplate` ignores extra args and leaves `t:` tokens in place.

- [ ] **Step 3: Extend the implementation**

Replace the entire contents of `server/utils/template-substitute.ts` with:

```ts
export type TemplateData = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  wording: string
}

export type TemplateTranslations = Record<string, unknown>

const TRANSLATION_TOKEN_REGEX = /\{\{t:([a-zA-Z0-9_.]+)\}\}/g

export function substituteTemplate(
  html: string,
  data: TemplateData,
  translations?: TemplateTranslations,
): string {
  let out = html
    .replace(/\{\{coupleName1\}\}/g, data.coupleName1)
    .replace(/\{\{coupleName2\}\}/g, data.coupleName2)
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{venue\}\}/g, data.venue)
    .replace(/\{\{venueAddress\}\}/g, data.venueAddress)
    .replace(/\{\{wording\}\}/g, data.wording)

  if (translations) {
    out = out.replace(TRANSLATION_TOKEN_REGEX, (match, path: string) => {
      const resolved = resolveTranslation(translations, path)
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

Note: data placeholders are substituted FIRST, then `t:` tokens. Because `TRANSLATION_TOKEN_REGEX` is only applied once and `resolveTranslation` returns a plain string, any `{{...}}` sequence that happens to appear inside a translation value is NOT re-expanded — matches the "no re-expansion" test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/utils/__tests__/template-substitute.test.ts`
Expected: 11/11 PASS (4 original + 7 new).

- [ ] **Step 5: Commit**

```bash
git add server/utils/template-substitute.ts server/utils/__tests__/template-substitute.test.ts
git commit -m "feat(templates): support {{t:key}} i18n tokens in substituteTemplate"
```

---

## Task 2: Add `templates` namespace to i18n files

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Add the namespace to `en.json`**

Open `i18n/lang/en.json`. Before the closing `}` of the top-level object (but inside it), add a new `templates` key. For example, if the file ends like:

```json
  "aria": {
    "toggleMenu": "Toggle menu"
  }
}
```

Change to:

```json
  "aria": {
    "toggleMenu": "Toggle menu"
  },
  "templates": {
    "together": "Together with their families",
    "venue": "Venue",
    "weddingInvitation": "Wedding Invitation",
    "weLookForward": "We look forward to celebrating with you",
    "honourOfYourPresence": "The honour of your presence is requested",
    "joyfullyRequest": "We joyfully request the honour of your presence",
    "and": "and"
  }
}
```

Note the comma added after the previous section's closing brace.

- [ ] **Step 2: Add the namespace to `es.json`**

Open `i18n/lang/es.json`. Make the same structural change. Use these Spanish values:

```json
  "templates": {
    "together": "Junto con sus familias",
    "venue": "Lugar",
    "weddingInvitation": "Invitación de boda",
    "weLookForward": "Esperamos celebrar contigo",
    "honourOfYourPresence": "Se solicita el honor de tu presencia",
    "joyfullyRequest": "Con alegría solicitamos el honor de tu presencia",
    "and": "y"
  }
```

- [ ] **Step 3: Validate JSON parses and keys are in parity**

Run:

```bash
node -e "
const fs = require('fs');
function flatten(obj, p='') { const o=[]; for (const k of Object.keys(obj)) { const path = p ? p+'.'+k : k; if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) o.push(...flatten(obj[k], path)); else o.push(path); } return o; }
const en = JSON.parse(fs.readFileSync('i18n/lang/en.json', 'utf8'));
const es = JSON.parse(fs.readFileSync('i18n/lang/es.json', 'utf8'));
const e = new Set(flatten(en)), s = new Set(flatten(es));
const miss = [...e].filter(k => !s.has(k)).concat([...s].filter(k => !e.has(k)));
console.log('EN keys:', e.size, 'ES keys:', s.size);
console.log('templates keys present in en:', Object.keys(en.templates || {}));
console.log('templates keys present in es:', Object.keys(es.templates || {}));
if (miss.length) { console.error('Key drift:', miss); process.exit(1); }
console.log('Parity OK');
"
```

Expected output:
```
EN keys: 376 ES keys: 376
templates keys present in en: [ 'together', 'venue', 'weddingInvitation', 'weLookForward', 'honourOfYourPresence', 'joyfullyRequest', 'and' ]
templates keys present in es: [ 'together', 'venue', 'weddingInvitation', 'weLookForward', 'honourOfYourPresence', 'joyfullyRequest', 'and' ]
Parity OK
```

(The exact total may differ if the file grew between drafting and implementation — the important part is that EN and ES have the same count.)

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n(templates): add templates namespace for decorative strings"
```

---

## Task 3: Tokenize `classic-elegant/template.html`

**Files:**
- Modify: `server/db/templates/classic-elegant/template.html`

- [ ] **Step 1: Replace the three decorative strings**

Open `server/db/templates/classic-elegant/template.html`. Find and replace these three lines:

```html
      <p class="together">Together with their families</p>
```
becomes
```html
      <p class="together">{{t:templates.together}}</p>
```

```html
        <h3>Venue</h3>
```
becomes
```html
        <h3>{{t:templates.venue}}</h3>
```

```html
      <p class="footer-note">The honour of your presence is requested</p>
```
becomes
```html
      <p class="footer-note">{{t:templates.honourOfYourPresence}}</p>
```

- [ ] **Step 2: Verify the file contains the expected tokens**

Run:

```bash
grep -c '{{t:' server/db/templates/classic-elegant/template.html
grep -n '{{t:' server/db/templates/classic-elegant/template.html
```

Expected: count is `3`, and the three lines match the replacements above.

- [ ] **Step 3: Confirm no hardcoded phrases remain**

Run:

```bash
grep -n 'Together with their families\|The honour of your presence is requested\|>Venue<' server/db/templates/classic-elegant/template.html
```

Expected: no output (the strings are gone). If any line appears, re-do Step 1 for that string.

- [ ] **Step 4: Commit**

```bash
git add server/db/templates/classic-elegant/template.html
git commit -m "i18n(templates): tokenize classic-elegant decoration"
```

---

## Task 4: Tokenize `rustic-autumn/template.html`

**Files:**
- Modify: `server/db/templates/rustic-autumn/template.html`

- [ ] **Step 1: Replace the three decorative strings**

Open `server/db/templates/rustic-autumn/template.html`. Find and replace:

```html
      <p class="together">Together with their families</p>
```
becomes
```html
      <p class="together">{{t:templates.together}}</p>
```

```html
        <h3>Venue</h3>
```
becomes
```html
        <h3>{{t:templates.venue}}</h3>
```

```html
      <p class="footer-note">We joyfully request the honour of your presence</p>
```
becomes
```html
      <p class="footer-note">{{t:templates.joyfullyRequest}}</p>
```

- [ ] **Step 2: Verify**

```bash
grep -c '{{t:' server/db/templates/rustic-autumn/template.html
grep -n 'Together with their families\|We joyfully request the honour of your presence\|>Venue<' server/db/templates/rustic-autumn/template.html
```

Expected: count `3`, no hardcoded phrases remain.

- [ ] **Step 3: Commit**

```bash
git add server/db/templates/rustic-autumn/template.html
git commit -m "i18n(templates): tokenize rustic-autumn decoration"
```

---

## Task 5: Tokenize `modern-minimal/template.html`

**Files:**
- Modify: `server/db/templates/modern-minimal/template.html`

- [ ] **Step 1: Replace the three decorative strings**

Open `server/db/templates/modern-minimal/template.html`. Find and replace:

```html
    <span class="tag">Wedding Invitation</span>
```
becomes
```html
    <span class="tag">{{t:templates.weddingInvitation}}</span>
```

```html
      <p class="venue-label">Venue</p>
```
becomes
```html
      <p class="venue-label">{{t:templates.venue}}</p>
```

```html
      <p>We look forward to celebrating with you</p>
```
becomes
```html
      <p>{{t:templates.weLookForward}}</p>
```

- [ ] **Step 2: Verify**

```bash
grep -c '{{t:' server/db/templates/modern-minimal/template.html
grep -n '>Wedding Invitation<\|>Venue<\|We look forward to celebrating with you' server/db/templates/modern-minimal/template.html
```

Expected: count `3`, no hardcoded phrases remain.

- [ ] **Step 3: Commit**

```bash
git add server/db/templates/modern-minimal/template.html
git commit -m "i18n(templates): tokenize modern-minimal decoration"
```

---

## Task 6: Tokenize `delicate-elegant/template.html` and add CSS uppercase

**Files:**
- Modify: `server/db/templates/delicate-elegant/template.html`

This template currently has literal uppercase text (`TOGETHER<br>WITH THEIR FAMILIES`) and a decorative `and` connector between couple names. We'll replace both with tokens; to preserve the visual design, we add `text-transform: uppercase` to the `.together` CSS rule so the English-normal-case translation renders uppercase in the output.

- [ ] **Step 1: Check the current `.together` CSS rule**

Run:

```bash
grep -n -A8 '^\s*\.together\s*{' server/db/templates/delicate-elegant/template.html
```

Note the rule body so you can modify it in the next step.

- [ ] **Step 2: Add `text-transform: uppercase` to `.together`**

In `server/db/templates/delicate-elegant/template.html`, find the `.together {` rule and add `text-transform: uppercase;` at the end of its body (before the closing `}`). For example, if the current rule is:

```css
  .together {
    font-family: 'Cinzel', serif;
    font-size: clamp(11px, 2.4vw, 16px);
    letter-spacing: 0.12em;
    color: #5a2a14;
  }
```

Change to:

```css
  .together {
    font-family: 'Cinzel', serif;
    font-size: clamp(11px, 2.4vw, 16px);
    letter-spacing: 0.12em;
    color: #5a2a14;
    text-transform: uppercase;
  }
```

Preserve whatever properties were already in the rule — only add the one new line.

- [ ] **Step 3: Replace the `<div class="together">` block**

Find:

```html
      <div class="together">
        TOGETHER<br>
        WITH THEIR FAMILIES
      </div>
```

Replace with:

```html
      <div class="together">{{t:templates.together}}</div>
```

- [ ] **Step 4: Replace the `<span class="and">` connector**

Find:

```html
        <span class="and">and</span>
```

Replace with:

```html
        <span class="and">{{t:templates.and}}</span>
```

- [ ] **Step 5: Verify**

```bash
grep -c '{{t:' server/db/templates/delicate-elegant/template.html
grep -n 'TOGETHER<br>\|>and<\|WITH THEIR FAMILIES' server/db/templates/delicate-elegant/template.html
grep -n 'text-transform: uppercase' server/db/templates/delicate-elegant/template.html
```

Expected:
- Count of `{{t:` is `2`.
- First `grep` for the old strings: no output.
- `text-transform: uppercase` appears at least once (within the `.together` rule).

- [ ] **Step 6: Commit**

```bash
git add server/db/templates/delicate-elegant/template.html
git commit -m "i18n(templates): tokenize delicate-elegant decoration and move uppercase to CSS"
```

---

## Task 7: Wire `TemplatePreview.vue` to pass translations

**Files:**
- Modify: `components/invitation/TemplatePreview.vue`

- [ ] **Step 1: Read the current script section**

Run:

```bash
sed -n '1,35p' components/invitation/TemplatePreview.vue
```

Locate the `useI18n()` destructure and the `renderedHtml` computed.

- [ ] **Step 2: Destructure `messages` and `locale` from `useI18n()`**

Find the line:

```ts
const { t } = useI18n()
```

Replace with:

```ts
const { t, locale, messages } = useI18n()
```

If the existing file already uses a different variable shape (e.g. the line may already say `const { t, locale } = useI18n()`), adjust to include the three properties: `t`, `locale`, `messages`. Do not remove any existing destructured property.

- [ ] **Step 3: Pass translations into `substituteTemplate`**

Find the existing computed:

```ts
const renderedHtml = computed(() => substituteTemplate(props.htmlTemplate, {
  coupleName1: props.coupleName1 || t('templatePreview.partner1'),
  coupleName2: props.coupleName2 || t('templatePreview.partner2'),
  date: props.date || t('templatePreview.weddingDate'),
  venue: props.venue || t('templatePreview.venue'),
  venueAddress: props.venueAddress || t('templatePreview.address'),
  wording: props.wording || t('templatePreview.wordingPlaceholder'),
}))
```

Replace with:

```ts
const renderedHtml = computed(() => substituteTemplate(
  props.htmlTemplate,
  {
    coupleName1: props.coupleName1 || t('templatePreview.partner1'),
    coupleName2: props.coupleName2 || t('templatePreview.partner2'),
    date: props.date || t('templatePreview.weddingDate'),
    venue: props.venue || t('templatePreview.venue'),
    venueAddress: props.venueAddress || t('templatePreview.address'),
    wording: props.wording || t('templatePreview.wordingPlaceholder'),
  },
  (messages.value[locale.value] as Record<string, unknown>) ?? {},
))
```

- [ ] **Step 4: Re-run the vitest suite as a smoke test**

Run:

```bash
npx vitest run
```

Expected: ALL tests pass. No new tests were added for this file, but the template-substitute tests still pass, confirming the helper contract hasn't drifted.

- [ ] **Step 5: Manual dashboard check**

If a dev server is running at localhost:3000 and you can open a browser, go to `/dashboard/events/new`, pick a template, toggle UI language to Spanish (or whatever locale switcher the app provides), and confirm decorative strings now render in Spanish. If you cannot run the browser (e.g., as a subagent), skip and note the deferral — Task 9 (regenerating preview via dev route) and the final user-level verification will also exercise this path.

- [ ] **Step 6: Commit**

```bash
git add components/invitation/TemplatePreview.vue
git commit -m "feat(templates): hydrate decorative strings in preview with current locale"
```

---

## Task 8: Wire the dev preview route to pass translations

**Files:**
- Modify: `server/routes/dev/templates/[slug].get.ts`

- [ ] **Step 1: Replace the route file contents**

Replace `server/routes/dev/templates/[slug].get.ts` with:

```ts
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { substituteTemplate } from '~/server/utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const EN_LOCALE_PATH = 'i18n/lang/en.json'
const SAMPLE_DATA = {
  coupleName1: 'Maria',
  coupleName2: 'James',
  date: 'Saturday, June 14th, 2026',
  venue: 'The Grand Ballroom',
  venueAddress: '123 Wedding Lane, City',
  wording: 'Together with their families, they invite you to celebrate\ntheir marriage.',
}

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  const htmlPath = join(TEMPLATES_DIR, slug, 'template.html')
  if (!existsSync(htmlPath)) {
    const available = readdirSync(TEMPLATES_DIR).filter(d => existsSync(join(TEMPLATES_DIR, d, 'template.html')))
    throw createError({
      statusCode: 404,
      statusMessage: `Template "${slug}" not found. Available: ${available.join(', ')}`,
    })
  }

  const html = readFileSync(htmlPath, 'utf-8')
  const translations = JSON.parse(readFileSync(EN_LOCALE_PATH, 'utf-8'))
  const rendered = substituteTemplate(html, SAMPLE_DATA, translations)
  const absolutePath = join(process.cwd(), htmlPath)

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Preview: ${slug}</title>
<style>
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #f5f5f5; }
  header { padding: 12px 20px; background: #111; color: #eee; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  header .slug { font-weight: 600; }
  header .path { font-family: ui-monospace, monospace; color: #aaa; }
  iframe { border: none; width: 100%; height: calc(100vh - 49px); background: #fff; display: block; }
</style>
</head>
<body>
<header>
  <span class="slug">${slug}</span>
  <span class="path">${absolutePath}</span>
</header>
<iframe srcdoc="${rendered.replace(/"/g, '&quot;')}"></iframe>
</body>
</html>`
})
```

The only change versus the previous version: a new `EN_LOCALE_PATH` constant, a `readFileSync` of the JSON, and the third argument passed to `substituteTemplate`.

- [ ] **Step 2: Verify the dev route renders a tokenized template in English**

If the dev server is running, run:

```bash
curl -s http://localhost:3000/dev/templates/classic-elegant | grep -o 'Together with their families\|{{t:' | head -5
```

Expected: `Together with their families` appears (token resolved). `{{t:` should NOT appear (all tokens resolved to strings).

If the dev server isn't running, skip; Task 10 (E2E verification) will cover it.

- [ ] **Step 3: Commit**

```bash
git add server/routes/dev/templates/[slug].get.ts
git commit -m "feat(templates): resolve i18n tokens in /dev/templates preview route"
```

---

## Task 9: Wire the screenshot script to pass translations

**Files:**
- Modify: `server/db/templates-screenshots.ts`

- [ ] **Step 1: Read the file**

Run:

```bash
cat server/db/templates-screenshots.ts
```

Locate the `substituteTemplate(html, SAMPLE_DATA)` call inside the generation loop.

- [ ] **Step 2: Add translations loading and pass them in**

Make these two targeted changes to `server/db/templates-screenshots.ts`:

1. At the top of the file, below `const IMAGES_DIR = 'public/images/templates'`, add:

```ts
const EN_LOCALE_PATH = 'i18n/lang/en.json'
```

2. Inside `async function main()`, before `const browser = await puppeteer.launch(...)`, add:

```ts
  const translations = JSON.parse(readFileSync(EN_LOCALE_PATH, 'utf-8'))
```

3. Change the line:

```ts
      const rendered = substituteTemplate(html, SAMPLE_DATA)
```

to:

```ts
      const rendered = substituteTemplate(html, SAMPLE_DATA, translations)
```

`readFileSync` is already imported at the top of the file from `'fs'`, so no new imports.

- [ ] **Step 3: Dry-run the script against a fresh image path**

Delete the four current preview JPGs for templates that changed (keep `minimalist.jpg` — it has no tokens so re-gen would be redundant):

```bash
rm -f public/images/templates/classic-elegant.jpg \
      public/images/templates/rustic-autumn.jpg \
      public/images/templates/modern-minimal.jpg \
      public/images/templates/delicate-elegant.jpg
npm run templates:screenshots
```

Expected output includes `generated=4`, `skipped=1` (minimalist). All four regenerated JPGs exist in `public/images/templates/`.

- [ ] **Step 4: Visual sanity check**

Open each regenerated JPG (or verify via `ls -la` that each is >5 KB):

```bash
ls -la public/images/templates/*.jpg
```

Expected: all five templates have a JPG, and each regenerated one shows the **English** decorative strings (because we always render screenshots in English). No `{{t:...}}` text should be visible.

If you can open the images, confirm decorative text like "Together with their families" appears rendered, not as raw tokens.

- [ ] **Step 5: Commit**

```bash
git add server/db/templates-screenshots.ts public/images/templates/*.jpg
git commit -m "feat(templates): pass translations to screenshot renderer"
```

---

## Task 10: End-to-end verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including `template-substitute.test.ts` (11 tests) and `load-templates.test.ts`, and no regressions elsewhere.

- [ ] **Step 2: Seed templates against the local DB**

Run: `npm run db:seed-templates`
Expected: `[seed-templates] upserted 5 templates.`

- [ ] **Step 3: Verify all four tokenized templates render correctly via the dev route**

If the dev server is up, run:

```bash
for slug in classic-elegant rustic-autumn modern-minimal delicate-elegant; do
  count=$(curl -s "http://localhost:3000/dev/templates/$slug" | grep -c '{{t:')
  echo "$slug: unresolved tokens = $count"
done
```

Expected:
```
classic-elegant: unresolved tokens = 0
rustic-autumn: unresolved tokens = 0
modern-minimal: unresolved tokens = 0
delicate-elegant: unresolved tokens = 0
```

(Any non-zero means a token didn't resolve — likely a typo in the template or a missing i18n key.)

- [ ] **Step 4: Verify locale switching in the dashboard preview (manual)**

Start the dev server if not running, visit `/dashboard/events/new`, pick a template (e.g. classic-elegant), switch UI language to Spanish, and confirm the template preview iframe shows Spanish decoration ("Junto con sus familias" etc.). Switch back to English and confirm it reverts.

If running as an agent without browser access, skip and note the deferral.

- [ ] **Step 5: Final commit (if anything changed during verification)**

Only needed if Steps 1-4 produced file changes (they normally shouldn't). Run `git status`; if clean, move on.

---

## Self-Review Notes

**Spec coverage:**
- Token syntax `{{t:key.path}}` → Task 1.
- New `templates` i18n namespace in EN + ES files → Task 2.
- Helper extension with optional translations arg → Task 1.
- Data and translation tokens coexist, single-pass, no re-expansion → Task 1 test cases.
- Unknown translation key passes through → Task 1 test case.
- Missing `translations` arg preserves backward compat → Task 1 test case.
- TemplatePreview.vue wired via `messages.value[locale.value]` → Task 7.
- Dev route loads `en.json` from disk → Task 8.
- Screenshot script loads `en.json` from disk → Task 9.
- Every template with decorative text gets tokenized → Tasks 3, 4, 5, 6.
- Minimalist untouched → correctly absent from task list.
- `delicate-elegant` CSS uppercase → Task 6 Step 2.
- Preview JPG regeneration → Task 9 Step 3.

**Placeholder scan:** no TBDs. Every code block is complete, every command has expected output.

**Type consistency:** `TemplateTranslations = Record<string, unknown>`, `substituteTemplate(html, data, translations?)` referenced identically across Task 1, 7, 8, 9. `TemplateData` unchanged. `EN_LOCALE_PATH` used in both Task 8 and Task 9.

**Out of spec (correctly deferred):** guest-facing rendering, per-language screenshots, `?lang=` query for dev route, admin UI.

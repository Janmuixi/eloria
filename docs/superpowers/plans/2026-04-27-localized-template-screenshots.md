# Localized Template Screenshots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate template preview screenshots in both English and Spanish, and have the frontend pick the locale-correct image based on the active i18n locale.

**Architecture:** Two changes. (1) The build-time screenshot generator (`server/db/templates-screenshots.ts`) now loops over a `LOCALES` list, reading sample data from each locale file's new `templates.sampleData` block and writing JPGs to `public/images/templates/<locale>/<slug>.jpg`. (2) A new client composable `useTemplatePreviewUrl()` reads the active locale via `useI18n()` and returns the locale-correct path; the two consumer pages call it instead of dereferencing `template.previewImageUrl`. The DB column, the templates API, and seed/load code are unchanged.

**Tech Stack:** TypeScript, Nuxt 3, `@nuxtjs/i18n`, Puppeteer (screenshot script), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-27-localized-template-screenshots-design.md`

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `i18n/lang/en.json` | Modify | Add `templates.sampleData` block (English placeholder names/date/venue/wording) |
| `i18n/lang/es.json` | Modify | Add `templates.sampleData` block (Spanish equivalents) |
| `server/db/templates-screenshots.ts` | Modify | Loop over locales, validate sample data, write to `<locale>/<slug>.jpg` |
| `public/images/templates/*.jpg` | Delete | One-shot deletion of the 6 existing top-level screenshots |
| `public/images/templates/{en,es}/*.jpg` | Create | New locale-keyed screenshots produced by the updated script |
| `composables/useTemplatePreviewUrl.ts` | Create | Returns locale-aware preview URL given a template |
| `pages/templates/index.vue` | Modify | Add `slug` to `Template` type, use composable for `<img :src>` |
| `pages/dashboard/events/new.vue` | Modify | Use composable for the two `<img :src>` blocks |

The composable lives in `composables/` so Nuxt auto-imports it (the existing `useAuth.ts` follows the same pattern). Sample data is colocated with the rest of the locale strings rather than in its own file because the spec calls for a single source of truth for locale-keyed copy.

---

## Task 1: Add `templates.sampleData` to both locale files

**Files:**
- Modify: `i18n/lang/en.json` (after line 371, the `"and": "and",` entry inside the `"templates"` object)
- Modify: `i18n/lang/es.json` (after line 371, the `"and": "y",` entry inside the `"templates"` object)

- [ ] **Step 1: Insert the EN sample data block**

In `i18n/lang/en.json`, find this region:

```json
    "and": "and",
    "rustic-autumn": {
```

Insert a `sampleData` object between them so the file reads:

```json
    "and": "and",
    "sampleData": {
      "coupleName1": "Maria",
      "coupleName2": "James",
      "date": "Saturday, June 14th, 2026",
      "venue": "The Grand Ballroom",
      "venueAddress": "123 Wedding Lane, City",
      "wording": "Together with their families, they invite you to celebrate\ntheir marriage."
    },
    "rustic-autumn": {
```

- [ ] **Step 2: Insert the ES sample data block**

In `i18n/lang/es.json`, find this region:

```json
    "and": "y",
    "rustic-autumn": {
```

Insert the localized sample data:

```json
    "and": "y",
    "sampleData": {
      "coupleName1": "María",
      "coupleName2": "Jaime",
      "date": "sábado, 14 de junio de 2026",
      "venue": "El Gran Salón",
      "venueAddress": "Calle de la Boda 123, Ciudad",
      "wording": "Junto a sus familias, les invitan a celebrar\nsu matrimonio."
    },
    "rustic-autumn": {
```

- [ ] **Step 3: Validate JSON syntax**

Run: `python3 -c "import json; json.load(open('i18n/lang/en.json')); json.load(open('i18n/lang/es.json')); print('ok')"`

Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n: add templates.sampleData for screenshot generator"
```

---

## Task 2: Make the screenshot generator locale-aware

**Files:**
- Modify: `server/db/templates-screenshots.ts` (full-file rewrite — see step 1)

- [ ] **Step 1: Replace the file contents**

Overwrite `server/db/templates-screenshots.ts` with the following:

```ts
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer'
import { substituteTemplate, type TemplateData } from '../utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const IMAGES_DIR = 'public/images/templates'
const LOCALES = ['en', 'es'] as const
const LOCALE_FILE = (locale: string) => `i18n/lang/${locale}.json`
const VIEWPORT = { width: 800, height: 1200 }

const REQUIRED_SAMPLE_FIELDS: (keyof TemplateData)[] = [
  'coupleName1', 'coupleName2', 'date', 'venue', 'venueAddress', 'wording',
]

function loadLocaleData(locale: string): { translations: Record<string, unknown>; sampleData: TemplateData } {
  const path = LOCALE_FILE(locale)
  if (!existsSync(path)) {
    throw new Error(`[screenshots] locale file missing: ${path}`)
  }
  const translations = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
  const templates = translations.templates as Record<string, unknown> | undefined
  const sample = templates?.sampleData as Partial<TemplateData> | undefined
  if (!sample) {
    throw new Error(`[screenshots] ${path} is missing templates.sampleData`)
  }
  for (const field of REQUIRED_SAMPLE_FIELDS) {
    if (typeof sample[field] !== 'string' || sample[field] === '') {
      throw new Error(`[screenshots] ${path} templates.sampleData.${field} is missing or not a non-empty string`)
    }
  }
  return { translations, sampleData: sample as TemplateData }
}

async function main() {
  const slugs = readdirSync(TEMPLATES_DIR)
    .filter(entry => statSync(join(TEMPLATES_DIR, entry)).isDirectory())
    .sort()

  type Job = { locale: string; slug: string; outPath: string; translations: Record<string, unknown>; sampleData: TemplateData }
  const jobs: Job[] = []
  let skipped = 0

  for (const locale of LOCALES) {
    const localeDir = join(IMAGES_DIR, locale)
    if (!existsSync(localeDir)) {
      mkdirSync(localeDir, { recursive: true })
    }
    const { translations, sampleData } = loadLocaleData(locale)
    for (const slug of slugs) {
      const outPath = join(localeDir, `${slug}.jpg`)
      if (existsSync(outPath)) {
        console.log(`[screenshots] skipped ${locale}/${slug} (image exists)`)
        skipped++
        continue
      }
      jobs.push({ locale, slug, outPath, translations, sampleData })
    }
  }

  if (jobs.length === 0) {
    console.log('[screenshots] nothing to do.')
    return
  }

  console.log(`[screenshots] generating ${jobs.length} image(s)...`)
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  try {
    for (const job of jobs) {
      const html = readFileSync(join(TEMPLATES_DIR, job.slug, 'template.html'), 'utf-8')
      const rendered = substituteTemplate(html, job.sampleData, job.translations)
      const page = await browser.newPage()
      await page.setViewport(VIEWPORT)
      await page.setContent(rendered, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const card = await page.$('.invitation, .card')
      const buffer = card
        ? await card.screenshot({ type: 'jpeg', quality: 85 })
        : await page.screenshot({ type: 'jpeg', quality: 85, fullPage: false })
      writeFileSync(job.outPath, buffer)
      await page.close()
      console.log(`[screenshots] wrote ${job.outPath}`)
    }
  } finally {
    await browser.close()
  }
  console.log(`[screenshots] done. generated=${jobs.length}, skipped=${skipped}`)
}

main().catch(err => {
  console.error('[screenshots] failed:', err)
  process.exit(1)
})
```

Key changes vs. the previous version:
- `EN_LOCALE_PATH` and the hardcoded `SAMPLE_DATA` constant are gone.
- A `LOCALES` tuple drives the outer loop.
- `loadLocaleData()` validates that `templates.sampleData` is present and complete, throwing a clear error if not.
- Per-locale subdirectories are created if missing.
- The "skip if exists" check is now per `(locale, slug)` and keyed off `<locale>/<slug>.jpg`.
- Browser is still launched once and reused across the whole run.

- [ ] **Step 2: Type-check the script in isolation**

Run: `npx tsc --noEmit server/db/templates-screenshots.ts 2>&1 | head -30`

Expected: no errors. (If `tsc` complains about `TemplateData` import being type-only, that's because of `verbatimModuleSyntax` — already handled by `import { substituteTemplate, type TemplateData }`.)

- [ ] **Step 3: Smoke-test the validation guard**

Temporarily corrupt the locale data and confirm the script fails fast. From the project root run:

```bash
node -e "
const { readFileSync, writeFileSync } = require('fs');
const orig = readFileSync('i18n/lang/en.json', 'utf-8');
const obj = JSON.parse(orig);
delete obj.templates.sampleData;
writeFileSync('i18n/lang/en.json', JSON.stringify(obj, null, 2));
"
npm run templates:screenshots; echo "exit=$?"
```

Expected: command exits non-zero with a message containing `templates.sampleData`. Restore the file with:

```bash
git checkout -- i18n/lang/en.json
```

- [ ] **Step 4: Commit**

```bash
git add server/db/templates-screenshots.ts
git commit -m "feat(screenshots): generate per-locale template previews"
```

---

## Task 3: Wipe stale screenshots and regenerate both locales

This task is a one-shot operational step — no code changes.

**Files:**
- Delete: `public/images/templates/classic-elegant.jpg`, `delicate-elegant.jpg`, `minimalist.jpg`, `modern-minimal.jpg`, `modern-wedding.jpg`, `rustic-autumn.jpg`
- Create (via script): `public/images/templates/en/<slug>.jpg` × 6, `public/images/templates/es/<slug>.jpg` × 6

- [ ] **Step 1: Remove the 6 existing top-level JPGs**

Run:

```bash
git rm public/images/templates/classic-elegant.jpg \
       public/images/templates/delicate-elegant.jpg \
       public/images/templates/minimalist.jpg \
       public/images/templates/modern-minimal.jpg \
       public/images/templates/modern-wedding.jpg \
       public/images/templates/rustic-autumn.jpg
```

Expected: 6 files staged for deletion. Verify with `git status`.

- [ ] **Step 2: Run the generator**

Run: `npm run templates:screenshots`

Expected output: lines logging `wrote public/images/templates/en/<slug>.jpg` and `wrote public/images/templates/es/<slug>.jpg` for each of the 6 templates (12 lines total), followed by `[screenshots] done. generated=12, skipped=0`.

- [ ] **Step 3: Verify the output**

Run:

```bash
ls public/images/templates/en/ && echo --- && ls public/images/templates/es/
```

Expected: each directory lists exactly 6 files matching the template slugs (`classic-elegant.jpg`, `delicate-elegant.jpg`, `minimalist.jpg`, `modern-minimal.jpg`, `modern-wedding.jpg`, `rustic-autumn.jpg`).

- [ ] **Step 4: Spot-check one screenshot per locale**

Open `public/images/templates/en/classic-elegant.jpg` and `public/images/templates/es/classic-elegant.jpg` in an image viewer. The EN one must read names "Maria" and "James" with English connector "and" and English wording. The ES one must read "María" and "Jaime" with connector "y" and Spanish wording. If either is wrong, stop and investigate before committing.

- [ ] **Step 5: Commit**

```bash
git add public/images/templates/
git commit -m "assets: regenerate template screenshots for en and es"
```

(`git add public/images/templates/` will both stage the new files and finalize the deletions from step 1.)

---

## Task 4: Add the `useTemplatePreviewUrl` composable

**Files:**
- Create: `composables/useTemplatePreviewUrl.ts`

- [ ] **Step 1: Create the composable file**

Write the following to `composables/useTemplatePreviewUrl.ts`:

```ts
export function useTemplatePreviewUrl() {
  const { locale } = useI18n()
  return (template: { slug: string }) =>
    `/images/templates/${locale.value}/${template.slug}.jpg`
}
```

Notes:
- No explicit imports — `useI18n` is auto-imported by `@nuxtjs/i18n` and `defineNuxtPlugin` patterns are not needed here.
- Returns a function (not a `computed`) so a single call site inside a `v-for` can build URLs for many templates without manually constructing per-template computeds.
- Reactivity is preserved because `locale` is a Nuxt ref — Vue re-runs `:src="previewUrl(template)"` when the locale changes.

- [ ] **Step 2: Type-check the project**

Run: `npx nuxi typecheck 2>&1 | tail -20`

Expected: no new errors related to `useTemplatePreviewUrl.ts`. If `nuxi typecheck` is unavailable in this project, fall back to: `npx tsc --noEmit -p . 2>&1 | tail -20`.

- [ ] **Step 3: Commit**

```bash
git add composables/useTemplatePreviewUrl.ts
git commit -m "feat(templates): add useTemplatePreviewUrl composable"
```

---

## Task 5: Switch `pages/templates/index.vue` to the composable

**Files:**
- Modify: `pages/templates/index.vue`

- [ ] **Step 1: Add `slug` to the `Template` interface**

Locate the existing interface (around lines 22–29):

```ts
interface Template {
  id: number
  name: string
  category: string
  previewImageUrl: string
  minimumTierId: number
  tier: { slug: string; name: string } | null
}
```

Add a `slug` field so it becomes:

```ts
interface Template {
  id: number
  slug: string
  name: string
  category: string
  previewImageUrl: string
  minimumTierId: number
  tier: { slug: string; name: string } | null
}
```

(Keep `previewImageUrl` in place — the API still returns it; we simply stop using it.)

- [ ] **Step 2: Instantiate the composable**

Below the existing `const { t } = useI18n()` line at the top of `<script setup>`, add:

```ts
const previewUrl = useTemplatePreviewUrl()
```

- [ ] **Step 3: Update the `<img>` and its guard**

Locate the block around lines 95–101:

```html
<img
  v-if="template.previewImageUrl && !brokenImages.has(template.id)"
  :src="template.previewImageUrl"
  :alt="template.name"
  class="w-full h-full object-contain"
  @error="onImageError(template.id)"
/>
```

Replace with:

```html
<img
  v-if="!brokenImages.has(template.id)"
  :src="previewUrl(template)"
  :alt="template.name"
  class="w-full h-full object-contain"
  @error="onImageError(template.id)"
/>
```

- [ ] **Step 4: Boot the dev server and verify**

Run: `npm run dev` (background it, or run in a second terminal).

Visit `http://localhost:3000/templates`. Expected:
- The grid loads with 6 templates and EN previews showing names "Maria"/"James".
- Open browser devtools → Network: image requests are to `/images/templates/en/<slug>.jpg` and return 200.

Switch the site language to Spanish (header language switcher). Expected:
- The same 6 cards now show ES previews ("María"/"Jaime"), and image requests are to `/images/templates/es/<slug>.jpg`.
- No broken-image fallbacks (no purple/amber gradients).

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add pages/templates/index.vue
git commit -m "feat(templates): use locale-aware preview URLs on /templates"
```

---

## Task 6: Switch `pages/dashboard/events/new.vue` to the composable

**Files:**
- Modify: `pages/dashboard/events/new.vue`

- [ ] **Step 1: Instantiate the composable**

Find a stable location near the top of the existing `<script setup>` (e.g. near `const recommendedTemplates = ref<any[]>([])` at line 64). Add:

```ts
const previewUrl = useTemplatePreviewUrl()
```

- [ ] **Step 2: Update the first `<img>` block**

Locate the block around lines 446–448:

```html
<img
  v-if="tpl.previewImageUrl"
  :src="tpl.previewImageUrl"
  :alt="tpl.name"
  ...
/>
```

Replace the two attribute lines so it becomes:

```html
<img
  v-if="tpl.slug"
  :src="previewUrl(tpl)"
  :alt="tpl.name"
  ...
/>
```

(Leave any other attributes — class names, etc. — untouched.)

- [ ] **Step 3: Update the second `<img>` block**

Locate the block around lines 477–479. Apply the same replacement: change `v-if="tpl.previewImageUrl"` to `v-if="tpl.slug"` and `:src="tpl.previewImageUrl"` to `:src="previewUrl(tpl)"`.

- [ ] **Step 4: Boot the dev server and verify**

Run: `npm run dev`.

Visit `http://localhost:3000/dashboard/events/new` (sign in if required). Expected:
- The "Recommended" row and the "All templates" grid both show locale-correct images.
- Network requests go to `/images/templates/en/...` (or `/es/...` if the locale is Spanish).

Switch language and confirm the images update on the same page.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add pages/dashboard/events/new.vue
git commit -m "feat(templates): use locale-aware preview URLs in event creation"
```

---

## Task 7: Final verification

**Files:** none.

- [ ] **Step 1: Run the existing test suite**

Run: `npm test`

Expected: all existing tests pass. (We did not add any new tests; this confirms the API/load/seed changes were truly zero.)

- [ ] **Step 2: Re-run the screenshot script as a no-op check**

Run: `npm run templates:screenshots`

Expected: `[screenshots] nothing to do.` (All 12 files exist; the per-`(locale, slug)` skip-if-exists logic kicks in.)

- [ ] **Step 3: Confirm clean git tree**

Run: `git status`

Expected: working tree clean. All commits from Tasks 1–6 are on the current branch.

---

## Self-review notes

- **Spec coverage:** Every section of the spec maps to a task. Locale file changes → Task 1. Generator changes → Task 2. Initial migration → Task 3. Composable → Task 4. Consumer changes (templates page) → Task 5. Consumer changes (events/new) → Task 6. Manual testing checklist → Tasks 3 step 4, 5 step 4, 6 step 4, and 7 step 1.
- **No DB / API / load-templates / test changes:** consistent with the spec's "Non-goals" and "Frontend section" — Tasks 5 and 6 only touch frontend Vue files, and Task 7 step 1 verifies the existing tests still pass.
- **Type consistency:** the composable signature `(template: { slug: string }) => string` matches the structural use in both `pages/templates/index.vue` (after Task 5 step 1 adds `slug`) and `pages/dashboard/events/new.vue` (where `tpl` is `any`).

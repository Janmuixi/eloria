# Template Authoring Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert template authoring from inline JS string literals to a file-oriented workflow: `server/db/templates/<slug>/template.html` + `meta.json`, with idempotent upsert seeding, a dev preview route, and an idempotent screenshot command.

**Architecture:** Each template becomes a folder on disk. A shared substitution helper replaces `{{placeholder}}` tokens; both the Vue component and the new dev route use it. The seed script walks the templates directory, validates metadata, resolves tier slugs, and upserts via drizzle's `onConflictDoUpdate`. A puppeteer script generates missing preview images. No DB schema changes.

**Tech Stack:** TypeScript, Nuxt 3, drizzle-orm, better-sqlite3, vitest, puppeteer.

---

## File Structure

**New files:**
- `server/utils/template-substitute.ts` — shared placeholder substitution function (used by `TemplatePreview.vue` and the dev preview route).
- `server/utils/__tests__/template-substitute.test.ts` — unit tests for the helper.
- `server/db/templates/rustic-autumn/template.html` — extracted from current `seed-templates.ts`.
- `server/db/templates/rustic-autumn/meta.json`
- `server/db/templates/modern-minimal/template.html`
- `server/db/templates/modern-minimal/meta.json`
- `server/db/templates/classic-elegant/template.html`
- `server/db/templates/classic-elegant/meta.json`
- `server/db/load-templates.ts` — pure loader module: reads the templates dir, validates, returns insert-ready rows. Testable without touching the DB.
- `server/db/__tests__/load-templates.test.ts` — unit tests with a tmp fixture directory.
- `server/db/templates-screenshots.ts` — standalone tsx script for the `templates:screenshots` npm command.
- `server/routes/dev/templates/[slug].get.ts` — Nitro route for dev preview.

**Modified files:**
- `server/db/seed-templates.ts` — replace body with the dir-walking + upsert logic.
- `components/invitation/TemplatePreview.vue` — replace inline substitution with the shared helper.
- `package.json` — add `templates:screenshots` npm script.

---

## Task 1: Shared substitution helper

**Files:**
- Create: `server/utils/template-substitute.ts`
- Create: `server/utils/__tests__/template-substitute.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/utils/__tests__/template-substitute.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { substituteTemplate } from '../template-substitute'

describe('substituteTemplate', () => {
  it('replaces all six placeholders', () => {
    const html = '<p>{{coupleName1}} & {{coupleName2}}</p><p>{{date}}</p><p>{{venue}} - {{venueAddress}}</p><p>{{wording}}</p>'
    const result = substituteTemplate(html, {
      coupleName1: 'Alex',
      coupleName2: 'Jordan',
      date: 'June 14, 2026',
      venue: 'Old Mill',
      venueAddress: '123 River Lane',
      wording: 'Please join us',
    })
    expect(result).toBe('<p>Alex & Jordan</p><p>June 14, 2026</p><p>Old Mill - 123 River Lane</p><p>Please join us</p>')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    const html = '{{coupleName1}} and {{coupleName1}}'
    const result = substituteTemplate(html, {
      coupleName1: 'Alex',
      coupleName2: '',
      date: '',
      venue: '',
      venueAddress: '',
      wording: '',
    })
    expect(result).toBe('Alex and Alex')
  })

  it('leaves unknown placeholders untouched', () => {
    const html = '{{coupleName1}} and {{unknown}}'
    const result = substituteTemplate(html, {
      coupleName1: 'Alex',
      coupleName2: '',
      date: '',
      venue: '',
      venueAddress: '',
      wording: '',
    })
    expect(result).toBe('Alex and {{unknown}}')
  })

  it('is idempotent: re-applying with the same data produces the same output', () => {
    const html = '<p>{{coupleName1}}</p>'
    const data = {
      coupleName1: 'Alex',
      coupleName2: '',
      date: '',
      venue: '',
      venueAddress: '',
      wording: '',
    }
    const once = substituteTemplate(html, data)
    const twice = substituteTemplate(once, data)
    expect(twice).toBe(once)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/utils/__tests__/template-substitute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

Create `server/utils/template-substitute.ts`:

```ts
export type TemplateData = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  wording: string
}

export function substituteTemplate(html: string, data: TemplateData): string {
  return html
    .replace(/\{\{coupleName1\}\}/g, data.coupleName1)
    .replace(/\{\{coupleName2\}\}/g, data.coupleName2)
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{venue\}\}/g, data.venue)
    .replace(/\{\{venueAddress\}\}/g, data.venueAddress)
    .replace(/\{\{wording\}\}/g, data.wording)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/utils/__tests__/template-substitute.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/template-substitute.ts server/utils/__tests__/template-substitute.test.ts
git commit -m "feat(templates): add shared substitution helper"
```

---

## Task 2: Rewire TemplatePreview.vue to use the shared helper

**Files:**
- Modify: `components/invitation/TemplatePreview.vue`

The component currently duplicates the substitution logic inline. Swap it for the shared helper.

- [ ] **Step 1: Read the current file**

Open `components/invitation/TemplatePreview.vue` and locate the `renderedHtml` computed (around lines 14-23).

- [ ] **Step 2: Replace the substitution block**

Change this block:

```ts
const renderedHtml = computed(() => {
  let html = props.htmlTemplate
  html = html.replace(/\{\{coupleName1\}\}/g, props.coupleName1 || t('templatePreview.partner1'))
  html = html.replace(/\{\{coupleName2\}\}/g, props.coupleName2 || t('templatePreview.partner2'))
  html = html.replace(/\{\{date\}\}/g, props.date || t('templatePreview.weddingDate'))
  html = html.replace(/\{\{venue\}\}/g, props.venue || t('templatePreview.venue'))
  html = html.replace(/\{\{venueAddress\}\}/g, props.venueAddress || t('templatePreview.address'))
  html = html.replace(/\{\{wording\}\}/g, props.wording || t('templatePreview.wordingPlaceholder'))
  return html
})
```

To:

```ts
import { substituteTemplate } from '~/server/utils/template-substitute'

const renderedHtml = computed(() => substituteTemplate(props.htmlTemplate, {
  coupleName1: props.coupleName1 || t('templatePreview.partner1'),
  coupleName2: props.coupleName2 || t('templatePreview.partner2'),
  date: props.date || t('templatePreview.weddingDate'),
  venue: props.venue || t('templatePreview.venue'),
  venueAddress: props.venueAddress || t('templatePreview.address'),
  wording: props.wording || t('templatePreview.wordingPlaceholder'),
}))
```

The `import` goes at the top of the `<script setup>` block alongside the existing imports.

- [ ] **Step 3: Manually verify the component still works**

Start the dev server if it's not already up: `npm run dev` (background), then navigate to `http://localhost:3000/dashboard/events/new` and confirm the template preview iframes still render correctly. The output should be visually identical to before.

If you're running this as a subagent and can't interact with a browser, skip manual verification and note in the report that this step was deferred.

- [ ] **Step 4: Commit**

```bash
git add components/invitation/TemplatePreview.vue
git commit -m "refactor(templates): use shared substituteTemplate helper in preview"
```

---

## Task 3: Extract existing templates to files

**Files:**
- Create: `server/db/templates/rustic-autumn/template.html`
- Create: `server/db/templates/rustic-autumn/meta.json`
- Create: `server/db/templates/modern-minimal/template.html`
- Create: `server/db/templates/modern-minimal/meta.json`
- Create: `server/db/templates/classic-elegant/template.html`
- Create: `server/db/templates/classic-elegant/meta.json`

The three HTML strings are currently inline in `server/db/seed-templates.ts`. Move each one to its own file verbatim (no content changes) and create the matching `meta.json`.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p server/db/templates/rustic-autumn server/db/templates/modern-minimal server/db/templates/classic-elegant
```

- [ ] **Step 2: Extract `rustic-autumn/template.html`**

Open `server/db/seed-templates.ts` and copy the value of the `rusticAutumnHtml` constant (everything between the backticks, lines 10-197) into `server/db/templates/rustic-autumn/template.html`. Preserve whitespace and every character.

- [ ] **Step 3: Create `rustic-autumn/meta.json`**

```json
{
  "name": "Rustic Autumn",
  "category": "rustic",
  "colorScheme": {
    "primary": "#b8834a",
    "secondary": "#c4956a",
    "background": "#fdf6ee",
    "text": "#4a3728",
    "accent": "#5c3d20"
  },
  "fontPairings": {
    "heading": "Playfair Display",
    "body": "Lora"
  },
  "tags": ["rustic", "autumn", "warm", "outdoor", "barn", "country"],
  "minimumTier": "basic"
}
```

- [ ] **Step 4: Extract `modern-minimal/template.html`**

Copy the value of `modernMinimalHtml` (lines 201-343 of the current `seed-templates.ts`) verbatim into `server/db/templates/modern-minimal/template.html`.

- [ ] **Step 5: Create `modern-minimal/meta.json`**

```json
{
  "name": "Modern Minimal",
  "category": "modern",
  "colorScheme": {
    "primary": "#314571",
    "secondary": "#8ea3c3",
    "background": "#FEFDF9",
    "text": "#101722",
    "accent": "#43608f"
  },
  "fontPairings": {
    "heading": "DM Serif Display",
    "body": "Inter"
  },
  "tags": ["modern", "minimal", "clean", "contemporary", "simple"],
  "minimumTier": "basic"
}
```

- [ ] **Step 6: Extract `classic-elegant/template.html`**

Copy the value of `classicElegantHtml` (lines 347-515) verbatim into `server/db/templates/classic-elegant/template.html`.

- [ ] **Step 7: Create `classic-elegant/meta.json`**

```json
{
  "name": "Classic Elegant",
  "category": "classic",
  "colorScheme": {
    "primary": "#c9a84c",
    "secondary": "#a89a80",
    "background": "#0d0b12",
    "text": "#e8e0d0",
    "accent": "#d4c5a9"
  },
  "fontPairings": {
    "heading": "Cinzel",
    "body": "Cormorant Garamond"
  },
  "tags": ["classic", "elegant", "formal", "traditional", "luxury", "gold"],
  "minimumTier": "basic"
}
```

- [ ] **Step 8: Verify byte-for-byte equivalence**

Run a quick sanity check that each file matches what's in `seed-templates.ts`. For example:

```bash
node -e "
const fs = require('fs');
const seed = fs.readFileSync('server/db/seed-templates.ts', 'utf8');
const extract = (varname) => {
  const m = new RegExp('const ' + varname + ' = \`([\\\\s\\\\S]*?)\`').exec(seed);
  return m[1];
};
const check = (varname, path) => {
  const inline = extract(varname);
  const file = fs.readFileSync(path, 'utf8');
  if (inline !== file) { console.error('MISMATCH', varname, path); process.exit(1); }
  console.log('OK', varname);
};
check('rusticAutumnHtml', 'server/db/templates/rustic-autumn/template.html');
check('modernMinimalHtml', 'server/db/templates/modern-minimal/template.html');
check('classicElegantHtml', 'server/db/templates/classic-elegant/template.html');
"
```

Expected: three `OK` lines, exit 0. If any `MISMATCH`, fix the file before committing.

- [ ] **Step 9: Commit**

```bash
git add server/db/templates/
git commit -m "feat(templates): extract existing 3 templates to per-slug folders"
```

---

## Task 4: Template loader module

**Files:**
- Create: `server/db/load-templates.ts`
- Create: `server/db/__tests__/load-templates.test.ts`

The loader is pure: given a directory path and a tier-slug-to-id map, it returns an array of DB-ready insert values. No DB access. This makes it easy to unit test with a fixture directory.

- [ ] **Step 1: Write failing tests**

Create `server/db/__tests__/load-templates.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadTemplatesFromDisk } from '../load-templates'

describe('loadTemplatesFromDisk', () => {
  let tmpDir: string
  const tierMap = new Map<string, number>([['basic', 10], ['premium', 20]])

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'eloria-templates-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTemplate(slug: string, html: string, meta: object) {
    mkdirSync(join(tmpDir, slug), { recursive: true })
    writeFileSync(join(tmpDir, slug, 'template.html'), html)
    writeFileSync(join(tmpDir, slug, 'meta.json'), JSON.stringify(meta))
  }

  it('loads a single valid template', () => {
    writeTemplate('sample', '<p>{{coupleName1}}</p>', {
      name: 'Sample',
      category: 'modern',
      colorScheme: { primary: '#000', secondary: '#111', background: '#fff', text: '#222', accent: '#333' },
      fontPairings: { heading: 'Inter', body: 'Inter' },
      tags: ['a', 'b'],
      minimumTier: 'basic',
    })
    const rows = loadTemplatesFromDisk(tmpDir, tierMap)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      slug: 'sample',
      name: 'Sample',
      category: 'modern',
      htmlTemplate: '<p>{{coupleName1}}</p>',
      cssTemplate: '',
      previewImageUrl: '/images/templates/sample.jpg',
      minimumTierId: 10,
    })
    expect(JSON.parse(rows[0].colorScheme)).toEqual({ primary: '#000', secondary: '#111', background: '#fff', text: '#222', accent: '#333' })
    expect(JSON.parse(rows[0].fontPairings)).toEqual({ heading: 'Inter', body: 'Inter' })
    expect(JSON.parse(rows[0].tags)).toEqual(['a', 'b'])
  })

  it('loads multiple templates sorted by slug', () => {
    writeTemplate('zebra', '<p>z</p>', {
      name: 'Z', category: 'x',
      colorScheme: { primary: '#0', secondary: '#0', background: '#0', text: '#0', accent: '#0' },
      fontPairings: { heading: 'f', body: 'f' }, tags: [], minimumTier: 'basic',
    })
    writeTemplate('apple', '<p>a</p>', {
      name: 'A', category: 'x',
      colorScheme: { primary: '#0', secondary: '#0', background: '#0', text: '#0', accent: '#0' },
      fontPairings: { heading: 'f', body: 'f' }, tags: [], minimumTier: 'premium',
    })
    const rows = loadTemplatesFromDisk(tmpDir, tierMap)
    expect(rows.map(r => r.slug)).toEqual(['apple', 'zebra'])
    expect(rows[0].minimumTierId).toBe(20)
    expect(rows[1].minimumTierId).toBe(10)
  })

  it('throws a useful error when template.html is missing', () => {
    mkdirSync(join(tmpDir, 'broken'))
    writeFileSync(join(tmpDir, 'broken', 'meta.json'), '{}')
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/template\.html.*broken/)
  })

  it('throws a useful error when meta.json is missing', () => {
    mkdirSync(join(tmpDir, 'broken'))
    writeFileSync(join(tmpDir, 'broken', 'template.html'), '<p>hi</p>')
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/meta\.json.*broken/)
  })

  it('throws when meta.json is malformed JSON', () => {
    writeTemplate('broken', '<p>hi</p>', {} as object)
    writeFileSync(join(tmpDir, 'broken', 'meta.json'), '{ not json')
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/broken.*meta\.json/i)
  })

  it('throws when minimumTier is unknown', () => {
    writeTemplate('broken', '<p>hi</p>', {
      name: 'B', category: 'x',
      colorScheme: { primary: '#0', secondary: '#0', background: '#0', text: '#0', accent: '#0' },
      fontPairings: { heading: 'f', body: 'f' }, tags: [], minimumTier: 'nonexistent',
    })
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/broken.*nonexistent/)
  })

  it('throws when required meta field is missing', () => {
    writeTemplate('broken', '<p>hi</p>', { name: 'B' } as object)
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/broken.*category/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/db/__tests__/load-templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader**

Create `server/db/load-templates.ts`:

```ts
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'

export type TemplateMeta = {
  name: string
  category: string
  colorScheme: { primary: string; secondary: string; background: string; text: string; accent: string }
  fontPairings: { heading: string; body: string }
  tags: string[]
  minimumTier: string
}

export type TemplateInsertRow = {
  slug: string
  name: string
  category: string
  previewImageUrl: string
  htmlTemplate: string
  cssTemplate: string
  colorScheme: string
  fontPairings: string
  tags: string
  minimumTierId: number
}

const REQUIRED_META_FIELDS: (keyof TemplateMeta)[] = [
  'name', 'category', 'colorScheme', 'fontPairings', 'tags', 'minimumTier',
]

export function loadTemplatesFromDisk(
  templatesDir: string,
  tierSlugToId: Map<string, number>,
): TemplateInsertRow[] {
  const entries = readdirSync(templatesDir)
    .filter(entry => {
      const full = join(templatesDir, entry)
      return statSync(full).isDirectory()
    })
    .sort()

  return entries.map(slug => loadOne(templatesDir, slug, tierSlugToId))
}

function loadOne(templatesDir: string, slug: string, tierSlugToId: Map<string, number>): TemplateInsertRow {
  const folder = join(templatesDir, slug)
  const htmlPath = join(folder, 'template.html')
  const metaPath = join(folder, 'meta.json')

  if (!existsSync(htmlPath)) {
    throw new Error(`Template "${slug}" is missing template.html at ${htmlPath}`)
  }
  if (!existsSync(metaPath)) {
    throw new Error(`Template "${slug}" is missing meta.json at ${metaPath}`)
  }

  let meta: TemplateMeta
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch (err) {
    throw new Error(`Template "${slug}" has invalid meta.json: ${(err as Error).message}`)
  }

  for (const field of REQUIRED_META_FIELDS) {
    if (meta[field] === undefined || meta[field] === null) {
      throw new Error(`Template "${slug}" meta.json is missing required field "${field}"`)
    }
  }

  const tierId = tierSlugToId.get(meta.minimumTier)
  if (tierId === undefined) {
    throw new Error(`Template "${slug}" references unknown minimumTier "${meta.minimumTier}"`)
  }

  const html = readFileSync(htmlPath, 'utf-8')

  return {
    slug,
    name: meta.name,
    category: meta.category,
    previewImageUrl: `/images/templates/${slug}.jpg`,
    htmlTemplate: html,
    cssTemplate: '',
    colorScheme: JSON.stringify(meta.colorScheme),
    fontPairings: JSON.stringify(meta.fontPairings),
    tags: JSON.stringify(meta.tags),
    minimumTierId: tierId,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/db/__tests__/load-templates.test.ts`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/load-templates.ts server/db/__tests__/load-templates.test.ts
git commit -m "feat(templates): add loadTemplatesFromDisk pure loader"
```

---

## Task 5: Rewrite seed-templates.ts to upsert from disk

**Files:**
- Modify: `server/db/seed-templates.ts` (wholesale rewrite)

- [ ] **Step 1: Replace the entire file**

Replace the contents of `server/db/seed-templates.ts` with:

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { templates, tiers } from './schema'
import { loadTemplatesFromDisk } from './load-templates'

const dbUrl = process.env.DATABASE_URL || 'file:./db/eloria.db'
const sqlite = new Database(dbUrl.replace('file:', ''))
const db = drizzle(sqlite, { schema: { templates, tiers } })

const TEMPLATES_DIR = 'server/db/templates'

async function seedTemplates() {
  console.log('[seed-templates] loading tiers...')
  const tierRows = await db.select().from(tiers)
  if (tierRows.length === 0) {
    console.error('[seed-templates] No tiers found. Run `npm run db:seed` first.')
    sqlite.close()
    process.exit(1)
  }
  const tierMap = new Map(tierRows.map(t => [t.slug, t.id]))

  console.log(`[seed-templates] reading templates from ${TEMPLATES_DIR}...`)
  const rows = loadTemplatesFromDisk(TEMPLATES_DIR, tierMap)
  console.log(`[seed-templates] found ${rows.length} templates: ${rows.map(r => r.slug).join(', ')}`)

  for (const row of rows) {
    await db.insert(templates).values(row).onConflictDoUpdate({
      target: templates.slug,
      set: {
        name: row.name,
        category: row.category,
        previewImageUrl: row.previewImageUrl,
        htmlTemplate: row.htmlTemplate,
        cssTemplate: row.cssTemplate,
        colorScheme: row.colorScheme,
        fontPairings: row.fontPairings,
        tags: row.tags,
        minimumTierId: row.minimumTierId,
      },
    })
  }

  console.log(`[seed-templates] upserted ${rows.length} templates.`)
  sqlite.close()
}

seedTemplates().catch(err => {
  console.error('[seed-templates] failed:', err)
  sqlite.close()
  process.exit(1)
})
```

- [ ] **Step 2: Run the seed against the local DB**

Run: `npm run db:seed-templates`
Expected output (order may differ):
```
[seed-templates] loading tiers...
[seed-templates] reading templates from server/db/templates...
[seed-templates] found 3 templates: classic-elegant, modern-minimal, rustic-autumn
[seed-templates] upserted 3 templates.
```
Exit code: 0.

- [ ] **Step 3: Verify the DB still has the same 3 templates with identical HTML**

Run:
```bash
sqlite3 db/eloria.db "SELECT slug, name, category, length(html_template) FROM templates ORDER BY slug;"
```
Expected: three rows for `classic-elegant`, `modern-minimal`, `rustic-autumn`. The `length(html_template)` values should match the byte length of the respective `server/db/templates/<slug>/template.html` files:
```bash
wc -c server/db/templates/*/template.html
```
The two columns should line up.

- [ ] **Step 4: Run the seed a second time to verify idempotency**

Run: `npm run db:seed-templates`
Expected: same output as Step 2 (no errors, no duplicate rows). Re-check the template count:
```bash
sqlite3 db/eloria.db "SELECT COUNT(*) FROM templates;"
```
Expected: `3`.

- [ ] **Step 5: Commit**

```bash
git add server/db/seed-templates.ts
git commit -m "feat(templates): rewrite seed to upsert from templates/ directory"
```

---

## Task 6: Dev preview route

**Files:**
- Create: `server/routes/dev/templates/[slug].get.ts`

- [ ] **Step 1: Create the route**

Create `server/routes/dev/templates/[slug].get.ts`:

```ts
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { substituteTemplate } from '~/server/utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const SAMPLE_DATA = {
  coupleName1: 'Alex',
  coupleName2: 'Jordan',
  date: 'Saturday, June 14th, 2026',
  venue: 'The Old Mill',
  venueAddress: '123 River Lane, Somewhere, USA',
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
  const rendered = substituteTemplate(html, SAMPLE_DATA)
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

- [ ] **Step 2: Verify the route returns the rendered template in dev**

Start the dev server if not running: `npm run dev`. Then:

```bash
curl -s http://localhost:3000/dev/templates/rustic-autumn | head -20
```

Expected: HTML starting with `<!DOCTYPE html>`, containing `<span class="slug">rustic-autumn</span>` and an `<iframe srcdoc="...">` whose content includes the sample couple names (`Alex`, `Jordan`).

- [ ] **Step 3: Verify 404 for unknown slug**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dev/templates/does-not-exist
```

Expected: `404`.

- [ ] **Step 4: Verify the route is dev-only by simulating production**

Temporarily set `NODE_ENV=production` in a test invocation. You can't easily do this against the already-running dev server, so skip this in automated testing — the check is a simple one-liner `if (process.env.NODE_ENV === 'production') throw 404` and will be verified manually on the first prod deploy. Note this deferral in the task report.

- [ ] **Step 5: Commit**

```bash
git add server/routes/dev/templates/
git commit -m "feat(templates): add /dev/templates/<slug> preview route"
```

---

## Task 7: Screenshot command

**Files:**
- Create: `server/db/templates-screenshots.ts`
- Modify: `package.json`

- [ ] **Step 1: Check puppeteer is already a dependency**

Run: `grep '"puppeteer"' package.json`
Expected: a line like `"puppeteer": "^24.x.x"` appears under dependencies. (If it's missing for some reason, stop and report BLOCKED — the spec assumes it's already there.)

- [ ] **Step 2: Create the screenshot script**

Create `server/db/templates-screenshots.ts`:

```ts
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer'
import { substituteTemplate } from '../utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const IMAGES_DIR = 'public/images/templates'
const SAMPLE_DATA = {
  coupleName1: 'Alex',
  coupleName2: 'Jordan',
  date: 'Saturday, June 14th, 2026',
  venue: 'The Old Mill',
  venueAddress: '123 River Lane, Somewhere, USA',
  wording: 'Together with their families, they invite you to celebrate\ntheir marriage.',
}
const VIEWPORT = { width: 800, height: 1200 }

async function main() {
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true })
  }

  const slugs = readdirSync(TEMPLATES_DIR)
    .filter(entry => statSync(join(TEMPLATES_DIR, entry)).isDirectory())
    .sort()

  const pending = slugs.filter(slug => !existsSync(join(IMAGES_DIR, `${slug}.jpg`)))
  const skipped = slugs.filter(slug => existsSync(join(IMAGES_DIR, `${slug}.jpg`)))

  for (const slug of skipped) console.log(`[screenshots] skipped ${slug} (image exists)`)

  if (pending.length === 0) {
    console.log('[screenshots] nothing to do.')
    return
  }

  console.log(`[screenshots] generating ${pending.length} image(s)...`)
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  try {
    for (const slug of pending) {
      const html = readFileSync(join(TEMPLATES_DIR, slug, 'template.html'), 'utf-8')
      const rendered = substituteTemplate(html, SAMPLE_DATA)
      const page = await browser.newPage()
      await page.setViewport(VIEWPORT)
      await page.setContent(rendered, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const outPath = join(IMAGES_DIR, `${slug}.jpg`)
      const buffer = await page.screenshot({ type: 'jpeg', quality: 85, fullPage: false })
      writeFileSync(outPath, buffer)
      await page.close()
      console.log(`[screenshots] wrote ${outPath}`)
    }
  } finally {
    await browser.close()
  }
  console.log(`[screenshots] done. generated=${pending.length}, skipped=${skipped.length}`)
}

main().catch(err => {
  console.error('[screenshots] failed:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Add the npm script**

Edit `package.json`. Add `"templates:screenshots"` to the `scripts` section next to the other `db:*` scripts:

```json
"templates:screenshots": "tsx server/db/templates-screenshots.ts",
```

The final `scripts` block should contain this line alongside the existing entries — do not remove any existing entries.

- [ ] **Step 4: Run the command and verify behavior with no existing images**

Temporarily move any existing preview images out of the way:
```bash
mkdir -p /tmp/eloria-images-backup
mv public/images/templates/*.jpg /tmp/eloria-images-backup/ 2>/dev/null || true
```

Then run: `npm run templates:screenshots`

Expected output:
```
[screenshots] generating 3 image(s)...
[screenshots] wrote public/images/templates/classic-elegant.jpg
[screenshots] wrote public/images/templates/modern-minimal.jpg
[screenshots] wrote public/images/templates/rustic-autumn.jpg
[screenshots] done. generated=3, skipped=0
```

Verify the JPGs exist and are non-zero-sized:
```bash
ls -la public/images/templates/*.jpg
```
Expected: three files, each larger than 5 KB.

- [ ] **Step 5: Run the command a second time to verify idempotency**

Run: `npm run templates:screenshots` again.

Expected output:
```
[screenshots] skipped classic-elegant (image exists)
[screenshots] skipped modern-minimal (image exists)
[screenshots] skipped rustic-autumn (image exists)
[screenshots] nothing to do.
```
Exit code: 0.

- [ ] **Step 6: Restore the original images**

If you backed up original images in Step 4, restore them:
```bash
mv /tmp/eloria-images-backup/*.jpg public/images/templates/ 2>/dev/null || true
rm -rf /tmp/eloria-images-backup
```

The backup restore overwrites whatever was just generated — that's fine because the originals are the committed design assets. The screenshot command is still proven to work.

- [ ] **Step 7: Commit**

```bash
git add server/db/templates-screenshots.ts package.json
git commit -m "feat(templates): add idempotent templates:screenshots command"
```

---

## Task 8: Update README deploy instructions

**Files:**
- Modify: `README.md`

The README's production deploy section should reflect that `db:seed-templates` is now safe to run every deploy.

- [ ] **Step 1: Read the current README deploy section**

Open `README.md` and locate the "Deploy with schema changes" section (around the middle of the file).

- [ ] **Step 2: Add `db:seed-templates` to the standard deploy sequence**

Find this block (under "Standard deploy (no schema changes)"):

```bash
cd /var/www/eloria
git pull
npm install
npm run build
pm2 restart eloria
```

Replace it with:

```bash
cd /var/www/eloria
git pull
npm install
npm run build
npm run db:seed-templates
pm2 restart eloria
```

- [ ] **Step 3: Add `db:seed-templates` to the "Deploy with schema changes" block too**

Find:

```bash
cd /var/www/eloria
git pull
cp db/eloria.db db/eloria.db.bak.$(date +%Y-%m-%d)
npm install
npm run db:migrate
npm run build
pm2 restart eloria
```

Replace with:

```bash
cd /var/www/eloria
git pull
cp db/eloria.db db/eloria.db.bak.$(date +%Y-%m-%d)
npm install
npm run db:migrate
npm run db:seed-templates
npm run build
pm2 restart eloria
```

- [ ] **Step 4: Add `templates:screenshots` to the Useful Scripts table**

Find the Useful scripts table at the bottom of the README and add a row before the closing of the table:

```markdown
| `npm run templates:screenshots` | Generate missing preview images for templates (idempotent) |
```

Place it after the `db:seed-templates` row.

- [ ] **Step 5: Add a "Adding a new template" section**

Find the "Database migrations" section. Immediately after it (before "Production deployment"), add:

```markdown
## Adding a new template

1. Create a folder `server/db/templates/<slug>/` with:
   - `template.html` — self-contained HTML with `<style>` and `{{placeholder}}` tokens (`coupleName1`, `coupleName2`, `date`, `venue`, `venueAddress`, `wording`).
   - `meta.json` — `name`, `category`, `colorScheme`, `fontPairings`, `tags`, `minimumTier`.
2. Iterate on the HTML by visiting `http://localhost:3000/dev/templates/<slug>` in your browser (dev server only). Edits are picked up on refresh.
3. Once happy, run `npm run db:seed-templates` to upsert into your local DB.
4. Generate the preview image: `npm run templates:screenshots`.
5. Commit the new template folder and the generated `public/images/templates/<slug>.jpg`.
6. Deploy normally — `db:seed-templates` runs on every prod deploy and the template will appear for customers.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: template authoring workflow + updated deploy sequence"
```

---

## Self-Review Notes

**Spec coverage:**
- File layout (`server/db/templates/<slug>/template.html` + `meta.json`) → Task 3 (migration) + Task 4 (loader reads this shape).
- `meta.json` schema (all required fields, tier slug resolution) → Task 4 validates all fields + tests in Task 4 cover each failure mode.
- `template.html` format (placeholders identical to current) → Task 3 extracts verbatim; Task 1 helper uses the same six placeholders.
- Seed rewrite with upsert via `onConflictDoUpdate` → Task 5.
- Idempotency of seed → Task 5 Step 4 verifies explicitly.
- Dev preview route with disk read + sample data + iframe + absolute path → Task 6.
- Dev-only check → Task 6 route body has `if (process.env.NODE_ENV === 'production')`.
- Sample data for dev route AND screenshots identical → same constant values used in Task 6 and Task 7.
- Shared substitution helper used by Vue component and dev route → Task 1 creates it, Task 2 wires Vue to it, Task 6 imports it, Task 7 imports it.
- Screenshot command: scans dir, skips if image exists, 800×1200, waits for fonts, idempotent → Task 7.
- Migration of 3 existing templates with byte-for-byte fidelity → Task 3 Step 8 verifies.
- Deploy doc update → Task 8.

**Placeholder/ambiguity scan:** No TBDs, every code block is complete, every command has expected output. Tier IDs in the test use concrete values (10/20). The sample `meta.json` in the dev/screenshot scripts uses identical literal data.

**Type consistency:** `TemplateData`, `TemplateMeta`, `TemplateInsertRow`, `substituteTemplate`, `loadTemplatesFromDisk` used consistently across tasks. Field names (`htmlTemplate`, `cssTemplate`, `previewImageUrl`, `minimumTierId`, etc.) match the drizzle schema at `server/db/schema.ts`.

**Out of spec (correctly deferred):** Versioning, admin UI, auto-regenerate-image-on-meta-change, i18n of template text. These are listed in the spec's Out of Scope section.

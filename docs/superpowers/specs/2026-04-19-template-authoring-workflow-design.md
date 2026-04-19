# Template Authoring Workflow

## Problem

Adding a new wedding template today requires editing `server/db/seed-templates.ts` and pasting the full HTML as a huge JS string literal. Drawbacks:

- No HTML syntax highlighting, no formatting, no preview.
- `seed-templates.ts` grows unbounded as templates are added.
- The seed uses `onConflictDoNothing`, so editing an existing template's HTML does NOT propagate on re-seed — production drifts from the committed template.
- No way to iterate on a template's visual result without launching the app, creating a fake event, and attaching the template.
- Preview images (`public/images/templates/<slug>.jpg`) must be captured manually.

The user wants to ship new templates frequently. The current workflow is the main friction.

## Goal

Make template authoring a file-oriented, rapid-iteration workflow: edit an HTML file on disk, refresh a browser to see the rendered result, commit, deploy, and the DB is kept in sync automatically.

## Non-Goals

- Changing the DB schema (the `templates` table stays as is).
- Changing how customers pick or render templates (`TemplatePreview.vue`, the templates API, event-template association).
- In-app template editing or multi-user authoring.
- Versioning templates or tracking template edits over time.

## Solution Overview

Four pieces of work, each independently testable:

1. **Template files on disk** — one folder per template under `server/db/templates/<slug>/` containing `template.html` and `meta.json`.
2. **Seed rewrite** — `npm run db:seed-templates` reads the templates directory and upserts each template into the DB.
3. **Dev preview route** — `/dev/templates/<slug>` reads the file from disk and renders it with sample placeholder data in an iframe, available in dev only.
4. **Screenshot command** — `npm run templates:screenshots` generates missing preview images using puppeteer; idempotent (skips templates whose image already exists).

## File Layout

```
server/db/templates/
  rustic-autumn/
    template.html
    meta.json
  modern-minimal/
    template.html
    meta.json
  classic-elegant/
    template.html
    meta.json
  <new-template>/
    template.html
    meta.json
```

The folder name IS the template slug. No slug field inside `meta.json` to avoid drift.

Preview images live under `public/images/templates/<slug>.jpg` (unchanged from today) because they're static assets Nuxt serves to the template picker UI — not part of the template logical unit.

## `meta.json` Schema

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

All fields required. `minimumTier` is a tier slug (`"basic"` / `"premium"` / `"pro"`); the seed resolves it to `minimumTierId` by querying the `tiers` table. The seed crashes with a clear error if:

- A folder under `server/db/templates/` is missing `template.html` or `meta.json`.
- `meta.json` is malformed JSON or is missing any required field.
- `minimumTier` doesn't match a tier slug in the DB.

## `template.html` Format

Self-contained HTML with `<style>` inline and placeholders using double-braces: `{{coupleName1}}`, `{{coupleName2}}`, `{{date}}`, `{{venue}}`, `{{venueAddress}}`, `{{wording}}`. Identical to today's format — no migration of placeholders needed.

No CSS is loaded separately (matches current behavior where the DB's `cssTemplate` column is ignored at render time). For backward compatibility with the schema, the seed writes an empty string to `cssTemplate`.

## Seed Rewrite

`server/db/seed-templates.ts` becomes:

1. Open the SQLite DB (same pattern as today).
2. Load the `tiers` table into a `Map<slug, id>`.
3. For each entry in `server/db/templates/`:
   - Read `template.html` as a UTF-8 string.
   - Parse `meta.json`.
   - Validate schema; resolve `minimumTier` slug to ID.
   - Build the insert values: slug = folder name, htmlTemplate = file contents, cssTemplate = `''`, previewImageUrl = `/images/templates/<slug>.jpg`, plus JSON-stringified color/font/tags.
4. Upsert: `db.insert(templates).values([...]).onConflictDoUpdate({ target: templates.slug, set: {...} })`. Every column is overwritten on conflict so the seed file is always the source of truth.
5. Log the number of templates processed.

Running the seed becomes safe and idempotent: re-running does nothing if no files changed, or propagates edits if they did.

## Dev Preview Route

New file `server/routes/dev/templates/[slug].get.ts` (Nitro route):

- Dev-only: checks `process.env.NODE_ENV !== 'production'`; returns 404 in prod.
- Reads `server/db/templates/<slug>/template.html` from disk at request time (no caching — so file edits reflect on every refresh).
- Returns an HTML page with a small header (slug + absolute path to the file for easy editor-opening) and an iframe whose `srcdoc` is the template HTML with placeholders substituted for sample data:
  - `coupleName1` = "Alex"
  - `coupleName2` = "Jordan"
  - `date` = "Saturday, June 14th, 2026"
  - `venue` = "The Old Mill"
  - `venueAddress` = "123 River Lane, Somewhere, USA"
  - `wording` = "Together with their families, they invite you to celebrate\ntheir marriage."
- If the template or file doesn't exist, returns a 404 with a message listing available slugs.

Substitution uses the same regex/replace logic as `TemplatePreview.vue:15-22` so the dev preview and the customer-facing preview produce identical output. Extract that logic into a shared helper at `server/utils/template-substitute.ts` and use it from both the Vue component and the dev route, so they can't drift.

## Screenshot Command

New file `server/db/templates-screenshots.ts` + npm script `templates:screenshots`:

1. Scan `server/db/templates/*/`.
2. For each template slug, check whether `public/images/templates/<slug>.jpg` exists.
3. If it exists, skip and log `skipped <slug>`.
4. If not, launch puppeteer, set the viewport to 800×1200, set the page content to the template HTML with the same sample data as the dev preview route, wait for fonts (`document.fonts.ready`), screenshot as JPG, write to `public/images/templates/<slug>.jpg`.
5. Close puppeteer; log the number generated vs. skipped.

The command is idempotent: safe to run multiple times, won't overwrite existing images. To regenerate, delete the JPG first and re-run.

## Migration of Existing Templates

Extract the three inline HTML strings from the current `seed-templates.ts` (`rusticAutumnHtml`, `modernMinimalHtml`, `classicElegantHtml`) into:

- `server/db/templates/rustic-autumn/template.html`
- `server/db/templates/modern-minimal/template.html`
- `server/db/templates/classic-elegant/template.html`

Create matching `meta.json` for each, preserving name / category / colorScheme / fontPairings / tags exactly. Keep `minimumTier = "basic"` (current behavior).

After implementation, running `npm run db:seed-templates` on an already-seeded DB should produce zero row changes (htmlTemplate is byte-identical, and all other fields match).

## Deploy

On production, the deploy sequence becomes:

```bash
git pull
npm install
npm run build
npm run db:migrate          # unchanged, only if there are schema changes
npm run db:seed-templates   # now safe to run every deploy — upserts, doesn't duplicate
npm run templates:screenshots   # only if you want to regenerate missing preview images
pm2 restart eloria
```

Add `db:seed-templates` to the standard deploy script so production is always in sync with committed templates.

## Testing

- Unit test for the seed loader: given a fixture templates directory (a tmp dir with one valid template), loading produces the expected insert values. Given a missing/malformed file, it throws a useful error.
- Unit test for the substitution helper (new `server/utils/template-substitute.ts`): all six placeholders replace, unknown placeholders pass through, and substitution is idempotent if re-applied to the same string with the same data.
- No test for the dev preview route (trivial) or the screenshot command (puppeteer integration test isn't worth the maintenance cost; verified manually during implementation).

## Out of Scope (Follow-ups)

- Switching to an insert-or-update-but-keep-image pattern where editing metadata triggers screenshot regeneration automatically.
- Template variants / internationalization of template text.
- Admin UI for editing templates.

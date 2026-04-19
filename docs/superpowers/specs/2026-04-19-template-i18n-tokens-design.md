# Template i18n Tokens

## Problem

Wedding invitation templates contain decorative English text hardcoded in their HTML — "Together with their families", "Venue", "Reception to follow", "We look forward to celebrating with you", and so on. When a Spanish-speaking user opens the dashboard (set to Spanish UI), the template preview still shows those phrases in English. The `{{wording}}` placeholder already respects locale via the recent AI fix, but decorative text bolted into the template HTML does not.

## Goal

Render template decorative text in the user's active UI language, without changing the existing `{{placeholder}}` data-substitution contract.

## Non-Goals

- Guest-facing rendering: `pages/i/[slug].vue` uses its own Nuxt markup with existing i18n. Nothing in this spec changes what guests see.
- Per-language preview screenshots. Preview JPGs remain rendered in English — they serve as a visual fingerprint of the template design in the template picker, not a localized asset.
- Tying decoration language to the event's `language` DB column. The spec assumes dashboard preview should follow the user's UI locale; switching to event language (or mixing both) is a future extension that can be added by passing an explicit translation map to the substituter.
- Fallback to English when a key is missing from a non-English locale. `en.json` and `es.json` maintain strict key parity (audited, zero diffs); missing keys are a bug to catch at review time, not handle at runtime.

## Solution Overview

Introduce a second kind of token in template HTML: `{{t:<i18n.key.path>}}`. Extend the shared `substituteTemplate` helper to accept an optional translations object; callers that have access to translated strings pass them in. The existing data placeholders (`{{coupleName1}}` etc.) keep their current behavior.

## Token Syntax

Two kinds of tokens now live in template HTML:

| Token                       | Resolved from                    | Example                     |
|-----------------------------|----------------------------------|-----------------------------|
| `{{coupleName1}}`           | `TemplateData` object            | "Maria"                     |
| `{{coupleName2}}`           | `TemplateData` object            | "James"                     |
| `{{date}}`                  | `TemplateData` object            | "Saturday, June 14th, 2026" |
| `{{venue}}`                 | `TemplateData` object            | "The Grand Ballroom"        |
| `{{venueAddress}}`          | `TemplateData` object            | "123 Wedding Lane, City"    |
| `{{wording}}`               | `TemplateData` object            | user's custom wording       |
| `{{t:templates.together}}`  | translations map (i18n messages) | "Junto con sus familias"    |

Token resolution rules:
- Data placeholders: replaced if their key is in the data object; unresolved tokens pass through (existing behavior).
- `t:` tokens: the part after the colon is a dotted path. If every segment of the path resolves to a string in the translations map, replace the token with that string; otherwise pass through unchanged.

## i18n File Structure

A new `templates` section is added to `i18n/lang/en.json` and `i18n/lang/es.json`. Initial keys, covering every current decorative string in the 5 templates:

```json
"templates": {
  "together": "Together with their families",
  "venue": "Venue",
  "weddingInvitation": "Wedding Invitation",
  "weLookForward": "We look forward to celebrating with you",
  "honourOfYourPresence": "The honour of your presence is requested",
  "joyfullyRequest": "We joyfully request the honour of your presence",
  "and": "and"
}
```

Spanish equivalents (draft — reviewable during implementation):

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

Adding a new decorative string later: add the key to BOTH locale files, then reference it as `{{t:templates.<newKey>}}` in the template.

## Substitution Helper

`server/utils/template-substitute.ts` grows a third optional parameter:

```ts
export type TemplateData = { /* unchanged */ }
export type TemplateTranslations = Record<string, unknown>

export function substituteTemplate(
  html: string,
  data: TemplateData,
  translations?: TemplateTranslations,
): string
```

Behavior:
1. All six data placeholders resolve exactly as today.
2. If `translations` is omitted or undefined, `t:` tokens pass through unchanged (backward compatibility for existing callers).
3. If `translations` is provided, every `{{t:a.b.c}}` token is resolved by walking the map: `translations.a.b.c`. If the resulting value is a string, substitute it; otherwise leave the token in place.
4. Resolution is a single pass after data replacement. A translation value containing another `{{...}}` token is not re-expanded (avoids surprise recursion).

No changes to the exported `TemplateData` type. No new module files.

## Callers

### 1. `components/invitation/TemplatePreview.vue` (dashboard preview)

Currently imports `substituteTemplate` and builds `TemplateData` from props + i18n fallbacks. Add the translations argument:

```ts
const { t, locale, messages } = useI18n()

const renderedHtml = computed(() => substituteTemplate(
  props.htmlTemplate,
  { /* existing data */ },
  (messages.value[locale.value] as Record<string, unknown>) ?? {},
))
```

The `messages` ref from `useI18n()` holds the full translation tree per locale. Passing it lets templates reference any i18n key, not just the `templates.*` namespace — simpler and keeps the helper agnostic. Re-renders automatically when `locale` changes because `messages` is reactive.

### 2. `server/routes/dev/templates/[slug].get.ts` (dev preview)

Reads `i18n/lang/en.json` synchronously at request time and passes it as translations. Always renders English. The file read is cheap on every request in dev; no caching needed. Keeping this English-only matches the "English is canonical" stance for the screenshot command.

### 3. `server/db/templates-screenshots.ts` (preview image generator)

Same pattern: read `i18n/lang/en.json`, pass as translations. Screenshots stay English-only.

## Template File Changes

Four templates gain tokens. `minimalist` has no decorative text and is untouched.

**`classic-elegant/template.html`**
- "Together with their families" → `{{t:templates.together}}`
- "Venue" → `{{t:templates.venue}}`
- "The honour of your presence is requested" → `{{t:templates.honourOfYourPresence}}`

**`delicate-elegant/template.html`**
- "TOGETHER WITH THEIR FAMILIES" (currently uppercased HTML text) → `{{t:templates.together}}` with CSS `text-transform: uppercase` applied to `.together` so the visual design is preserved without forcing uppercase into the translation string. (Spanish all-caps looks fine aesthetically; the CSS change keeps the source strings clean.)
- "and" → `{{t:templates.and}}`

**`modern-minimal/template.html`**
- "Wedding Invitation" → `{{t:templates.weddingInvitation}}`
- "Venue" → `{{t:templates.venue}}`
- "We look forward to celebrating with you" → `{{t:templates.weLookForward}}`

**`rustic-autumn/template.html`**
- "Together with their families" → `{{t:templates.together}}`
- "Venue" → `{{t:templates.venue}}`
- "We joyfully request the honour of your presence" → `{{t:templates.joyfullyRequest}}`

Preview JPGs under `public/images/templates/` do NOT need regeneration: their text already looks correct (it IS English), and the script skips templates with existing images. If the user wants refreshed screenshots (e.g., after the `delicate-elegant` CSS tweak changes layout), they can delete the JPG and re-run `templates:screenshots`.

## Testing

Extend `server/utils/__tests__/template-substitute.test.ts` with:

1. **Token resolution from translations** — given a translations map `{templates: {together: "Hi"}}`, the helper replaces `{{t:templates.together}}` with `"Hi"`.
2. **Nested-path resolution** — deeply nested keys work (e.g. `a.b.c.d`).
3. **Unknown translation key** — `{{t:no.such.key}}` passes through unchanged.
4. **`translations` omitted** — existing callers that don't pass the third arg still get `t:` tokens passed through unchanged (backward compat).
5. **Data and translation tokens coexist** — one template can contain both and both resolve correctly.
6. **No re-expansion** — if a translation's value happens to contain `{{coupleName1}}`, it is NOT re-substituted after resolution (single-pass guarantee).

No new tests for `TemplatePreview.vue`, the dev route, or the screenshot script: they're thin callers, covered by the helper's unit tests plus a manual sanity check of the dashboard preview when switching locales.

## Out of Scope

- Guest-facing template rendering (as noted in Non-Goals).
- Making the dev preview route accept `?lang=` to swap locale on the fly.
- Per-template string colocation (rejected during brainstorming in favor of central i18n).
- Admin UI for editing template strings or managing missing-key alerts.

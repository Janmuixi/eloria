# Romantic Watercolor Collection — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Overview

Add 5 new wedding invitation templates in a Romantic/Watercolor style to the existing template collection. All templates share a soft blush–lavender–champagne gold palette family but each has a completely unique layout structure.

## Templates

### 1. Rose Petal Dreams

- **Layout:** Centered, symmetrical. Layered radial watercolor washes as CSS gradients. Flowing script names with delicate thin-line dividers.
- **Fonts:** Great Vibes (heading/names), Raleway (body)
- **Palette:** `{ primary: "#d4829c", secondary: "#e8b4c8", background: "#fdf2f5", text: "#5c2d42", accent: "#c9a0dc" }`
- **Category:** `romantic`
- **Tags:** `["romantic", "watercolor", "blush", "soft", "dreamy", "floral", "pink"]`
- **Distinctive features:** Multiple overlapping radial gradients creating a watercolor wash effect. Thin rose-gold dividers. Gentle text shadows for depth.

### 2. Lavender Mist

- **Layout:** Asymmetric — large watercolor splash positioned offset to the left side, text aligned right within whitespace. Airy, modern romantic feel.
- **Fonts:** Cormorant Garamond (heading/names), Quicksand (body)
- **Palette:** `{ primary: "#8e7cc3", secondary: "#b8a9e0", background: "#faf8ff", text: "#3d2c5e", accent: "#d4c1f0" }`
- **Category:** `romantic`
- **Tags:** `["romantic", "watercolor", "lavender", "modern", "airy", "purple", "asymmetric"]`
- **Distinctive features:** Large decorative gradient splash on one side. Right-aligned text block. Generous whitespace. Light, floating aesthetic.

### 3. Blush & Gold Frame

- **Layout:** Classic formal structure with ornate gold-tinted double border. Soft pink watercolor background. Centered text with decorative corner flourishes (CSS borders/pseudo-elements).
- **Fonts:** Playfair Display (heading/names), Montserrat (body)
- **Palette:** `{ primary: "#c9956b", secondary: "#e0c8a8", background: "#fef6f0", text: "#5a3e2b", accent: "#f0c0d0" }`
- **Category:** `romantic`
- **Tags:** `["romantic", "watercolor", "gold", "blush", "framed", "formal", "elegant"]`
- **Distinctive features:** Double-border frame with decorative corner accents via CSS pseudo-elements. Subtle gradient background. Gold accents on key typography.

### 4. Cherry Blossom

- **Layout:** Vertical scroll with distinct sections separated by petal motifs. Hero section with couple names, then wording section, then venue section. CSS-only falling petal decorations using positioned pseudo-elements and subtle animations.
- **Fonts:** Sacramento (heading/names), Poppins (body)
- **Palette:** `{ primary: "#e091aa", secondary: "#f0c4d4", background: "#fff8fa", text: "#4a2035", accent: "#fbe4ec" }`
- **Category:** `romantic`
- **Tags:** `["romantic", "watercolor", "cherry-blossom", "spring", "floral", "japanese", "pink"]`
- **Distinctive features:** CSS-only decorative petal shapes using pseudo-elements with border-radius. Gentle keyframe float animation. Distinct visual sections with background color transitions.

### 5. Sunset Veil

- **Layout:** Full-height vertical gradient from warm blush at top to cool lavender at bottom. Minimal centered text with very generous spacing between elements. No borders or frames — the gradient itself is the design.
- **Fonts:** Josefin Sans (heading/names), Libre Baskerville (body)
- **Palette:** `{ primary: "#d4829c", secondary: "#b8a0d4", background: "linear-gradient(180deg, #fff0f3 0%, #f8f0ff 100%)", text: "#4a2840", accent: "#e8c8a0" }`
- **Category:** `romantic`
- **Tags:** `["romantic", "watercolor", "sunset", "gradient", "minimal", "lavender", "blush"]`
- **Distinctive features:** Full-page gradient background. Ultra-generous vertical spacing (80px+ between sections). No decorative borders or frames. Champagne gold accent on ampersand and divider lines.

## Technical Details

### Storage

All templates are stored in the database via `server/db/seed-templates.ts`, consistent with the existing 3 templates. Each template includes:

- `name`: Display name
- `slug`: URL-safe identifier (auto-generated or derived from name)
- `category`: `"romantic"` for all 5
- `previewImageUrl`: `/images/templates/<slug>.jpg` (placeholder paths)
- `htmlTemplate`: Full standalone HTML document with embedded CSS and `{{placeholder}}` substitution
- `cssTemplate`: Empty string (CSS is embedded in HTML, matching existing pattern)
- `colorScheme`: JSON string with `{ primary, secondary, background, text, accent }`
- `fontPairings`: JSON string with `{ heading, body }`
- `tags`: JSON array string for AI recommendation matching
- `minimumTierId`: Basic tier ID (all templates available to all users)

### Placeholders

All templates use the same placeholder tokens as existing templates:
- `{{coupleName1}}` — First person's name
- `{{coupleName2}}` — Second person's name
- `{{date}}` — Event date
- `{{venue}}` — Venue name
- `{{venueAddress}}` — Venue address
- `{{wording}}` — Custom invitation wording

### Google Fonts

Each template loads its font pair via `@import url(...)` in the `<style>` block, consistent with existing templates. Font pairs chosen to avoid reusing fonts from existing templates (except Playfair Display in template 3, which is well-suited to the formal frame style).

### HTML Structure

Each template follows the same general HTML structure as existing templates:
- `<!DOCTYPE html>` full document
- `<style>` block with font import and all CSS
- Single `.invitation` wrapper with max-width constraint
- Semantic sections for: header text, couple names, date, wording, venue
- Responsive-friendly with relative units

### Rendering

Templates render through the existing `TemplatePreview.vue` iframe-based renderer. No changes needed to the rendering pipeline.

## Implementation Scope

### Files to modify
- `server/db/seed-templates.ts` — Add 5 new template HTML constants and insert them in the seed function

### Files NOT modified
- `server/db/schema.ts` — No schema changes needed
- `components/invitation/TemplatePreview.vue` — No rendering changes needed
- `pages/templates/index.vue` — Gallery already supports dynamic template listing
- API routes — Already return all templates dynamically

### Testing
- Run the seed script and verify all 5 templates appear in the template gallery
- Verify each template renders correctly in the TemplatePreview component with sample data
- Verify AI recommendation endpoint includes the new templates
- Verify category filter works with "romantic" category

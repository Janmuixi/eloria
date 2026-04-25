# Custom Invitation Upload — Design

## Goal

Let couples upload a single image (their own designed invitation) instead of choosing one of Eloria's HTML templates. The image becomes the visual layer of the public invitation page; the existing RSVP, plus-one, venue-map, email, and PDF infrastructure wraps it unchanged. Available on all paid tiers.

## Product flow

### Wizard step 2 — Design selection (extended)

Currently shows a grid of templates with AI recommendations. Extended layout:

1. **"Upload your own invitation" card** at the **top** of the page, above any other content. Visually distinct (gold border, icon, larger). Subtitle: *"Already have a design? Use it."*
2. Below the card, an *"or browse our designs"* divider.
3. Existing AI recommendation strip and template grid.

When the upload card is clicked, the page swaps in place — template grid hidden, upload UI shown — with a "← Back to templates" link at the top of the upload UI. No modal, no new route.

### Upload UI (inside step 2)

Drag-and-drop zone or click-to-browse. Single file. After upload:

- Replaces the dropzone with a centered thumbnail preview at proper aspect ratio
- Shows two actions: **Replace** (re-opens dropzone) and **Continue** (advances wizard)
- Hint: *"Recommended: portrait, ~1080×1500. JPG/PNG/WebP, max 10 MB."*
- File is uploaded immediately on drop — `events.customImagePath` is set server-side. Leaving the wizard and returning preserves the upload.

### Wizard step 3 — Wording (skipped for upload path)

When the user is on the upload path, step 3 is skipped — wording is part of the image. The wizard advances directly from step 2 to step 4.

### Wizard step 4 — Preview

- Template path: existing iframe with rendered template HTML.
- Upload path: server-rendered Vue page showing the uploaded image above the RSVP form (matches what guests will see).

### Wizard step 5 — Payment

Unchanged. All tiers (Basic, Premium, Pro) support custom upload.

### Progress bar — dynamic

The progress indicator at the top of the wizard reflects the user's actual path:

- Template path: **5 steps** (Details → Design → Wording → Preview → Payment)
- Upload path: **4 steps** (Details → Design → Preview → Payment)

Switching paths during the wizard updates the progress bar in real time.

### Switching paths mid-wizard — silent

If the user picks a template after having uploaded an image, the file is deleted from disk and `customImagePath` is cleared. If they re-open the upload UI after picking a template, `templateId` is cleared. No confirmation dialog. The data being discarded is one upload or one template selection — minor enough that fluidity wins over caution.

### Lock at payment

Once an event reaches `paymentStatus === 'paid'`, the design choice (template or upload) is locked. The design step is read-only on completed events. Out of scope: swapping designs on already-paid events.

## Public invitation page

For upload events, the page renders a single `<img>` inside a centered, responsive container above the existing RSVP block, plus-one logic, venue-map link, and footer. Replaces the iframe-based render path that template events use.

Layout (mobile and desktop):

- Image: max-width ~600px on desktop, full-width on mobile, height scales by intrinsic aspect ratio
- Below: RSVP form (unchanged)
- Below that: venue map link (unchanged)
- Footer: Eloria branding (hidden when tier has `removeBranding`)

Branding, removeBranding behavior, and `paymentStatus`-gated access are unchanged from existing template events.

## Schema changes

Two new columns on `events`. No new tables.

```ts
invitationType: text('invitation_type').notNull().default('template'), // 'template' | 'upload'
customImagePath: text('custom_image_path'),                            // nullable; relative path under UPLOAD_ROOT
```

Validation rule (enforced at API + serve time, not as DB constraint): exactly one of `templateId` or `customImagePath` must be set on a paid event.

## Storage

Local filesystem. Configured by `UPLOAD_ROOT` env var, default `/var/lib/eloria/uploads/`. The directory lives **outside the deploy directory** so `git pull && npm run build` does not affect it.

Path layout: `<UPLOAD_ROOT>/<eventId>/<uuid>.jpg`. Stored in DB as relative (`<eventId>/<uuid>.jpg`); runtime joins with `UPLOAD_ROOT`.

Migration to S3 / Hetzner Object Storage later: swap the storage layer, write a one-shot script that uploads existing files and rewrites `storedPath` from relative path to S3 key. Schema does not change.

## Endpoints

### Upload

`PUT /api/events/:id/custom-image` — multipart, single field `file`. Auth required, ownership checked, only allowed when event is not yet paid.

Server pipeline:

1. Validate MIME type whitelist: `image/jpeg`, `image/png`, `image/webp`. Reject HEIC with explicit message: *"Please save as JPEG."*
2. Validate file size ≤ 10 MB.
3. Pipe through Sharp: validates that the bytes are a real image, strips EXIF, re-encodes to JPEG @ quality 85.
4. Capture dimensions for response (not stored — not needed at render time).
5. Write to `<UPLOAD_ROOT>/<eventId>/<uuid>.jpg`.
6. Delete previous file (if any) for this event.
7. Update `events`: `invitationType = 'upload'`, `customImagePath = '<eventId>/<uuid>.jpg'`, `templateId = null`.
8. Return `{ path, width, height }`.

### Delete / switch back to template

When the user selects a template after having uploaded, the template-selection endpoint clears the upload. No standalone DELETE needed for the upload itself; switching design paths handles cleanup.

For the case where the user explicitly removes their upload without picking a template: not supported in the wizard (every event must end with one or the other before payment).

### Public serve

`GET /api/invitations/:slug/custom-image` — public.

1. Look up event by slug.
2. Require `paymentStatus === 'paid'`.
3. Verify `invitationType === 'upload'` and `customImagePath` is set.
4. Stream the file from disk with `Content-Type: image/jpeg` and `Cache-Control: public, max-age=31536000, immutable` (UUID filenames are safe to cache forever).

## Tier gating

All paid tiers (Basic, Premium, Pro) support custom upload. No tier check at the upload endpoint beyond ownership and pre-payment state.

## File handling details

- Re-encoding via Sharp neutralizes any malicious bytes hidden in image headers and normalizes formats. This is non-negotiable for security.
- EXIF strip removes location data and camera metadata that couples may not realize is in their photos.
- HEIC support requires libheif and is deferred to a follow-up.
- Animated GIFs: Sharp takes the first frame.
- Aspect ratio: not enforced. Hint shown in the upload UI.

## PDF export

Premium feature — adapts trivially. For upload events, the single image becomes the entire PDF (one page, sized to image dimensions or A5 portrait, whichever is closer). No HTML rendering needed.

## i18n

New strings for both `en.json` and `es.json` covering:

- Upload card title and subtitle
- Dropzone instructions
- File size / format error messages
- HEIC rejection message
- "Replace" / "Continue" / "Back to templates" actions

## Server config

- Add `UPLOAD_ROOT: process.env.UPLOAD_ROOT` to `nuxt.config.ts` runtimeConfig (so the value is captured at build time).
- Production deploy: create `/var/lib/eloria/uploads/`, owned by the PM2 user, writable.
- nginx: `client_max_body_size 12M` in the server block to permit 10 MB uploads with overhead.

## Known limitations

- **Concurrent uploads to the same event are not supported.** The upload endpoint reads the existing `customImagePath`, writes the new file, then deletes the old one. Two simultaneous uploads on the same event can leave an orphaned file on disk (the file written by the losing request — its DB row reference is overwritten by the winner). The wizard prevents simultaneous uploads client-side (file picker disabled while a request is in flight), so this is acceptable for launch. If concurrent-upload semantics matter later, wrap the read-save-delete-update sequence in a transaction.

## Out of scope

- Multiple images per event.
- In-app cropping, rotation, or filters.
- HEIC / RAW / video uploads.
- Text overlays on top of the uploaded image.
- AI-generated invitation images.
- Swapping design (upload ⇄ template) on paid events.
- Per-user disk quotas.
- S3 / object storage.

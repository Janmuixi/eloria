# Custom Invitation Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let couples upload a single image as their invitation, replacing template selection on a per-event basis. The image is stored on local FS, served from a paid-only endpoint, and rendered above the existing RSVP form on the public page.

**Architecture:** Two new columns on `events` (`invitationType`, `customImagePath`). New storage utility around Sharp for safe image re-encoding (strips EXIF, neutralizes payloads). Upload endpoint accepts multipart, returns the new asset metadata. Public-serve endpoint streams from disk with long cache. Wizard step 2 gains a top-positioned upload card; the upload path skips the wording step, so the wizard's progress indicator becomes dynamic (4 steps for upload, 5 for template). Switching paths mid-wizard silently deletes the abandoned upload or template selection.

**Tech Stack:** Nuxt 3 + Nitro h3 (multipart via `readMultipartFormData`), Drizzle ORM (SQLite), `sharp` for image re-encoding, vitest for tests.

---

## File Structure

**New files:**
- `server/utils/image-storage.ts` — pure helpers: `saveImage`, `deleteImage`, `imageAbsolutePath`, `getUploadRoot`
- `server/utils/__tests__/image-storage.test.ts` — unit tests for storage helpers
- `server/api/events/[id]/custom-image.put.ts` — multipart upload endpoint
- `server/api/invitations/[slug]/custom-image.get.ts` — public serve endpoint
- `server/api/__tests__/custom-image.test.ts` — endpoint tests
- `components/invitation/CustomImageView.vue` — public renderer for upload events
- `components/event-wizard/CustomImageUpload.vue` — wizard upload UI
- `server/db/migrations/0001_*.sql` — generated migration

**Modified files:**
- `server/db/schema.ts` — add 2 columns to `events`
- `server/__helpers__/db.ts` — mirror columns in test schema and `createTestEvent`
- `server/api/events/[id].put.ts` — clear customImagePath when template chosen
- `server/api/invitations/[slug].get.ts` — return `invitationType`, `hasCustomImage`
- `server/api/events/[id]/pdf.get.ts` — emit single-image PDF for upload events
- `pages/i/[slug].vue` — branch render on `invitationType`
- `pages/dashboard/events/new.vue` — upload card, in-place swap, dynamic progress, skip step 3
- `i18n/lang/en.json`, `i18n/lang/es.json` — new strings
- `nuxt.config.ts` — `UPLOAD_ROOT` in `runtimeConfig`
- `.env.example` — document `UPLOAD_ROOT`
- `package.json` — add `sharp`

---

## Task 1: Add Sharp dependency and storage utility (TDD)

**Files:**
- Modify: `package.json`
- Create: `server/utils/image-storage.ts`
- Create: `server/utils/__tests__/image-storage.test.ts`

- [ ] **Step 1: Install sharp**

```bash
npm install sharp@^0.34.0
```

- [ ] **Step 2: Write failing test for image-storage**

Create `server/utils/__tests__/image-storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { saveImage, deleteImage, imageAbsolutePath, getUploadRoot } from '../image-storage'

let testRoot: string

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'eloria-uploads-'))
  process.env.UPLOAD_ROOT = testRoot
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  delete process.env.UPLOAD_ROOT
})

async function makeJpegBuffer(width = 100, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer()
}

describe('image-storage', () => {
  it('getUploadRoot returns env var', () => {
    expect(getUploadRoot()).toBe(testRoot)
  })

  it('saveImage writes a re-encoded JPEG to disk and returns a relative path', async () => {
    const buffer = await makeJpegBuffer()
    const result = await saveImage(42, buffer)

    expect(result.relativePath).toMatch(/^42\/[0-9a-f-]+\.jpg$/)
    expect(result.width).toBe(100)
    expect(result.height).toBe(100)

    const fullPath = imageAbsolutePath(result.relativePath)
    expect(existsSync(fullPath)).toBe(true)

    const written = readFileSync(fullPath)
    const meta = await sharp(written).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.exif).toBeUndefined()
  })

  it('saveImage rejects bytes that are not a valid image', async () => {
    await expect(saveImage(1, Buffer.from('not-an-image'))).rejects.toThrow()
  })

  it('deleteImage removes the file from disk', async () => {
    const buffer = await makeJpegBuffer()
    const { relativePath } = await saveImage(7, buffer)
    const fullPath = imageAbsolutePath(relativePath)
    expect(existsSync(fullPath)).toBe(true)

    await deleteImage(relativePath)
    expect(existsSync(fullPath)).toBe(false)
  })

  it('deleteImage is a no-op when the file does not exist', async () => {
    await expect(deleteImage('999/missing.jpg')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the failing test**

Run: `npx vitest run server/utils/__tests__/image-storage.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement `image-storage.ts`**

Create `server/utils/image-storage.ts`:

```ts
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

const DEFAULT_UPLOAD_ROOT = '/var/lib/eloria/uploads'

export function getUploadRoot(): string {
  return process.env.UPLOAD_ROOT || DEFAULT_UPLOAD_ROOT
}

export function imageAbsolutePath(relativePath: string): string {
  const root = getUploadRoot()
  const full = resolve(root, relativePath)
  if (!full.startsWith(resolve(root) + '/') && full !== resolve(root)) {
    throw new Error('Path traversal detected')
  }
  return full
}

export async function saveImage(eventId: number, buffer: Buffer): Promise<{
  relativePath: string
  width: number
  height: number
}> {
  const processed = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .jpeg({ quality: 85, mozjpeg: true })
    .withMetadata({ exif: {} })
    .toBuffer({ resolveWithObject: true })

  const relativePath = `${eventId}/${randomUUID()}.jpg`
  const fullPath = imageAbsolutePath(relativePath)

  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, processed.data)

  return {
    relativePath,
    width: processed.info.width,
    height: processed.info.height,
  }
}

export async function deleteImage(relativePath: string): Promise<void> {
  const fullPath = imageAbsolutePath(relativePath)
  try {
    await unlink(fullPath)
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
  }
}
```

- [ ] **Step 5: Run tests until they pass**

Run: `npx vitest run server/utils/__tests__/image-storage.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/utils/image-storage.ts server/utils/__tests__/image-storage.test.ts
git commit -m "feat(uploads): add image storage utility with Sharp re-encoding"
```

---

## Task 2: Schema migration for `invitationType` and `customImagePath`

**Files:**
- Modify: `server/db/schema.ts`
- Modify: `server/__helpers__/db.ts`
- Create: `server/db/migrations/0001_<auto>.sql` (generated by drizzle-kit)

- [ ] **Step 1: Update schema**

In `server/db/schema.ts`, inside the `events` table definition, add two columns after `templateId`:

```ts
templateId: integer('template_id').references(() => templates.id),
invitationType: text('invitation_type').notNull().default('template'),
customImagePath: text('custom_image_path'),
customization: text('customization'),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file appears at `server/db/migrations/0001_*.sql` containing `ALTER TABLE` statements adding the columns.

Inspect the generated SQL and confirm it adds the two columns with the correct defaults. If drizzle-kit asks an interactive question, answer that the columns are new (not renamed).

- [ ] **Step 3: Apply migration locally**

Run: `npm run db:migrate`
Expected: log line "[migrate] done".

- [ ] **Step 4: Mirror in test helper**

In `server/__helpers__/db.ts`, find the inline `CREATE TABLE events (...)` SQL block and add the two new columns:

```sql
template_id INTEGER,
invitation_type TEXT NOT NULL DEFAULT 'template',
custom_image_path TEXT,
customization TEXT,
```

Then, in the same file, find `createTestEvent` and add optional fields:

```ts
export function createTestEvent(db: TestDb, userId: number, overrides?: Partial<{
  title: string; coupleName1: string; coupleName2: string; date: string;
  venue: string; venueAddress: string; slug: string; tierId: number | null;
  templateId: number | null; paymentStatus: string; customization: string | null;
  invitationType: string; customImagePath: string | null;
}>) {
  const rows = db.insert(events).values({
    userId,
    title: overrides?.title || 'Test Wedding',
    coupleName1: overrides?.coupleName1 || 'Alice',
    coupleName2: overrides?.coupleName2 || 'Bob',
    date: overrides?.date || '2026-06-15',
    venue: overrides?.venue || 'Grand Hotel',
    venueAddress: overrides?.venueAddress || '123 Main St',
    slug: overrides?.slug || `test-slug-${Math.random().toString(36).substring(2, 6)}`,
    tierId: overrides?.tierId ?? null,
    templateId: overrides?.templateId ?? null,
    paymentStatus: overrides?.paymentStatus || 'pending',
    customization: overrides?.customization ?? null,
    invitationType: overrides?.invitationType || 'template',
    customImagePath: overrides?.customImagePath ?? null,
  }).returning().all()
  return rows[0]
}
```

- [ ] **Step 5: Run the existing test suite to confirm nothing broke**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.ts server/db/migrations/ server/__helpers__/db.ts
git commit -m "feat(db): add invitationType and customImagePath columns to events"
```

---

## Task 3: Upload endpoint `PUT /api/events/:id/custom-image` (TDD)

**Files:**
- Create: `server/api/events/[id]/custom-image.put.ts`
- Create: `server/api/__tests__/custom-image.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/api/__tests__/custom-image.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb
let testRoot: string

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const uploadHandler = (await import('../events/[id]/custom-image.put')).default
const { createToken } = await import('../../utils/auth')

async function jpegBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 0, g: 200, b: 200 } } })
    .jpeg()
    .toBuffer()
}

function authedMultipart(userId: number, email: string, eventId: string, parts: Array<{ name: string; data: Buffer; filename?: string; type?: string }>) {
  const token = createToken({ userId, email })
  const ev = createMockEvent({
    method: 'PUT',
    cookies: { auth_token: token },
    params: { id: eventId },
  })
  // Stub readMultipartFormData by attaching to event context.
  ;(ev.context as any).__multipart = parts
  return ev
}

vi.mock('h3', async (orig) => {
  const actual = await orig<typeof import('h3')>()
  return {
    ...actual,
    readMultipartFormData: async (event: any) => event.context?.__multipart || null,
  }
})

beforeEach(() => {
  testDb = createTestDb()
  testRoot = mkdtempSync(join(tmpdir(), 'eloria-test-uploads-'))
  process.env.UPLOAD_ROOT = testRoot
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  delete process.env.UPLOAD_ROOT
})

describe('PUT /api/events/:id/custom-image', () => {
  it('rejects when not authenticated', async () => {
    const ev = createMockEvent({ method: 'PUT', params: { id: '1' } })
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects when event belongs to another user', async () => {
    const owner = await createTestUser(testDb, { email: 'owner@test.com', name: 'Owner' })
    const other = await createTestUser(testDb, { email: 'other@test.com', name: 'Other' })
    const evt = createTestEvent(testDb, owner!.id, {})
    const buf = await jpegBuffer()
    const ev = authedMultipart(other!.id, other!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 'test.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects when event is already paid', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, { paymentStatus: 'paid' })
    const buf = await jpegBuffer()
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 'test.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects unsupported MIME types', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: Buffer.from('PDF data'), filename: 'x.pdf', type: 'application/pdf' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 415 })
  })

  it('rejects HEIC with explicit message', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: Buffer.from('heic'), filename: 'p.heic', type: 'image/heic' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({
      statusCode: 415,
      statusMessage: expect.stringContaining('JPEG'),
    })
  })

  it('rejects files over 10MB', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0)
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: oversized, filename: 'big.jpg', type: 'image/jpeg' },
    ])
    await expect(uploadHandler(ev)).rejects.toMatchObject({ statusCode: 413 })
  })

  it('saves image, sets invitationType=upload, clears templateId', async () => {
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, { templateId: null })
    const buf = await jpegBuffer()
    const ev = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 'test.jpg', type: 'image/jpeg' },
    ])
    const result = await uploadHandler(ev)
    expect(result.invitationType).toBe('upload')
    expect(result.customImagePath).toMatch(/^[0-9]+\/[0-9a-f-]+\.jpg$/)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)

    const reloaded = testDb.query.events.findFirst({ where: (e, { eq }) => eq(e.id, evt!.id) }).sync?.()
      // drizzle in-memory: just re-query using prepared
  })

  it('replaces an existing upload (deletes old file)', async () => {
    const { existsSync } = await import('node:fs')
    const { imageAbsolutePath } = await import('../../utils/image-storage')
    const user = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
    const evt = createTestEvent(testDb, user!.id, {})
    const buf = await jpegBuffer()

    const ev1 = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 't.jpg', type: 'image/jpeg' },
    ])
    const first = await uploadHandler(ev1)
    expect(existsSync(imageAbsolutePath(first.customImagePath))).toBe(true)

    const ev2 = authedMultipart(user!.id, user!.email, String(evt!.id), [
      { name: 'file', data: buf, filename: 't2.jpg', type: 'image/jpeg' },
    ])
    const second = await uploadHandler(ev2)
    expect(second.customImagePath).not.toBe(first.customImagePath)
    expect(existsSync(imageAbsolutePath(first.customImagePath))).toBe(false)
    expect(existsSync(imageAbsolutePath(second.customImagePath))).toBe(true)
  })
})
```

Note: the `reloaded` test step uses an awkward sync call — replace it with the existing pattern used in `events.test.ts` for re-reading events. Use:

```ts
const { db: realDb } = await import('~/server/db')
const reloaded = await realDb.query.events.findFirst({ where: (e: any, { eq }: any) => eq(e.id, evt!.id) })
expect(reloaded?.invitationType).toBe('upload')
expect(reloaded?.customImagePath).toBe(result.customImagePath)
expect(reloaded?.templateId).toBeNull()
```

- [ ] **Step 2: Run tests; expect failures**

Run: `npx vitest run server/api/__tests__/custom-image.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the upload endpoint**

Create `server/api/events/[id]/custom-image.put.ts`:

```ts
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { saveImage, deleteImage } from '~/server/utils/image-storage'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HEIC_TYPES = new Set(['image/heic', 'image/heif'])
const MAX_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  if (existing.paymentStatus === 'paid') {
    throw createError({ statusCode: 403, statusMessage: 'Cannot change design after payment' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }
  const mime = (file.type || '').toLowerCase()
  if (HEIC_TYPES.has(mime)) {
    throw createError({ statusCode: 415, statusMessage: 'HEIC is not supported. Please save as JPEG.' })
  }
  if (!ALLOWED_TYPES.has(mime)) {
    throw createError({ statusCode: 415, statusMessage: 'Only JPEG, PNG, and WebP images are allowed.' })
  }
  if (file.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 10MB or smaller.' })
  }

  let saved
  try {
    saved = await saveImage(id, file.data)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'File is not a valid image.' })
  }

  if (existing.customImagePath) {
    await deleteImage(existing.customImagePath)
  }

  await db.update(events).set({
    invitationType: 'upload',
    customImagePath: saved.relativePath,
    templateId: null,
  }).where(eq(events.id, id))

  return {
    invitationType: 'upload' as const,
    customImagePath: saved.relativePath,
    width: saved.width,
    height: saved.height,
  }
})
```

- [ ] **Step 4: Run tests until they pass**

Run: `npx vitest run server/api/__tests__/custom-image.test.ts`
Expected: PASS (8 tests).

If a test fails because `readMultipartFormData` is not mocked correctly, verify the `vi.mock('h3', ...)` block sits at module top-level before handler import.

- [ ] **Step 5: Commit**

```bash
git add server/api/events/[id]/custom-image.put.ts server/api/__tests__/custom-image.test.ts
git commit -m "feat(uploads): add custom-image upload endpoint with validation"
```

---

## Task 4: Public serve endpoint `GET /api/invitations/:slug/custom-image` (TDD)

**Files:**
- Create: `server/api/invitations/[slug]/custom-image.get.ts`
- Modify: `server/api/__tests__/custom-image.test.ts` (append cases)

- [ ] **Step 1: Append failing tests** at the bottom of `server/api/__tests__/custom-image.test.ts`:

```ts
const serveHandler = (await import('../invitations/[slug]/custom-image.get')).default

describe('GET /api/invitations/:slug/custom-image', () => {
  it('404 when event does not exist', async () => {
    const ev = createMockEvent({ method: 'GET', params: { slug: 'missing' } })
    await expect(serveHandler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404 when event is not paid', async () => {
    const user = await createTestUser(testDb, { email: 'p@test.com', name: 'P' })
    const evt = createTestEvent(testDb, user!.id, { slug: 'unpaid', paymentStatus: 'pending' })
    const ev = createMockEvent({ method: 'GET', params: { slug: 'unpaid' } })
    await expect(serveHandler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404 when event is paid but invitationType is template', async () => {
    const user = await createTestUser(testDb, { email: 'p@test.com', name: 'P' })
    createTestEvent(testDb, user!.id, {
      slug: 'tmpl', paymentStatus: 'paid', invitationType: 'template',
    })
    const ev = createMockEvent({ method: 'GET', params: { slug: 'tmpl' } })
    await expect(serveHandler(ev)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('streams the image with correct Content-Type and cache headers', async () => {
    const { saveImage } = await import('../../utils/image-storage')
    const user = await createTestUser(testDb, { email: 'p@test.com', name: 'P' })
    const buf = await jpegBuffer()
    const evt = createTestEvent(testDb, user!.id, {
      slug: 'paid-up', paymentStatus: 'paid', invitationType: 'upload',
    })
    const saved = await saveImage(evt!.id, buf)
    const { db: realDb } = await import('~/server/db')
    await realDb.update(events).set({ customImagePath: saved.relativePath })
      .where(eq(events.id, evt!.id))

    const ev = createMockEvent({ method: 'GET', params: { slug: 'paid-up' } })
    const result = await serveHandler(ev) as Buffer | Uint8Array
    expect(result.length).toBeGreaterThan(0)

    // Headers should have been set on the response
    const headers = ev.node.res.getHeaders()
    expect(headers['content-type']).toBe('image/jpeg')
    expect(String(headers['cache-control'])).toContain('immutable')
  })
})
```

Add the missing imports at the top of the file:

```ts
import { eq } from 'drizzle-orm'
import { events } from '~/server/db/schema'
```

- [ ] **Step 2: Run tests; expect 4 failures**

Run: `npx vitest run server/api/__tests__/custom-image.test.ts`
Expected: 4 new tests fail with "module not found".

- [ ] **Step 3: Implement the serve endpoint**

Create `server/api/invitations/[slug]/custom-image.get.ts`:

```ts
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { imageAbsolutePath } from '~/server/utils/image-storage'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug required' })

  const evt = await db.query.events.findFirst({ where: eq(events.slug, slug) })
  if (!evt || evt.paymentStatus !== 'paid') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  if (evt.invitationType !== 'upload' || !evt.customImagePath) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const fullPath = imageAbsolutePath(evt.customImagePath)
  try {
    await stat(fullPath)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Image missing' })
  }

  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return sendStream(event, createReadStream(fullPath))
})
```

- [ ] **Step 4: Run tests until they pass**

Run: `npx vitest run server/api/__tests__/custom-image.test.ts`
Expected: PASS (12 tests total).

If `sendStream` cannot be unit-tested in the mock environment, change the test that asserts on the streamed body to assert on the headers only and read the file from disk directly.

- [ ] **Step 5: Commit**

```bash
git add server/api/invitations/[slug]/custom-image.get.ts server/api/__tests__/custom-image.test.ts
git commit -m "feat(uploads): add public serve endpoint for custom invitation images"
```

---

## Task 5: Update events PUT to clear customImagePath on template selection (TDD)

**Files:**
- Modify: `server/api/events/[id].put.ts`
- Modify: `server/api/__tests__/events.test.ts`

- [ ] **Step 1: Add failing tests** to `server/api/__tests__/events.test.ts` inside the existing `describe('PUT /api/events/:id', ...)` block (or create one if none exists):

```ts
it('clears customImagePath and deletes file when templateId is set', async () => {
  const { saveImage, imageAbsolutePath } = await import('../../utils/image-storage')
  const { existsSync, mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const sharp = (await import('sharp')).default

  const root = mkdtempSync(join(tmpdir(), 'el-'))
  process.env.UPLOAD_ROOT = root
  try {
    const user = await createTestUser(testDb, { email: 'sw@test.com', name: 'SW' })
    const evt = createTestEvent(testDb, user!.id, { invitationType: 'upload' })
    const buf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer()
    const saved = await saveImage(evt!.id, buf)
    const { db: realDb } = await import('~/server/db')
    const { events: ev } = await import('../../db/schema')
    const { eq } = await import('drizzle-orm')
    await realDb.update(ev).set({ customImagePath: saved.relativePath }).where(eq(ev.id, evt!.id))
    expect(existsSync(imageAbsolutePath(saved.relativePath))).toBe(true)

    const tier = (testDb.select().from(await import('../../db/schema').then(m => m.tiers)).all() as any[])[0]
    const tmpl = (await import('../../__helpers__/db')).seedTemplate(testDb, tier.id)

    const httpEv = authEvent(user!.id, user!.email, {
      method: 'PUT', params: { id: String(evt!.id) }, body: { templateId: tmpl.id },
    })
    const result = await updateHandler(httpEv)
    expect(result.templateId).toBe(tmpl.id)
    expect(result.customImagePath).toBeNull()
    expect(result.invitationType).toBe('template')
    expect(existsSync(imageAbsolutePath(saved.relativePath))).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
    delete process.env.UPLOAD_ROOT
  }
})
```

Note: the existing test file imports `tiers` and a seed helper. If `seedTemplate` is not present in `db.ts`, refer to its actual export (this codebase has it).

- [ ] **Step 2: Run failing test**

Run: `npx vitest run server/api/__tests__/events.test.ts -t "clears customImagePath"`
Expected: FAIL.

- [ ] **Step 3: Update `server/api/events/[id].put.ts`**

Replace the body of the handler with:

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { deleteImage } from '~/server/utils/image-storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }
  if (existing.paymentStatus === 'locked') {
    throw createError({ statusCode: 403, statusMessage: 'Event is locked. Reactivate your subscription to make changes.' })
  }

  const settingTemplate = body.templateId !== undefined && body.templateId !== null
  const willClearImage = settingTemplate && existing.customImagePath

  const update: Record<string, unknown> = {
    templateId: body.templateId ?? existing.templateId,
    customization: body.customization ?? existing.customization,
    tierId: body.tierId ?? existing.tierId,
    title: body.title ?? existing.title,
    coupleName1: body.coupleName1 ?? existing.coupleName1,
    coupleName2: body.coupleName2 ?? existing.coupleName2,
    date: body.date ?? existing.date,
    venue: body.venue ?? existing.venue,
    venueAddress: body.venueAddress ?? existing.venueAddress,
    venueMapUrl: body.venueMapUrl ?? existing.venueMapUrl,
    description: body.description ?? existing.description,
  }

  if (settingTemplate) {
    update.invitationType = 'template'
    update.customImagePath = null
  }

  const [updated] = await db.update(events)
    .set(update)
    .where(and(eq(events.id, id), eq(events.userId, user.id)))
    .returning()

  if (willClearImage && existing.customImagePath) {
    await deleteImage(existing.customImagePath).catch(() => {})
  }

  return updated
})
```

- [ ] **Step 4: Run the test until it passes**

Run: `npx vitest run server/api/__tests__/events.test.ts -t "clears customImagePath"`
Expected: PASS.

- [ ] **Step 5: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/[id].put.ts server/api/__tests__/events.test.ts
git commit -m "feat(uploads): clear custom image when switching to a template"
```

---

## Task 6: Update invitation summary endpoint (TDD)

**Files:**
- Modify: `server/api/invitations/[slug].get.ts`
- Modify: `server/api/__tests__/invitations.test.ts`

- [ ] **Step 1: Add failing tests** to the invitations test file:

```ts
it('returns invitationType=upload and hasCustomImage=true for upload events', async () => {
  const user = await createTestUser(testDb, { email: 'u@test.com', name: 'U' })
  const evt = createTestEvent(testDb, user!.id, {
    slug: 'up-evt', paymentStatus: 'paid', invitationType: 'upload',
    customImagePath: 'evt/x.jpg',
  })
  const ev = createMockEvent({ method: 'GET', params: { slug: 'up-evt' } })
  const result = await handler(ev)
  expect(result.invitationType).toBe('upload')
  expect(result.hasCustomImage).toBe(true)
  expect(result.template).toBeNull()
})

it('returns invitationType=template and hasCustomImage=false otherwise', async () => {
  const user = await createTestUser(testDb, { email: 'u@test.com', name: 'U' })
  const tier = (testDb.select().from((await import('../../db/schema')).tiers).all() as any[])[0]
  const tmpl = (await import('../../__helpers__/db')).seedTemplate(testDb, tier.id)
  createTestEvent(testDb, user!.id, {
    slug: 't-evt', paymentStatus: 'paid', invitationType: 'template', templateId: tmpl.id,
  })
  const ev = createMockEvent({ method: 'GET', params: { slug: 't-evt' } })
  const result = await handler(ev)
  expect(result.invitationType).toBe('template')
  expect(result.hasCustomImage).toBe(false)
})
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run server/api/__tests__/invitations.test.ts -t "invitationType"`
Expected: FAIL.

- [ ] **Step 3: Update `server/api/invitations/[slug].get.ts`**

Add the two new fields to the returned object:

```ts
return {
  coupleName1: evt.coupleName1,
  coupleName2: evt.coupleName2,
  date: evt.date,
  venue: evt.venue,
  venueAddress: evt.venueAddress,
  venueMapUrl: evt.venueMapUrl,
  description: evt.description,
  customization: evt.customization ? JSON.parse(evt.customization) : null,
  template: evt.template,
  invitationType: evt.invitationType,
  hasCustomImage: evt.invitationType === 'upload' && !!evt.customImagePath,
  removeBranding: evt.tier?.removeBranding || false,
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/api/__tests__/invitations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/invitations/[slug].get.ts server/api/__tests__/invitations.test.ts
git commit -m "feat(invitations): expose invitationType and hasCustomImage on summary"
```

---

## Task 7: PDF export for upload events

**Files:**
- Modify: `server/api/events/[id]/pdf.get.ts`

- [ ] **Step 1: Read the current implementation** at `server/api/events/[id]/pdf.get.ts`. It uses puppeteer to render the public page to PDF.

- [ ] **Step 2: Update the handler** so that when `event.invitationType === 'upload'`:

- Skip puppeteer entirely.
- Read the image file from disk.
- Use `pdf-lib` or puppeteer's image-to-PDF (already installed) to produce a single-page PDF whose page size matches the image's aspect ratio, scaled to fit A5 portrait at 300 DPI.

If `pdf-lib` is not installed, prefer puppeteer: open a blank page with `<html><body style="margin:0"><img src="data:..."></body></html>` and emit PDF.

Concrete change at the start of the handler (read the existing file first to find the exact insertion point):

```ts
import { readFile } from 'node:fs/promises'
import { imageAbsolutePath } from '~/server/utils/image-storage'

// ... after fetching the event, before launching puppeteer for HTML render:
if (evt.invitationType === 'upload' && evt.customImagePath) {
  const imageBytes = await readFile(imageAbsolutePath(evt.customImagePath))
  const dataUrl = `data:image/jpeg;base64,${imageBytes.toString('base64')}`

  const browser = await puppeteer.launch({ /* same args as existing */ })
  const page = await browser.newPage()
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">
      <img src="${dataUrl}" style="display:block;width:100%;height:auto" />
    </body></html>`,
    { waitUntil: 'load' }
  )
  const pdf = await page.pdf({ format: 'A5', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
  await browser.close()

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="invitation.pdf"`)
  return pdf
}

// ... existing template rendering path follows unchanged
```

- [ ] **Step 3: Manual smoke test**

Run dev server: `npm run dev`. With a paid upload event, navigate to `/api/events/{id}/pdf` while authenticated. Confirm the downloaded PDF shows the uploaded image as its sole page.

If a vitest test for PDF generation already exists, extend it. Otherwise this manual step is acceptable for puppeteer-driven code.

- [ ] **Step 4: Commit**

```bash
git add server/api/events/[id]/pdf.get.ts
git commit -m "feat(pdf): emit single-image PDF for upload-type events"
```

---

## Task 8: i18n strings

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Add an `eventWizard.customImage` block** to `en.json`. Insert at an appropriate level (mirroring existing wizard keys):

```json
"customImage": {
  "cardTitle": "Upload your own invitation",
  "cardSubtitle": "Already have a design? Use it.",
  "uploadHeading": "Upload your invitation",
  "uploadHint": "Recommended: portrait, ~1080×1500. JPG, PNG, or WebP, max 10 MB.",
  "dropzoneLabel": "Drag your image here or click to browse",
  "replace": "Replace",
  "continue": "Continue",
  "backToTemplates": "← Back to templates",
  "errorTooLarge": "Image must be 10 MB or smaller.",
  "errorWrongType": "Only JPEG, PNG, and WebP images are allowed.",
  "errorHeic": "HEIC is not supported. Please save as JPEG.",
  "errorGeneric": "Could not upload image. Please try again.",
  "uploading": "Uploading…"
}
```

- [ ] **Step 2: Mirror in `es.json` with translations**:

```json
"customImage": {
  "cardTitle": "Sube tu propia invitación",
  "cardSubtitle": "¿Ya tienes un diseño? Úsalo.",
  "uploadHeading": "Sube tu invitación",
  "uploadHint": "Recomendado: orientación vertical, ~1080×1500. JPG, PNG o WebP, máx. 10 MB.",
  "dropzoneLabel": "Arrastra tu imagen aquí o haz clic para buscarla",
  "replace": "Reemplazar",
  "continue": "Continuar",
  "backToTemplates": "← Volver a plantillas",
  "errorTooLarge": "La imagen debe pesar 10 MB o menos.",
  "errorWrongType": "Solo se permiten imágenes JPEG, PNG o WebP.",
  "errorHeic": "HEIC no es compatible. Por favor, guárdala como JPEG.",
  "errorGeneric": "No se pudo subir la imagen. Inténtalo de nuevo.",
  "uploading": "Subiendo…"
}
```

- [ ] **Step 3: Run tests to verify no JSON parse errors**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n(custom-image): add strings for upload flow (en, es)"
```

---

## Task 9: Public-page rendering branch

**Files:**
- Create: `components/invitation/CustomImageView.vue`
- Modify: `pages/i/[slug].vue`

- [ ] **Step 1: Create `components/invitation/CustomImageView.vue`**:

```vue
<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const imageUrl = `/api/invitations/${props.slug}/custom-image`
</script>

<template>
  <div class="flex justify-center px-4 py-8">
    <img
      :src="imageUrl"
      alt=""
      class="max-w-full md:max-w-[600px] w-full h-auto rounded-md shadow-sm"
    />
  </div>
</template>
```

- [ ] **Step 2: Update `pages/i/[slug].vue`**

Read the file. In the script setup, after `const { data: invitation, error } = await useFetch(\`/api/invitations/${slug}\`)`, add:

```ts
const isUpload = computed(() => invitation.value?.invitationType === 'upload')
```

In the template, find the `<iframe>` element used to render the template and wrap it:

```html
<CustomImageView v-if="isUpload" :slug="slug" />
<iframe
  v-else
  ref="iframeRef"
  :src="renderedUrl"
  class="w-full border-0 block"
  :style="{ height: iframeHeight + 'px' }"
/>
```

The RSVP form, footer, and rest of the page remain unchanged for both branches.

- [ ] **Step 3: Manual verification in dev**

Run `npm run dev`. Create a paid event with `invitationType='upload'` (use the SQLite client or your existing flow once Task 11 is done). Visit `/i/<slug>` and confirm the image renders with the RSVP form below.

If Task 11 isn't done yet, manually update an existing event in the DB:

```sql
UPDATE events SET invitation_type = 'upload', custom_image_path = '<eventId>/<uuid>.jpg', payment_status = 'paid' WHERE id = <id>;
```

- [ ] **Step 4: Commit**

```bash
git add components/invitation/CustomImageView.vue pages/i/[slug].vue
git commit -m "feat(invitation): render uploaded image on public page for upload events"
```

---

## Task 10: Wizard upload component

**Files:**
- Create: `components/event-wizard/CustomImageUpload.vue`

- [ ] **Step 1: Create the component**:

```vue
<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ eventId: number; existingPath: string | null }>()
const emit = defineEmits<{
  (e: 'uploaded', path: string): void
  (e: 'cancel'): void
}>()

const dragActive = ref(false)
const uploading = ref(false)
const error = ref('')
const previewUrl = ref<string | null>(props.existingPath ? `/api/events/${props.eventId}/custom-image?cb=${Date.now()}` : null)
const fileInput = ref<HTMLInputElement | null>(null)

async function handleFile(file: File) {
  error.value = ''
  if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
    error.value = t('eventWizard.customImage.errorHeic'); return
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = t('eventWizard.customImage.errorWrongType'); return
  }
  if (file.size > 10 * 1024 * 1024) {
    error.value = t('eventWizard.customImage.errorTooLarge'); return
  }
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await $fetch<{ customImagePath: string }>(`/api/events/${props.eventId}/custom-image`, {
      method: 'PUT', body: form,
    })
    previewUrl.value = URL.createObjectURL(file)
    emit('uploaded', res.customImagePath)
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('eventWizard.customImage.errorGeneric')
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault(); dragActive.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) handleFile(f)
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) handleFile(f)
}

function clearAndReupload() {
  previewUrl.value = null
  fileInput.value?.click()
}
</script>

<template>
  <div>
    <button class="text-sm text-charcoal-700 hover:underline mb-4" @click="emit('cancel')">
      {{ t('eventWizard.customImage.backToTemplates') }}
    </button>

    <h2 class="font-display font-semibold text-xl text-charcoal-900 mb-1">
      {{ t('eventWizard.customImage.uploadHeading') }}
    </h2>
    <p class="text-sm text-charcoal-500 mb-6">{{ t('eventWizard.customImage.uploadHint') }}</p>

    <div v-if="!previewUrl">
      <label
        class="block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors"
        :class="dragActive ? 'border-champagne-500 bg-champagne-50' : 'border-charcoal-300 bg-white'"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop="onDrop"
      >
        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onPick" />
        <p class="text-charcoal-500">{{ t('eventWizard.customImage.dropzoneLabel') }}</p>
        <p v-if="uploading" class="text-charcoal-400 mt-2 text-sm">{{ t('eventWizard.customImage.uploading') }}</p>
      </label>
    </div>

    <div v-else class="space-y-4">
      <img :src="previewUrl" class="max-w-md mx-auto rounded-md shadow-sm" alt="" />
      <div class="flex gap-3 justify-center">
        <button class="px-4 py-2 rounded-full border border-charcoal-300 hover:bg-charcoal-50" @click="clearAndReupload">
          {{ t('eventWizard.customImage.replace') }}
        </button>
        <button class="px-5 py-2 rounded-full bg-champagne-500 text-white hover:bg-champagne-600" @click="emit('uploaded', '')">
          {{ t('eventWizard.customImage.continue') }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-red-600 text-sm mt-3">{{ error }}</p>
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onPick" />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add components/event-wizard/CustomImageUpload.vue
git commit -m "feat(wizard): add CustomImageUpload component for drag-drop UI"
```

---

## Task 11: Wizard step 2 — upload card, in-place swap, dynamic progress, skip step 3

**Files:**
- Modify: `pages/dashboard/events/new.vue`

- [ ] **Step 1: Read the file** to find:
  - The `currentStep` state
  - Step 2 template grid section
  - The progress indicator (if present at top of wizard)
  - Step 3 wording section

- [ ] **Step 2: Add state for upload mode**

In the script setup, near `const selectedTemplateId = ref<number | null>(null)`:

```ts
const customImagePath = ref<string | null>(null)
const isUploadMode = ref(false)
const showUploadUI = ref(false)

const invitationType = computed(() => customImagePath.value ? 'upload' : 'template')
const totalSteps = computed(() => invitationType.value === 'upload' ? 4 : 5)

function visibleStep(actualStep: number): number {
  // Maps actual step (1..5) to display step (1..4 for upload, 1..5 for template)
  if (invitationType.value === 'template') return actualStep
  if (actualStep <= 2) return actualStep
  return actualStep - 1 // skip step 3 in display
}
```

- [ ] **Step 3: Add the upload card to step 2 template**

At the very top of the step-2 section in the template, before the existing template grid, add:

```html
<button
  class="block w-full mb-6 p-6 rounded-2xl border-2 border-champagne-500 bg-champagne-50 hover:bg-champagne-100 transition-colors text-left"
  :class="customImagePath ? 'ring-2 ring-champagne-500' : ''"
  @click="showUploadUI = true"
>
  <div class="flex items-center gap-4">
    <div class="shrink-0 w-12 h-12 rounded-full bg-champagne-500 text-white flex items-center justify-center">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6.5h.6a4.5 4.5 0 01.5 8.97" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12v9m0-9l-3 3m3-3l3 3" />
      </svg>
    </div>
    <div>
      <h3 class="font-display font-semibold text-charcoal-900">
        {{ $t('eventWizard.customImage.cardTitle') }}
      </h3>
      <p class="text-sm text-charcoal-500">{{ $t('eventWizard.customImage.cardSubtitle') }}</p>
    </div>
  </div>
</button>

<div v-if="showUploadUI" class="mb-6">
  <CustomImageUpload
    :event-id="eventId!"
    :existing-path="customImagePath"
    @uploaded="onUploadCompleted"
    @cancel="showUploadUI = false"
  />
</div>

<div v-else class="text-sm text-charcoal-500 mb-4">— {{ $t('common.or') }} —</div>
```

(The wizard already iterates over `tiersList` for template selection — leave that intact below.)

- [ ] **Step 4: Wire up the handler**

In the script setup:

```ts
function onUploadCompleted(path: string) {
  if (path) customImagePath.value = path
  // Clear template selection when going to upload path
  selectedTemplateId.value = null
  showUploadUI.value = false
  // Advance the wizard
  currentStep.value = invitationType.value === 'upload' ? 4 : 3 // skip wording
}

// Existing template-pick logic should clear customImagePath:
function selectTemplate(id: number) {
  selectedTemplateId.value = id
  customImagePath.value = null
  // The events PUT endpoint handles file deletion server-side via templateId set.
}
```

Find the existing `selectedTemplateId.value = ...` assignments in the template grid `@click` handlers and replace them with `selectTemplate(tier.id)` (or whatever property the existing code uses).

- [ ] **Step 5: Skip wording step on upload path**

Find the step-3 advance button (the wording confirm). In addition, change any logic that conditionally goes to step 3 to:

```ts
function goToWording() {
  if (invitationType.value === 'upload') {
    currentStep.value = 4
  } else {
    currentStep.value = 3
  }
}
```

The "Continue" button on the upload UI already triggers `onUploadCompleted` which jumps straight to step 4.

- [ ] **Step 6: Update the progress indicator (if present)**

If the wizard renders a progress bar like `<div>Step {{ currentStep }} of 5</div>`, update it to use the dynamic computed:

```html
<div>{{ $t('eventWizard.stepOf', { current: visibleStep(currentStep), total: totalSteps }) }}</div>
```

Add the i18n key `eventWizard.stepOf` ("Step {current} of {total}" / "Paso {current} de {total}") in both en/es JSON.

- [ ] **Step 7: Persist on event creation completion**

When the user clicks the final "Pay" button on step 5, the existing `payAndPublish` and subscription paths already work because the upload endpoint set `customImagePath` and `templateId` server-side at upload time. No additional persistence needed.

However: if the user reaches step 5 with an upload but their event still has `invitationType='template'` from a stale cache, ensure your `payAndPublish` flow does a refetch of the event before redirecting. Verify by inspecting the existing flow.

- [ ] **Step 8: Manual smoke test**

Run `npm run dev`. Walk through event creation:
1. Step 1: enter event details.
2. Step 2: click the upload card. Drop a JPG. Click Continue.
3. Confirm wizard jumps to step 4 (preview), skipping wording.
4. Confirm preview shows the uploaded image above the RSVP form.
5. Pay (use a Stripe test card or your 100% promo code).
6. After redirect, visit the public `/i/<slug>` and confirm image renders.
7. Repeat with template path; confirm step 3 (wording) appears as before.
8. Try switching mid-flow: pick a template, then change mind and click upload card. Confirm `selectedTemplateId` clears.

- [ ] **Step 9: Commit**

```bash
git add pages/dashboard/events/new.vue i18n/lang/en.json i18n/lang/es.json
git commit -m "feat(wizard): add upload card, dynamic progress, skip wording on upload path"
```

---

## Task 12: Server config and deployment notes

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add UPLOAD_ROOT to runtimeConfig**

In `nuxt.config.ts`, add to the `runtimeConfig` block:

```ts
UPLOAD_ROOT: process.env.UPLOAD_ROOT,
```

- [ ] **Step 2: Document in `.env.example`**

Add at the end:

```
UPLOAD_ROOT=/var/lib/eloria/uploads
```

- [ ] **Step 3: Add deployment notes** to the spec doc (`docs/superpowers/specs/2026-04-25-custom-invitation-upload-design.md`) under "Server config" — confirm the existing section already covers nginx `client_max_body_size 12M` and directory creation on the Hetzner box. If not already there, add a brief paragraph.

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts .env.example
git commit -m "chore(deploy): add UPLOAD_ROOT to runtime config and env example"
```

- [ ] **Step 5: Production rollout (manual, server-side, after deploy)**

```bash
# On the Hetzner server, as root or via sudo:
mkdir -p /var/lib/eloria/uploads
chown -R <pm2-user>:<pm2-user> /var/lib/eloria/uploads
chmod 750 /var/lib/eloria/uploads

# Add UPLOAD_ROOT to .env in the project root:
echo "UPLOAD_ROOT=/var/lib/eloria/uploads" >> /path/to/weddingplanner/.env

# Update nginx server block — inside the relevant `server { }`:
#   client_max_body_size 12M;
sudo nginx -t && sudo systemctl reload nginx

# Pull, build, restart:
cd /path/to/weddingplanner
git pull
npm install         # pulls in sharp's native binary
npm run build
npm run db:migrate
pm2 restart eloria
```

---

## Self-review notes

- **Spec coverage:** Schema (Task 2), storage (Task 1), upload endpoint (Task 3), serve endpoint (Task 4), template/upload swap (Task 5), summary endpoint (Task 6), PDF (Task 7), i18n (Task 8), public page (Task 9), wizard upload UI (Task 10), wizard branching (Task 11), config (Task 12). All sections of the spec map to a task.
- **Tier gating:** spec says "all paid tiers". Upload endpoint refuses only if event is already paid; pre-payment uploads are unrestricted by tier. Correct per spec.
- **Lock at payment:** enforced at upload endpoint (403 when paymentStatus === 'paid'). Spec satisfied.
- **Silent path switch:** template path clears upload via events PUT (Task 5). Upload path clears template via upload endpoint (Task 3). Symmetric.
- **Dynamic progress:** `visibleStep` and `totalSteps` computeds in Task 11.
- **One image per event:** schema has a single column; upload endpoint deletes prior file (Task 3).

If any test step references something undefined in this plan, raise it as a blocker rather than guessing.

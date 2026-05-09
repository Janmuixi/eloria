# Send Invitations Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a primary "Send invitations" button on the guests tab that bulk-sends invitations to uninvited guests, plus a per-row resend control in the expand panel — all gated by a confirmation modal and surfaced via an inline result banner.

**Architecture:** Extend the existing `POST /api/events/[id]/send-invitations` endpoint with an optional `guestIds` body parameter to support explicit resends. All UI work is contained in `pages/dashboard/events/[id]/guests.vue` (state, toolbar button, inline modal, inline banner, expand-panel additions). i18n keys go to `i18n/lang/{en,es}.json`.

**Tech Stack:** Nuxt 3, Vue 3, Drizzle ORM (SQLite), Resend, vitest, @nuxtjs/i18n.

**Spec:** `docs/superpowers/specs/2026-05-09-send-invitations-button-design.md`

---

## File Structure

| File                                                     | Change                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `server/api/events/[id]/send-invitations.post.ts`        | Modify — accept optional `guestIds: number[]`, branch the WHERE clause                            |
| `server/api/__tests__/send-invitations.test.ts`          | Modify — add tests for new behavior                                                               |
| `pages/dashboard/events/[id]/guests.vue`                 | Modify — add state, toolbar button, inline modal, banner, expand-panel resend                     |
| `i18n/lang/en.json`                                      | Modify — add `guests.invitations.*` keys                                                          |
| `i18n/lang/es.json`                                      | Modify — add `guests.invitations.*` keys                                                          |

---

## Task 1: Extend send-invitations endpoint to accept guestIds

**Files:**
- Modify: `server/api/__tests__/send-invitations.test.ts`
- Modify: `server/api/events/[id]/send-invitations.post.ts`

The endpoint currently sends to all guests with `email IS NOT NULL AND emailSentAt IS NULL`. We add support for an optional `guestIds: number[]` body param. When provided, the endpoint sends to those specific guest IDs (filtering only by `email IS NOT NULL` and `eventId`), enabling explicit resend. When omitted, current behavior is preserved.

The `eventId` clause keeps cross-event IDs from leaking — passing a guest ID from another event simply matches zero rows.

- [ ] **Step 1: Add a failing test for the resend (guestIds) path**

Append new tests inside the existing `describe('POST /api/events/[id]/send-invitations', ...)` block in `server/api/__tests__/send-invitations.test.ts`.

First, update the imports. The existing destructured import from `../../__helpers__/db` already pulls in `createTestDb`, `createTestUser`, `createTestEvent`, `seedTiers`, `seedTemplate`, and `type TestDb`. Add `createTestGuest` to that same import list (do not create a duplicate import line). Then, immediately below that import, add two new lines:

```typescript
import { guests } from '../../db/schema'
import { eq } from 'drizzle-orm'
```

Add this test at the bottom of the `describe` block (before the closing `})`):

```typescript
  it('with guestIds in body: sends to those guests even if emailSentAt is set (resend path)', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'resend@test.com', name: 'R' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })
    const alreadySent = createTestGuest(testDb, evt!.id, { name: 'Already', email: 'a@x.com' })
    testDb.update(guests).set({ emailSentAt: '2026-04-01T00:00:00.000Z' }).where(eq(guests.id, alreadySent!.id)).run()

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
      body: { guestIds: [alreadySent!.id] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1)
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com' }))
  })

  it('with guestIds in body: ignores ids that belong to another event', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    ;(sendInvitationEmail as any).mockClear()
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'cross@test.com', name: 'X' })
    const template = seedTemplate(testDb, 2)
    const evtA = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
      slug: 'a-event',
    })
    const evtB = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
      slug: 'b-event',
    })
    const guestInB = createTestGuest(testDb, evtB!.id, { name: 'Other', email: 'b@x.com' })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evtA!.id) },
      body: { guestIds: [guestInB!.id] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
    expect(sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('with guestIds in body: skips guests that have no email', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    ;(sendInvitationEmail as any).mockClear()
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'noemail@test.com', name: 'N' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })
    const noEmailGuest = createTestGuest(testDb, evt!.id, { name: 'NoEmail', email: null })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
      body: { guestIds: [noEmailGuest!.id] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
    expect(sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('with empty guestIds array in body: behaves as no-guestIds (uninvited path)', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    ;(sendInvitationEmail as any).mockClear()
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'empty@test.com', name: 'E' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })
    const fresh = createTestGuest(testDb, evt!.id, { name: 'Fresh', email: 'f@x.com' })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
      body: { guestIds: [] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'f@x.com' }))
  })
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npm test -- send-invitations`
Expected: the four new tests fail (the endpoint ignores the body and falls through to the legacy path, so cross-event/no-email tests would actually pass; resend test fails because `emailSentAt IS NULL` filter excludes the seeded guest). The exact failures will vary — what matters is that at least the resend test fails. The two existing tests should still pass.

- [ ] **Step 3: Implement the endpoint change**

Replace the body of `server/api/events/[id]/send-invitations.post.ts` with the following. The change is: read body, branch the WHERE based on `guestIds`. Everything else (auth, tier/template guards, send loop, response) stays the same.

```typescript
import { requireAuth } from '~/server/utils/auth'
import { sendInvitationEmail } from '~/server/utils/email'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = parseInt(getRouterParam(event, 'id')!)

  const resendApiKey = resolveEnvVar('RESEND_API_KEY')
  if (!resendApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Email delivery is not configured. RESEND_API_KEY is missing.',
    })
  }

  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  if (userEvent.paymentStatus !== 'paid') {
    throw createError({ statusCode: 403, statusMessage: 'Event must be paid to send invitations' })
  }

  if (!userEvent.tier?.hasEmailDelivery) {
    throw createError({ statusCode: 403, statusMessage: 'Email delivery is not available on your plan' })
  }

  const hasDesign = userEvent.templateId != null
    || (userEvent.invitationType === 'upload' && userEvent.customImagePath)
  if (!hasDesign) {
    throw createError({ statusCode: 400, statusMessage: 'Select a template or upload an image before sending invitations' })
  }

  const body = await readBody(event).catch(() => ({})) as { guestIds?: unknown }
  const explicitIds = Array.isArray(body?.guestIds)
    ? body.guestIds.filter((v): v is number => typeof v === 'number')
    : null

  const targetGuests = await db.query.guests.findMany({
    where: explicitIds && explicitIds.length > 0
      ? and(eq(guests.eventId, eventId), isNotNull(guests.email), inArray(guests.id, explicitIds))
      : and(eq(guests.eventId, eventId), isNotNull(guests.email), isNull(guests.emailSentAt)),
  })

  if (targetGuests.length === 0) {
    return { sent: 0, failed: 0, message: 'No invitations to send' }
  }

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
  let sent = 0
  let failed = 0

  for (const guest of targetGuests) {
    if (!guest.email) continue

    try {
      const invitationUrl = `${baseUrl}/i/${userEvent.slug}?g=${guest.token}`

      await sendInvitationEmail({
        to: guest.email,
        guestName: guest.name,
        coupleName1: userEvent.coupleName1,
        coupleName2: userEvent.coupleName2,
        date: new Date(userEvent.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        invitationUrl,
      })

      await db
        .update(guests)
        .set({ emailSentAt: new Date().toISOString() })
        .where(eq(guests.id, guest.id))

      sent++
    } catch (e) {
      console.error(`Failed to send email to ${guest.email}:`, e)
      failed++
    }
  }

  return { sent, failed }
})
```

Key changes from the previous version:
- Added `inArray` to the drizzle imports.
- Added the `body` read + `explicitIds` parsing.
- Replaced `pendingGuests` with `targetGuests`, branched WHERE.
- Renamed the empty message to "No invitations to send" (slightly more accurate now that the empty case can be either no-uninvited or no-matching-ids).

- [ ] **Step 4: Run all tests in the file to confirm they pass**

Run: `npm test -- send-invitations`
Expected: all tests pass (2 original + 4 new = 6 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all 28 files pass, 245 tests (241 baseline + 4 new) pass.

- [ ] **Step 6: Commit**

```bash
git add server/api/events/'[id]'/send-invitations.post.ts server/api/__tests__/send-invitations.test.ts
git commit -m "feat(invitations): support guestIds for explicit resend"
```

---

## Task 2: Add i18n keys

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

Add a new `invitations` block inside the existing `guests` object in both locale files. Keep the alphabetical/grouping convention seen in the existing file: `invitations` should sit at the end of the `guests` object, right before the closing brace.

- [ ] **Step 1: Add English keys**

In `i18n/lang/en.json`, find the `"guests"` object (currently ends around line 226 with `"clearFilter": "Clear filter"`). Add a comma after the last existing key, then add the `invitations` block. The final shape inside `guests` should end like this (existing keys above unchanged, new block added at the bottom):

```json
    "filterActive": "Filter active",
    "clearFilter": "Clear filter",
    "invitations": {
      "sendButton": "Send invitations ({count})",
      "sendButtonAllInvited": "All invited",
      "sending": "Sending...",
      "confirmTitle": "Send invitations",
      "confirmBody": "Send invitations to {count} guest(s) who haven't been invited yet?",
      "confirmCta": "Send",
      "cancelCta": "Cancel",
      "resendTitle": "Resend invitation",
      "resendBody": "Resend invitation to {name} ({email})? Last sent on {date}.",
      "resendCta": "Resend",
      "resendRowLabel": "Invited {date}",
      "resendRowAction": "Resend",
      "noEmailRowLabel": "No email — can't invite",
      "successBanner": "Sent {sent} invitation(s).",
      "partialBanner": "Sent {sent} invitation(s). {failed} failed.",
      "errorBanner": "Could not send invitations. Please try again.",
      "tierBanner": "Your plan does not include email delivery.",
      "noTemplateBanner": "Select a template or upload an image before sending invitations.",
      "dismiss": "Dismiss"
    }
  },
```

- [ ] **Step 2: Add Spanish keys**

In `i18n/lang/es.json`, find the `"guests"` object's last key. Add the same `invitations` block, translated:

```json
    "invitations": {
      "sendButton": "Enviar invitaciones ({count})",
      "sendButtonAllInvited": "Todos invitados",
      "sending": "Enviando...",
      "confirmTitle": "Enviar invitaciones",
      "confirmBody": "¿Enviar invitaciones a {count} invitado(s) que aún no han sido invitados?",
      "confirmCta": "Enviar",
      "cancelCta": "Cancelar",
      "resendTitle": "Reenviar invitación",
      "resendBody": "¿Reenviar invitación a {name} ({email})? Última vez enviada el {date}.",
      "resendCta": "Reenviar",
      "resendRowLabel": "Invitado el {date}",
      "resendRowAction": "Reenviar",
      "noEmailRowLabel": "Sin email — no se puede invitar",
      "successBanner": "Se enviaron {sent} invitación(es).",
      "partialBanner": "Se enviaron {sent} invitación(es). {failed} fallaron.",
      "errorBanner": "No se pudieron enviar las invitaciones. Inténtalo de nuevo.",
      "tierBanner": "Tu plan no incluye envío de email.",
      "noTemplateBanner": "Selecciona una plantilla o sube una imagen antes de enviar invitaciones.",
      "dismiss": "Descartar"
    }
```

(Place it in the same position as in the English file — at the end of the `guests` block.)

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/lang/en.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/lang/es.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/en.json i18n/lang/es.json
git commit -m "i18n(invitations): add send/resend/banner keys"
```

---

## Task 3: Add bulk send button, confirmation modal, and result banner

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`

Add the toolbar "Send invitations" button, an inline confirmation modal, and an inline result banner. The modal is built generically so Task 4 can reuse it for per-row resend by setting state. After Task 3, the bulk path works end-to-end; Task 4 will only add per-row triggers.

The page already uses `useFetch` for `evt` (which includes `tier`), so we'll read `evt.value?.tier?.hasEmailDelivery` to decide whether to render the button. The endpoint will also reject if the tier lacks delivery — the client-side check is just to hide a non-functional button.

- [ ] **Step 1: Add reactive state and handlers in the script block**

In `pages/dashboard/events/[id]/guests.vue`, after the existing `// Filter via query params` block (the `filteredGuests` and `isFiltered` computeds, around lines 199-222), append the following code BEFORE the closing `</script>` tag (line 223):

```typescript
// Send invitations
type PendingSend =
  | { kind: 'bulk' }
  | { kind: 'resend'; guestId: number; name: string; email: string; sentAt: string | null }

const pendingSend = ref<PendingSend | null>(null)
const sendLoading = ref(false)

type SendResult =
  | { type: 'success'; sent: number; failed: number }
  | { type: 'error'; message: string }
const lastSendResult = ref<SendResult | null>(null)

const hasEmailDelivery = computed(() => evt.value?.tier?.hasEmailDelivery === true)

const unsentCount = computed(() => {
  return (guests.value ?? []).filter((g: any) => g.email && !g.emailSentAt).length
})

const confirmBodyText = computed(() => {
  const p = pendingSend.value
  if (!p) return ''
  if (p.kind === 'bulk') {
    return t('guests.invitations.confirmBody', { count: unsentCount.value })
  }
  const dateStr = p.sentAt
    ? new Date(p.sentAt).toLocaleDateString()
    : '—'
  return t('guests.invitations.resendBody', { name: p.name, email: p.email, date: dateStr })
})

const confirmTitleText = computed(() => {
  const p = pendingSend.value
  if (!p) return ''
  return p.kind === 'bulk'
    ? t('guests.invitations.confirmTitle')
    : t('guests.invitations.resendTitle')
})

const confirmCtaText = computed(() => {
  const p = pendingSend.value
  if (!p) return ''
  return p.kind === 'bulk'
    ? t('guests.invitations.confirmCta')
    : t('guests.invitations.resendCta')
})

function openBulkConfirm() {
  if (unsentCount.value === 0) return
  pendingSend.value = { kind: 'bulk' }
}

function cancelSend() {
  if (sendLoading.value) return
  pendingSend.value = null
}

async function confirmSend() {
  const p = pendingSend.value
  if (!p) return
  sendLoading.value = true
  try {
    const body = p.kind === 'resend' ? { guestIds: [p.guestId] } : {}
    const result = await $fetch<{ sent: number; failed: number }>(
      `/api/events/${eventId}/send-invitations`,
      { method: 'POST', body },
    )
    lastSendResult.value = { type: 'success', sent: result.sent, failed: result.failed }
    pendingSend.value = null
    await refreshGuests()
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode
    let message: string
    if (status === 403) {
      message = t('guests.invitations.tierBanner')
    } else if (status === 400) {
      message = t('guests.invitations.noTemplateBanner')
    } else {
      message = t('guests.invitations.errorBanner')
    }
    lastSendResult.value = { type: 'error', message }
    pendingSend.value = null
  } finally {
    sendLoading.value = false
  }
}

function dismissResult() {
  lastSendResult.value = null
}

function formatSentDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}
```

- [ ] **Step 2: Add the toolbar button**

Find the toolbar `<div class="flex gap-2">` block (around line 255-264) which currently contains the Import CSV and Add Guest buttons. Replace the entire `<div class="flex gap-2">...</div>` block with this version that adds the Send button as the first item:

```vue
      <div class="flex gap-2">
        <button v-if="hasEmailDelivery"
          type="button"
          @click="openBulkConfirm"
          :disabled="unsentCount === 0"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
          {{ unsentCount > 0
            ? t('guests.invitations.sendButton', { count: unsentCount })
            : t('guests.invitations.sendButtonAllInvited') }}
        </button>
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
          {{ t('guests.importCsv') }}
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 transition-colors">
          {{ t('guests.addGuest') }}
        </button>
      </div>
```

- [ ] **Step 3: Add the result banner**

Find the `<!-- Stepper error -->` block (around line 327-334). Insert the result banner immediately BEFORE that block (after the closing `</div>` of the CSV Import section, before `<!-- Stepper error -->`):

```vue
    <!-- Send invitations result banner -->
    <div v-if="lastSendResult" class="mb-3">
      <div v-if="lastSendResult.type === 'success' && lastSendResult.failed === 0"
        class="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <p class="text-sm text-green-700">
          {{ t('guests.invitations.successBanner', { sent: lastSendResult.sent }) }}
        </p>
        <button type="button" @click="dismissResult"
          class="text-sm text-green-700 hover:text-green-900 ml-4">
          {{ t('guests.invitations.dismiss') }}
        </button>
      </div>
      <div v-else-if="lastSendResult.type === 'success'"
        class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <p class="text-sm text-amber-800">
          {{ t('guests.invitations.partialBanner', { sent: lastSendResult.sent, failed: lastSendResult.failed }) }}
        </p>
        <button type="button" @click="dismissResult"
          class="text-sm text-amber-800 hover:text-amber-900 ml-4">
          {{ t('guests.invitations.dismiss') }}
        </button>
      </div>
      <div v-else
        class="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <p class="text-sm text-red-700">{{ lastSendResult.message }}</p>
        <button type="button" @click="dismissResult"
          class="text-sm text-red-700 hover:text-red-900 ml-4">
          {{ t('guests.invitations.dismiss') }}
        </button>
      </div>
    </div>

```

- [ ] **Step 4: Add the confirmation modal**

At the very end of the `<template>` block, just before the closing `</template>` tag (line 463), insert the modal markup. This is a fixed-position overlay that renders only when `pendingSend` is non-null:

```vue
    <!-- Send invitations confirmation modal -->
    <div v-if="pendingSend"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="cancelSend">
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 class="font-display font-semibold text-lg text-charcoal-900 mb-2">
          {{ confirmTitleText }}
        </h3>
        <p class="text-sm text-charcoal-700 mb-6">{{ confirmBodyText }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" @click="cancelSend" :disabled="sendLoading"
            class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 disabled:opacity-50 transition-colors">
            {{ t('guests.invitations.cancelCta') }}
          </button>
          <button type="button" @click="confirmSend" :disabled="sendLoading"
            class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
            {{ sendLoading ? t('guests.invitations.sending') : confirmCtaText }}
          </button>
        </div>
      </div>
    </div>
```

- [ ] **Step 5: Run the full test suite to ensure no regressions**

Run: `npm test`
Expected: all tests still pass (we haven't changed test files or APIs).

- [ ] **Step 6: Commit**

```bash
git add pages/dashboard/events/'[id]'/guests.vue
git commit -m "feat(invitations): bulk send button with modal and banner"
```

---

## Task 4: Add per-row resend in the expand panel

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`

Add a new section at the bottom of each guest's expand panel that shows the invitation status: a "Resend" action with the last-sent date for already-invited guests, or "No email — can't invite" for guests without an email. For guests with an email but no `emailSentAt`, render nothing (the toolbar button covers them).

Render this section only if `hasEmailDelivery` is true — the button needs the API to actually be available.

- [ ] **Step 1: Add the resend trigger function in the script block**

In `pages/dashboard/events/[id]/guests.vue`, find the `cancelSend` function added in Task 3. Immediately after it, add this new function:

```typescript
function openResendConfirm(g: { id: number; name: string; email: string | null; emailSentAt: string | null }) {
  if (!g.email) return
  pendingSend.value = {
    kind: 'resend',
    guestId: g.id,
    name: g.name,
    email: g.email,
    sentAt: g.emailSentAt,
  }
}
```

- [ ] **Step 2: Add the expand-panel section**

In the template, locate the expand panel content (the `<div v-if="expandedId === g.id" class="mt-3 pl-4 border-l-2 ...">` block, around line 383). The block contains the guest details and a `<div v-for="pos in g.companionsAllowed ?? 0" ...>` for companions, ending around line 421. Find the closing `</div>` of the expand panel content (the one that closes `<div v-if="expandedId === g.id"`).

Just before that closing `</div>` (after the companions `<div v-for>` block), insert the invitation status section:

```vue
                    <div v-if="hasEmailDelivery" class="pt-2 border-t border-charcoal-100">
                      <template v-if="g.email && g.emailSentAt">
                        <div class="flex items-center justify-between">
                          <span class="text-xs text-charcoal-500">
                            {{ t('guests.invitations.resendRowLabel', { date: formatSentDate(g.emailSentAt) }) }}
                          </span>
                          <button type="button" @click="openResendConfirm(g)"
                            class="text-sm text-charcoal-700 hover:text-charcoal-900 font-medium">
                            {{ t('guests.invitations.resendRowAction') }}
                          </button>
                        </div>
                      </template>
                      <template v-else-if="!g.email">
                        <span class="text-xs text-charcoal-400">
                          {{ t('guests.invitations.noEmailRowLabel') }}
                        </span>
                      </template>
                    </div>
```

- [ ] **Step 3: Run the full test suite to ensure no regressions**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/events/'[id]'/guests.vue
git commit -m "feat(invitations): per-row resend in expand panel"
```

---

## Task 5: Manual verification

**Files:** none.

The project does not have UI unit tests. Verify the complete flow with the dev server.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Nuxt starts on http://localhost:3000. (The Stripe CLI listener will fail/spam errors if `stripe login` hasn't been run — that's harmless for this task; ignore it. Or run only `npx nuxt dev` to skip the Stripe listener entirely.)

- [ ] **Step 2: Verify button states**

Sign into a dashboard with at least one paid event whose tier has `hasEmailDelivery: true` (Premium tier).
- Visit `/dashboard/events/{id}/guests`.
- If there are guests with an email and no prior send: button reads "Send invitations (N)" and is enabled.
- If every guest with an email has been sent: button reads "All invited" and is disabled.
- If the event's tier is Basic (no email delivery): button is not rendered at all.

- [ ] **Step 3: Verify bulk send happy path**

- Click "Send invitations (N)".
- Modal opens with title "Send invitations" and body "Send invitations to N guest(s) who haven't been invited yet?"
- Click Send. Button shows "Sending..." and is disabled.
- Modal closes. Green banner appears: "Sent N invitation(s)." Banner has a Dismiss button.
- The guest list refreshes; the toolbar button now reads "All invited" (disabled).

- [ ] **Step 4: Verify per-row resend**

- Expand a guest who has been invited (one with `emailSentAt` set after Step 3).
- The expand panel now shows "Invited {date}" and a "Resend" link.
- Click Resend. Modal opens with body "Resend invitation to {name} ({email})? Last sent on {date}."
- Click Resend in the modal. Banner shows "Sent 1 invitation(s)."
- Re-expand the same guest; date may have updated to today.

- [ ] **Step 5: Verify no-email guest copy**

- Add a guest without an email (or expand an existing one without an email).
- Expand panel shows "No email — can't invite". No Resend button.

- [ ] **Step 6: Verify error path (no template)**

- On a paid event with email delivery but no template selected, click Send.
- Banner shows the red error: "Select a template or upload an image before sending invitations."

- [ ] **Step 7: Verify Spanish locale**

- Switch the app to Spanish.
- Reload the guests tab.
- Verify all the new strings (button label, modal text, banner text, expand panel) appear in Spanish.

- [ ] **Step 8: Stop the dev server**

Ctrl-C in the terminal running `npm run dev`.

---

## Self-Review Notes

This section is for the plan author. Skip when implementing.

**Spec coverage check:**
- Send to all uninvited via toolbar button → Tasks 1, 3.
- Per-row explicit resend → Tasks 1, 4.
- Confirmation modal with count → Task 3 (Step 4) + Task 4 (Step 1) reusing it.
- Inline banner result (success / partial / error) → Task 3 (Step 3).
- Disabled "All invited" empty state → Task 3 (Step 2).
- Per-row no-email row label → Task 4 (Step 2).
- i18n keys → Task 2.
- Server-side test extensions → Task 1 (Step 1).
- Manual UI verification → Task 5.

**Placeholder scan:** No "TBD" / vague handlers / missing code blocks.

**Type consistency:** `PendingSend.kind` literals (`'bulk'` / `'resend'`) used consistently in Task 3 (Step 1) and Task 4 (Step 1). `SendResult.type` literals (`'success'` / `'error'`) used consistently in Task 3 (Step 1) and Step 3.

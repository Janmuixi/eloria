# Send Invitations Button — Design

**Task:** TASK-001 (`docs/TASKS.md`)
**Area:** Event Dashboard / Guests / Invitations
**Date:** 2026-05-09

## Goal

Allow an event organizer to dispatch invitation emails from the guests tab of the event dashboard, with clear feedback during and after sending, without resending to guests who have already been invited unless explicitly requested.

## Background

The backend already does most of the work:

- `POST /api/events/[id]/send-invitations` — exists, performs auth/ownership/paid/tier (`hasEmailDelivery`)/template guards, queries guests where `emailSentAt IS NULL AND email IS NOT NULL`, calls `sendInvitationEmail()` for each, updates `emailSentAt` on success, returns `{ sent, failed }`.
- `server/utils/email.ts` — Resend client + `sendInvitationEmail()`.
- Schema: `guests.emailSentAt`, `guests.emailOpenedAt`, `guests.token`.
- Tests: `server/api/__tests__/send-invitations.test.ts`.

What is missing is the UI on `pages/dashboard/events/[id]/guests.vue` to trigger this and surface the result, plus a way to resend to a single guest.

## User-facing scope

1. A primary "Send invitations (N)" button in the guests tab toolbar that sends to all guests with an email and `emailSentAt IS NULL`.
2. A confirmation modal before any send, showing how many will be sent.
3. An inline result banner above the guest list after sending.
4. Inside each guest's expand panel, a "Resend invitation" action for guests already invited, plus a clear note for guests without an email.

Out of scope for this task:
- Selecting an arbitrary subset via checkboxes.
- A modal-style result dialog listing per-guest failures.
- A toast / notification system.
- Editing email content from this surface.

## Architecture

### Frontend

Single file change: `pages/dashboard/events/[id]/guests.vue`.

**Toolbar button states** (computed from the page's existing `guests` reactive list):

- `unsentCount = guests.filter(g => g.email && !g.emailSentAt).length`
- `unsentCount > 0`, idle: enabled, label `"Send invitations (N)"`.
- `unsentCount === 0`, idle: disabled, label `"All invited"`.
- Sending: spinner inside the button, disabled.

**Confirmation modal** (one component, reused for bulk and per-row):

- Props: `open`, `title`, `body`, `confirmLabel`, `loading`.
- Emits: `confirm`, `cancel`.
- Bulk copy: title "Send invitations", body "Send invitations to N guests who haven't been invited yet?"
- Per-row copy: title "Resend invitation", body "Resend invitation to {name} ({email})? Last sent on {date}."

**Result banner**:

- One reactive ref on the page: `lastSendResult: { sent: number, failed: number, isResend: boolean } | null`.
- Renders above the guest list when non-null.
- Green styling when `failed === 0`; amber when `failed > 0`.
- Dismissible (X button → reset ref).
- Three text variants: success-only, partial (sent + failed), and error (network / 4xx / 5xx).

**Per-row controls in the expand panel** (next to the existing "Copy link"):

- Guest has `emailSentAt` set: render `Invited {relativeDate}` and a "Resend" button.
- Guest has email but no `emailSentAt`: render nothing extra (the bulk button is the path).
- Guest has no email: render small muted text "No email — can't invite".

**Data refresh**: after the API resolves (success or partial), re-fetch the guests list using the page's existing fetch/refresh mechanism so timestamps and counts update without a full reload.

### Backend

Extend the existing endpoint rather than add a new one. Same auth, tier, template, and response contract — only the WHERE clause changes.

`server/api/events/[id]/send-invitations.post.ts`:

- Read body with `readBody(event)`.
- If `Array.isArray(body?.guestIds) && body.guestIds.length > 0`:
  - Query: `WHERE eventId = :id AND id IN (:guestIds) AND email IS NOT NULL`.
  - This is the explicit-resend path; the `emailSentAt IS NULL` filter is intentionally omitted.
  - The `eventId` clause is sufficient to prevent cross-event sends — IDs from another event simply match zero rows. No extra ownership check needed beyond the existing one for the event itself.
- Otherwise keep current behavior:
  - Query: `WHERE eventId = :id AND emailSentAt IS NULL AND email IS NOT NULL`.

Both paths run the same loop: call `sendInvitationEmail()`, update `emailSentAt` on success, count `failed` on throw. Same response: `{ sent, failed }`.

### Why extend instead of add a new endpoint

Same auth flow, same tier gate, same template guard, same email send path, same response shape. A separate route would duplicate all of that to differ in one SQL clause. The body shape stays backwards compatible: existing callers (any) send no body and get the original behavior.

## Data flow

**Bulk send:**

1. Click "Send invitations (N)" → modal opens with `pendingSend = { kind: 'bulk' }`.
2. Click Confirm → `POST /api/events/{id}/send-invitations` with empty body.
3. Endpoint sends to all uninvited guests, returns `{ sent, failed }`.
4. Modal closes → banner renders → guests list refreshes → button recomputes.

**Per-row resend:**

1. Expand guest → click "Resend" → modal opens with `pendingSend = { kind: 'resend', guestId, name, email, sentAt }`.
2. Click Confirm → `POST /api/events/{id}/send-invitations` with `{ guestIds: [guestId] }`.
3. Endpoint sends to that one guest (regardless of prior `emailSentAt`), returns `{ sent, failed }`.
4. Same modal close + banner + refresh as above.

## Error handling

| Scenario                                | Surface                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| 403 (tier lacks email delivery)         | Error banner: "Your plan does not include email delivery."             |
| 400 (no template / not paid)            | Error banner with the endpoint's error message.                        |
| Per-guest send failure (counted by API) | Partial banner: "Sent {sent} invitation(s). {failed} failed."          |
| Network error / 5xx                     | Generic error banner: "Could not send invitations. Please try again."  |

We do not list which specific guests failed in v1 (matches the "inline banner" feedback choice; modal-result option was rejected).

## i18n

Add to `i18n/lang/en.json` and `i18n/lang/es.json` under `guests.invitations`:

- `sendButton` — "Send invitations ({count})" / "Enviar invitaciones ({count})"
- `sendButtonAllInvited` — "All invited" / "Todos invitados"
- `confirmTitle`, `confirmBody`, `confirmCta`, `cancelCta`
- `resendTitle`, `resendBody`, `resendCta`
- `resendRowLabel` — "Invited {date}" / "Invitado el {date}"
- `resendRowAction` — "Resend" / "Reenviar"
- `noEmailRowLabel` — "No email — can't invite" / "Sin email — no se puede invitar"
- `successBanner` — "Sent {sent} invitation(s)." / "Se enviaron {sent} invitación(es)."
- `partialBanner` — "Sent {sent} invitation(s). {failed} failed." / "Se enviaron {sent} invitación(es). {failed} fallaron."
- `errorBanner` — "Could not send invitations. Please try again." / "No se pudieron enviar las invitaciones. Inténtalo de nuevo."
- `tierBanner` — "Your plan does not include email delivery." / "Tu plan no incluye envío de email."

## Testing

**Server**, in `server/api/__tests__/send-invitations.test.ts`:

- Existing tests stay (no template → 400, no pending guests → 0 sent).
- Add: `guestIds` provided → only those guests are sent to, even if `emailSentAt` is set (resend path).
- Add: `guestIds` with an ID from a different event → that ID is ignored (eventId clause matches 0 rows).
- Add: `guestIds` with a guest that has no email → that guest is skipped.
- Add: empty body and missing body both behave as the legacy "send to all uninvited" path.

**Frontend**: project does not have component tests. Manual verification with `npm run dev` will cover:

- Toolbar button enable/disable states (with and without uninvited guests).
- Bulk send happy path → banner success.
- Bulk send when endpoint returns 403/400 → banner error.
- Per-row resend happy path → banner success and `emailSentAt` updates.
- Banner dismissal.

## Acceptance criteria mapping

| Criterion                                                                                | Met by                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Clearly labeled action button on guests tab                                              | Toolbar "Send invitations (N)" button.                                              |
| Sends to all not-yet-invited (or selected subset)                                        | Bulk button covers "all not-yet-invited"; per-row resend covers explicit subset.    |
| User feedback during and after sending (loading, success, error)                         | Button spinner + inline banner in three variants.                                   |
| Avoid resending unless explicitly requested                                              | Bulk path filters `emailSentAt IS NULL`; resend requires explicit per-row action.   |

## Open questions

None. Decisions captured in dialogue:

- Send scope: bulk button + per-row resend (no checkbox selection).
- Confirmation: modal with count before any send.
- Result feedback: inline banner.
- Empty state: button disabled with "All invited" label when nothing to send.
- Per-row resend placement: inside the expand panel, next to "Copy link".

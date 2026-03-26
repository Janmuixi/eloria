# Server Test Suite Design

**Date:** 2026-03-22
**Scope:** Server-side only (API routes + utilities)
**Approach:** Unit + integration tests with in-memory SQLite DB

## Tooling

- **Vitest** as test runner (ESM-native, fast, Nuxt-recommended)
- `vitest.config.ts` at project root with `~/` path alias
- `npm test` script in package.json
- No `@nuxt/test-utils` — server code tested directly

## Test Database Strategy

Each test file gets a fresh in-memory SQLite database (`:memory:`):

1. Creates all tables from the Drizzle schema
2. Seeds baseline data (tiers, templates) as needed
3. Returns the `db` instance for the test
4. No teardown — memory freed when the test ends

No test pollution. Sub-millisecond setup.

## Mocking Strategy

- **`~/server/db`** — redirected to test's in-memory DB instance via `vi.mock()`
- **`resend`** — mocked npm package to avoid real email sends
- **`stripe`** — mocked npm package to avoid real payment calls
- **`openai`** — mocked npm package for AI route tests
- **`puppeteer`** — mocked for PDF generation tests

## Utility Unit Tests

### `password.test.ts`
- hashPassword produces a bcrypt string
- verifyPassword matches correct password
- verifyPassword rejects wrong password

### `auth.test.ts`
- createToken / verifyToken round-trip
- Expired token rejection
- requireAuth throws 401 when unauthenticated

### `email.test.ts`
- sendVerificationEmail calls Resend with correct params
- sendInvitationEmail builds correct HTML and params
- Throws when RESEND_API_KEY is missing

## API Integration Tests

### `auth.test.ts`
- Register: success, duplicate email, weak password
- Login: success, wrong password, nonexistent user
- Me: authenticated, unauthenticated
- Email verification flow

### `events.test.ts`
- Create event with slug generation
- List only own events
- Get with ownership check
- Update fields
- Delete cascades guests

### `guests.test.ts`
- Add single guest
- Delete guest
- CSV import parsing (valid + malformed)
- Ownership validation

### `rsvp.test.ts`
- Get RSVP by token
- Submit confirmed / declined / maybe
- Plus-one handling
- Invalid token returns error

### `invitations.test.ts`
- Get by slug returns event data
- Only returns paid events
- Includes template data

### `payments.test.ts`
- Create checkout session (Stripe mocked)
- Verify payment after redirect
- Webhook signature verification

### `templates.test.ts`
- List all templates
- Filter by category

### `tiers.test.ts`
- List returns seeded tiers in sort order

### `ai.test.ts`
- Generate wording with OpenAI mocked
- Generate wording fallback (no API key)
- Recommend templates with OpenAI mocked
- Recommend templates fallback

## File Structure

```
vitest.config.ts
server/
  __helpers__/
    db.ts              — createTestDb(), seed helpers, factory functions
    mocks.ts           — mock factories for Resend, Stripe, OpenAI, Puppeteer
    event.ts           — createMockH3Event() for simulating HTTP requests
  utils/__tests__/
    password.test.ts
    auth.test.ts
    email.test.ts
  api/__tests__/
    auth.test.ts
    events.test.ts
    guests.test.ts
    rsvp.test.ts
    invitations.test.ts
    payments.test.ts
    templates.test.ts
    tiers.test.ts
    ai.test.ts
```

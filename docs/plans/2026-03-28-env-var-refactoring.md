# Environment Variable Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor all code to use the resolveEnvVar() utility instead of direct process.env access throughout the codebase.

**Architecture:** Replace process.env.XXX calls with resolveEnvVar('XXX', defaultValue) across all server code, API routes, utils, and tests. The resolveEnvVar function provides three-tier fallback: Nuxt runtimeConfig → process.env → default value. Test files will mock runtimeConfig instead of manipulating process.env.

**Tech Stack:** Nuxt 3, TypeScript, Vitest, H3, Drizzle ORM

---

## Task 1: Update resolve-env-var utility to named export

**Files:**
- Modify: `server/utils/resolve-env-var.ts`

**Step 1: Change from default to named export**

```typescript
export function resolveEnvVar(name: string, defaultValue?: string) {
  const runtimeConfig = useRuntimeConfig()
  return runtimeConfig[name] ?? process.env[name] ?? defaultValue
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/utils/resolve-env-var.ts
git commit -m "refactor: change resolveEnvVar to named export"
```

---

## Task 2: Add test for resolve-env-var utility

**Files:**
- Create: `server/utils/__tests__/resolve-env-var.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveEnvVar } from '../resolve-env-var'

describe('resolveEnvVar', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      TEST_VAR: 'from-runtime-config',
      ANOTHER_VAR: 'another-value',
    })))
  })

  it('returns value from runtimeConfig when available', () => {
    const result = resolveEnvVar('TEST_VAR')
    expect(result).toBe('from-runtime-config')
  })

  it('returns defaultValue when value not found', () => {
    const result = resolveEnvVar('MISSING_VAR', 'default-value')
    expect(result).toBe('default-value')
  })

  it('returns undefined when value not found and no default provided', () => {
    const result = resolveEnvVar('MISSING_VAR')
    expect(result).toBeUndefined()
  })
})
```

**Step 2: Run test to verify it passes**

Run: `npm run test -- server/utils/__tests__/resolve-env-var.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/utils/__tests__/resolve-env-var.test.ts
git commit -m "test: add tests for resolveEnvVar utility"
```

---

## Task 3: Refactor server/utils/email.ts

**Files:**
- Modify: `server/utils/email.ts`

**Step 1: Replace process.env with resolveEnvVar**

```typescript
import { Resend } from 'resend'
import { resolveEnvVar } from './resolve-env-var'

let resend: Resend | null = null

function getResend(): Resend {
  const apiKey = resolveEnvVar('RESEND_API_KEY')
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  if (!resend) {
    resend = new Resend(apiKey)
  }
  return resend
}

// Rest of the file remains unchanged
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/utils/email.ts
git commit -m "refactor: use resolveEnvVar in email.ts"
```

---

## Task 4: Refactor server/utils/auth.ts

**Files:**
- Modify: `server/utils/auth.ts`

**Step 1: Replace process.env with resolveEnvVar**

```typescript
import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { resolveEnvVar } from './resolve-env-var'

const JWT_SECRET = resolveEnvVar('JWT_SECRET', 'dev-secret-change-me')
const TOKEN_EXPIRY = '7d'

// Rest of the file remains unchanged
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/utils/auth.ts
git commit -m "refactor: use resolveEnvVar in auth.ts"
```

---

## Task 5: Refactor server/api/ai/generate-wording.post.ts

**Files:**
- Modify: `server/api/ai/generate-wording.post.ts`

**Step 1: Replace process.env with resolveEnvVar**

```typescript
import { requireAuth } from '~/server/utils/auth'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  const { coupleName1, coupleName2, date, venue, tone } = body

  const apiKey = resolveEnvVar('OPENAI_API_KEY')
  if (!apiKey || apiKey.startsWith('sk-...')) {
    // Fallback wording
    return {
      variations: [
        `Together with their families, ${coupleName1} and ${coupleName2} invite you to celebrate their wedding on ${date} at ${venue}.`,
        `${coupleName1} and ${coupleName2} request the pleasure of your company at their wedding celebration on ${date} at ${venue}.`,
        `Join us for a celebration of love as ${coupleName1} and ${coupleName2} unite in marriage on ${date} at ${venue}.`,
      ],
    }
  }

  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a wedding invitation copywriter. Generate 3 invitation wording variations in the specified tone. Return JSON: {"variations": ["...", "...", "..."]}',
        },
        {
          role: 'user',
          content: `Couple: ${coupleName1} & ${coupleName2}. Date: ${date}. Venue: ${venue}. Tone: ${tone || 'formal'}.`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    return JSON.parse(response.choices[0].message.content || '{"variations":[]}')
  } catch {
    return {
      variations: [
        `Together with their families, ${coupleName1} and ${coupleName2} invite you to celebrate their wedding on ${date} at ${venue}.`,
      ],
    }
  }
})
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/api/ai/generate-wording.post.ts
git commit -m "refactor: use resolveEnvVar in generate-wording.post.ts"
```

---

## Task 6: Refactor server/api/ai/recommend-templates.post.ts

**Files:**
- Modify: `server/api/ai/recommend-templates.post.ts`

**Step 1: Read the file**

Run: `cat server/api/ai/recommend-templates.post.ts`

**Step 2: Replace process.env with resolveEnvVar**

Update line 13 from:
```typescript
const apiKey = process.env.OPENAI_API_KEY
```
To:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const apiKey = resolveEnvVar('OPENAI_API_KEY')
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/api/ai/recommend-templates.post.ts
git commit -m "refactor: use resolveEnvVar in recommend-templates.post.ts"
```

---

## Task 7: Refactor server/api/auth files

**Files:**
- Modify: `server/api/auth/verify.post.ts`
- Modify: `server/api/auth/send-verification.post.ts`
- Modify: `server/api/auth/register.post.ts`
- Modify: `server/api/auth/login.post.ts`

**Step 1: Refactor verify.post.ts**

Replace line 6:
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
const JWT_SECRET = resolveEnvVar('JWT_SECRET', 'dev-secret-change-me')
```

**Step 2: Refactor send-verification.post.ts**

Replace lines 5 and 20:
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
// ...
const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
const JWT_SECRET = resolveEnvVar('JWT_SECRET', 'dev-secret-change-me')
// ...
const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
```

**Step 3: Refactor register.post.ts**

Replace line 54:
```typescript
secure: process.env.NODE_ENV === 'production',
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
secure: resolveEnvVar('NODE_ENV') === 'production',
```

**Step 4: Refactor login.post.ts**

Replace line 45:
```typescript
secure: process.env.NODE_ENV === 'production',
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
secure: resolveEnvVar('NODE_ENV') === 'production',
```

**Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/api/auth/verify.post.ts server/api/auth/send-verification.post.ts server/api/auth/register.post.ts server/api/auth/login.post.ts
git commit -m "refactor: use resolveEnvVar in auth API routes"
```

---

## Task 8: Refactor server/api/payments files

**Files:**
- Modify: `server/api/payments/webhook.post.ts`
- Modify: `server/api/payments/verify.post.ts`
- Modify: `server/api/payments/create-checkout.post.ts`

**Step 1: Refactor webhook.post.ts**

Replace lines 7-8:
```typescript
const stripeKey = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
const webhookSecret = resolveEnvVar('STRIPE_WEBHOOK_SECRET')
```

**Step 2: Refactor verify.post.ts**

Replace line 8:
```typescript
const stripeKey = process.env.STRIPE_SECRET_KEY
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
```

**Step 3: Refactor create-checkout.post.ts**

Replace lines 8, 51-52:
```typescript
const stripeKey = process.env.STRIPE_SECRET_KEY
// ...
success_url: `${process.env.BASE_URL}/dashboard/events/${eventId}/success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${process.env.BASE_URL}/dashboard/events/new?step=5&eventId=${eventId}`,
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
// ...
success_url: `${baseUrl}/dashboard/events/${eventId}/success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${baseUrl}/dashboard/events/new?step=5&eventId=${eventId}`,
```

**Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/api/payments/webhook.post.ts server/api/payments/verify.post.ts server/api/payments/create-checkout.post.ts
git commit -m "refactor: use resolveEnvVar in payments API routes"
```

---

## Task 9: Refactor server/api/events files

**Files:**
- Modify: `server/api/events/[id]/send-invitations.post.ts`
- Modify: `server/api/events/[id]/pdf.get.ts`

**Step 1: Refactor send-invitations.post.ts**

Replace lines 11 and 48:
```typescript
if (!process.env.RESEND_API_KEY) {
// ...
const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const resendApiKey = resolveEnvVar('RESEND_API_KEY')
if (!resendApiKey) {
// ...
const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
```

**Step 2: Refactor pdf.get.ts**

Replace line 28:
```typescript
const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/api/events/[id]/send-invitations.post.ts server/api/events/[id]/pdf.get.ts
git commit -m "refactor: use resolveEnvVar in events API routes"
```

---

## Task 10: Refactor server/db files

**Files:**
- Modify: `server/db/index.ts`
- Modify: `server/db/seed.ts`
- Modify: `server/db/seed-templates.ts`

**Step 1: Refactor index.ts**

Replace line 5:
```typescript
const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', '') || './db/eloria.db')
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const dbUrl = resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db')
const sqlite = new Database(dbUrl.replace('file:', '') || './db/eloria.db')
```

**Step 2: Refactor seed.ts**

Replace line 5:
```typescript
const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', '') || './db/eloria.db')
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const dbUrl = resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db')
const sqlite = new Database(dbUrl.replace('file:', '') || './db/eloria.db')
```

**Step 3: Refactor seed-templates.ts**

Replace line 6:
```typescript
const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', '') || './db/eloria.db')
```
With:
```typescript
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
// ...
const dbUrl = resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db')
const sqlite = new Database(dbUrl.replace('file:', '') || './db/eloria.db')
```

**Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/db/index.ts server/db/seed.ts server/db/seed-templates.ts
git commit -m "refactor: use resolveEnvVar in db files"
```

---

## Task 11: Refactor drizzle.config.ts

**Files:**
- Modify: `drizzle.config.ts`

**Step 1: Replace process.env with resolveEnvVar**

Replace line 8:
```typescript
url: process.env.DATABASE_URL || 'file:./db/eloria.db',
```
With:
```typescript
import { resolveEnvVar } from './server/utils/resolve-env-var'
// ...
url: resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db'),
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add drizzle.config.ts
git commit -m "refactor: use resolveEnvVar in drizzle.config.ts"
```

---

## Task 12: Refactor server/utils/__tests__/email.test.ts

**Files:**
- Modify: `server/utils/__tests__/email.test.ts`

**Step 1: Replace process.env mocking with runtimeConfig mocking**

Replace the setup/teardown with:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('sendVerificationEmail', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      RESEND_API_KEY: 're_test_key',
    })))
  })

  // Rest of the test file remains unchanged - remove process.env.RESEND_API_KEY manipulation
})
```

**Step 2: Run test to verify it passes**

Run: `npm run test -- server/utils/__tests__/email.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/utils/__tests__/email.test.ts
git commit -m "test: use runtimeConfig mocking in email.test.ts"
```

---

## Task 13: Refactor server/api/__tests__/ai.test.ts

**Files:**
- Modify: `server/api/__tests__/ai.test.ts`

**Step 1: Replace process.env mocking with runtimeConfig mocking**

Replace lines 39, 44, 46, 58, 82, 138 with:
```typescript
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
    OPENAI_API_KEY: 'sk-real-key',
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})
```

**Step 2: Run test to verify it passes**

Run: `npm run test -- server/api/__tests__/ai.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/api/__tests__/ai.test.ts
git commit -m "test: use runtimeConfig mocking in ai.test.ts"
```

---

## Task 14: Refactor server/api/__tests__/payments.test.ts

**Files:**
- Modify: `server/api/__tests__/payments.test.ts`

**Step 1: Replace process.env mocking with runtimeConfig mocking**

Replace lines 52-58, 65-67 with:
```typescript
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
    STRIPE_SECRET_KEY: 'sk_test_real_key',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    BASE_URL: 'http://localhost:3000',
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})
```

**Step 2: Run test to verify it passes**

Run: `npm run test -- server/api/__tests__/payments.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/api/__tests__/payments.test.ts
git commit -m "test: use runtimeConfig mocking in payments.test.ts"
```

---

## Task 15: Refactor server/api/__tests__/auth.test.ts

**Files:**
- Modify: `server/api/__tests__/auth.test.ts`

**Step 1: Replace process.env usage with runtimeConfig mocking**

Replace lines 202, 231:
```typescript
const JWT_SECRET = resolveEnvVar('JWT_SECRET', 'dev-secret-change-me')
```

Add beforeEach to mock runtimeConfig:
```typescript
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
    JWT_SECRET: 'test-secret',
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})
```

**Step 2: Run test to verify it passes**

Run: `npm run test -- server/api/__tests__/auth.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/api/__tests__/auth.test.ts
git commit -m "test: use runtimeConfig mocking in auth.test.ts"
```

---

## Task 16: Run full test suite

**Files:**
- No files to modify

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests PASS

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run linter if configured**

Run: `npm run lint` (if exists in package.json)
Expected: No errors

**Step 4: Commit final verification**

```bash
git commit -m "test: verify all tests pass after env var refactoring"
```

---

## Task 17: Clean up documentation

**Files:**
- No files to modify

**Step 1: Check for any remaining process.env usage**

Run: `rg 'process\.env' --type ts --type js`
Expected: Only results in nuxt.config.ts (which should keep using process.env)

**Step 2: Update any relevant documentation**

Check if README or other docs mention process.env usage patterns that need updating.

**Step 3: Final commit if any changes**

```bash
git add .
git commit -m "docs: update documentation for env var refactoring"
```

---

## Summary

This plan refactors the entire codebase to use the resolveEnvVar() utility consistently, improving:
- **Consistency**: All env var access goes through a single utility
- **Testability**: Tests mock runtimeConfig instead of mutating process.env
- **Flexibility**: Three-tier fallback provides better configuration options
- **Maintainability**: Centralized env var access makes future changes easier

The refactoring maintains all existing error handling patterns and default values, ensuring no breaking changes to functionality.

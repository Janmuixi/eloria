# Environment Variable Refactoring Design

**Date:** 2026-03-28
**Status:** Approved

## Overview

Refactor the codebase to consistently use the `resolveEnvVar()` utility instead of direct `process.env` access throughout all server code, API routes, utils, and tests.

## Architecture

The refactoring uses a single pattern: replace all `process.env` calls with `resolveEnvVar()` from the existing utility. The function provides a three-tier fallback:

1. Nuxt runtime config → `runtimeConfig[name]`
2. Process environment → `process.env[name]`
3. Default value → provided `defaultValue` parameter

All API routes, utils, and server code will import and use this function. The `nuxt.config.ts` will continue using `process.env` directly since it defines the runtime config structure itself.

## Data Flow

Environment variables follow this flow:

1. `nuxt.config.ts` reads from `process.env` and populates `runtimeConfig`
2. At runtime, `resolveEnvVar('KEY', default)` accesses `runtimeConfig.KEY` first
3. If missing, falls back to `process.env.KEY`, then the provided default
4. All imports and usages happen synchronously - no async concerns

Test files will mock `runtimeConfig` directly instead of manipulating `process.env`, allowing tests to control values without side effects.

## Error Handling

Current code has inconsistent error handling for missing environment variables:
- Some throw errors (e.g., `RESEND_API_KEY` in email.ts)
- Some use defaults (e.g., `JWT_SECRET` with 'dev-secret-change-me')
- Some check for placeholder values (e.g., `OPENAI_API_KEY.startsWith('sk-...')`)

**Design decision:** Maintain the current error handling patterns but use `resolveEnvVar()` consistently. For variables that throw on missing, call `resolveEnvVar('KEY')` and manually throw if undefined. For those with defaults, use `resolveEnvVar('KEY', defaultValue)`.

The `resolveEnvVar` function itself returns undefined if no match is found (no default provided), allowing callers to handle errors appropriately.

## Testing

Test files currently manipulate `process.env` directly:

```typescript
const savedEnv = { ...process.env }
process.env.OPENAI_API_KEY = 'sk-test'
// ... test code
process.env = savedEnv
```

**New approach:** Mock Nuxt's `runtimeConfig` using Vitest's vi.spyOn or vi.stubGlobal:

```typescript
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
  OPENAI_API_KEY: 'sk-test',
  // ... other env vars
})))
```

For test files that import `resolveEnvVar`, they'll automatically get the mocked runtime config values. This provides cleaner isolation and matches how the production code actually accesses env vars.

## Implementation Approach

1. **Update resolve-env-var export** - Change from default export to named export for consistency
2. **Refactor server code** - Replace `process.env` in API routes and utils with `resolveEnvVar()`
3. **Update config files** - Update `drizzle.config.ts` and similar to use `resolveEnvVar` (keep `nuxt.config.ts` as-is)
4. **Refactor tests** - Change from manipulating `process.env` to mocking `runtimeConfig`
5. **Add test for resolve-env-var** - Ensure the utility function itself has test coverage
6. **Run full test suite** - Verify all tests pass with `npm run test`

**Files to update:** ~15 code files, ~8 test files. The refactoring is mechanical and consistent across all files.

## Environment Variables in Scope

- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `JWT_SECRET`
- `BASE_URL`
- `DATABASE_URL`
- `NODE_ENV`

## Success Criteria

- All `process.env` usages (except `nuxt.config.ts`) replaced with `resolveEnvVar()`
- All tests pass after refactoring
- Test isolation improved (no direct `process.env` manipulation)
- Consistent pattern across all code files

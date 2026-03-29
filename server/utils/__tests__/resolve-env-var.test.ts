import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveEnvVar } from '../resolve-env-var'

describe('resolveEnvVar', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({}))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns value from process.env when available', () => {
    process.env.ENV_VAR = 'from-process-env'
    const result = resolveEnvVar('ENV_VAR')
    expect(result).toBe('from-process-env')
    delete process.env.ENV_VAR
  })

  it('returns value from runtimeConfig when available', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ RUNTIME_VAR: 'from-runtime-config' }))
    const result = resolveEnvVar('RUNTIME_VAR')
    expect(result).toBe('from-runtime-config')
  })

  it('prefers runtimeConfig over process.env', () => {
    process.env.CONFLICT_VAR = 'from-process-env'
    vi.stubGlobal('useRuntimeConfig', () => ({ CONFLICT_VAR: 'from-runtime-config' }))
    const result = resolveEnvVar('CONFLICT_VAR')
    expect(result).toBe('from-runtime-config')
    delete process.env.CONFLICT_VAR
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

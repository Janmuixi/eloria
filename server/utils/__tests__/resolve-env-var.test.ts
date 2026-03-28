import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveEnvVar } from '../resolve-env-var'

describe('resolveEnvVar', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      TEST_VAR: 'from-runtime-config',
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('returns value from process.env when not in runtimeConfig', () => {
    process.env.ENV_VAR = 'from-process-env'
    const result = resolveEnvVar('ENV_VAR')
    expect(result).toBe('from-process-env')
    delete process.env.ENV_VAR
  })

  it('prioritizes runtimeConfig over process.env when both have the same variable', () => {
    process.env.TEST_VAR = 'from-process-env'
    const result = resolveEnvVar('TEST_VAR')
    expect(result).toBe('from-runtime-config')
    delete process.env.TEST_VAR
  })
})

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

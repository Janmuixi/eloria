import { describe, it, expect } from 'vitest'
import { resolveEnvVar } from '../resolve-env-var'

describe('resolveEnvVar', () => {
  it('returns value from process.env when available', () => {
    process.env.ENV_VAR = 'from-process-env'
    const result = resolveEnvVar('ENV_VAR')
    expect(result).toBe('from-process-env')
    delete process.env.ENV_VAR
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

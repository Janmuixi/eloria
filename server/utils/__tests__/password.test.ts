import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('password utils', () => {
  it('hashPassword returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mysecret')

    expect(typeof hash).toBe('string')
    // bcrypt hashes start with $2a$ or $2b$
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('correctpassword')
    const result = await verifyPassword('correctpassword', hash)

    expect(result).toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('correctpassword')
    const result = await verifyPassword('wrongpassword', hash)

    expect(result).toBe(false)
  })
})

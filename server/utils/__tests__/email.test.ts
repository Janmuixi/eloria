import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const originalEnv = process.env

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function (this: any) {
    this.emails = { send: vi.fn().mockResolvedValue({ id: 'mock-id' }) }
  }),
}))

describe('email utils', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.RESEND_API_KEY = 're_test_key'
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('sendVerificationEmail calls Resend with correct params', async () => {
    const { sendVerificationEmail } = await import('../email')

    await sendVerificationEmail({
      to: 'user@example.com',
      userName: 'Alice',
      verificationUrl: 'https://example.com/verify?token=abc',
    })

    const resend = await import('resend')
    const mockResend = resend.Resend as any
    expect(mockResend).toHaveBeenCalled()
    expect(mockResend.mock.calls[0][0]).toBe('re_test_key')
  })

  it('sendInvitationEmail calls Resend with correct params', async () => {
    const { sendInvitationEmail } = await import('../email')

    await sendInvitationEmail({
      to: 'guest@example.com',
      guestName: 'Bob',
      coupleName1: 'Alice',
      coupleName2: 'Charlie',
      date: '2026-06-15',
      invitationUrl: 'https://example.com/invite?token=xyz',
    })

    const resend = await import('resend')
    const mockResend = resend.Resend as any
    expect(mockResend).toHaveBeenCalled()
    expect(mockResend.mock.calls[0][0]).toBe('re_test_key')
  })

  it('throws when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY
    vi.resetModules()

    const { sendVerificationEmail } = await import('../email')

    await expect(
      sendVerificationEmail({
        to: 'user@example.com',
        userName: 'Alice',
        verificationUrl: 'https://example.com/verify',
      })
    ).rejects.toThrow('RESEND_API_KEY is not configured')
  })
})

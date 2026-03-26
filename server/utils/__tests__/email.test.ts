import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSend = vi.fn().mockResolvedValue({ id: 'mock-id' })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function (this: any) {
    this.emails = { send: mockSend }
  }),
}))

describe('email utils', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSend.mockClear()
    process.env.RESEND_API_KEY = 're_test_key'
  })

  it('sendVerificationEmail calls Resend with correct params', async () => {
    const { sendVerificationEmail } = await import('../email')

    await sendVerificationEmail({
      to: 'user@example.com',
      userName: 'Alice',
      verificationUrl: 'https://example.com/verify?token=abc',
    })

    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe('Eloria <noreply@muixisoftware.tech>')
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toBe('Verify your email - Eloria')
    expect(call.html).toContain('Alice')
    expect(call.html).toContain('https://example.com/verify?token=abc')
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

    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe('Eloria <invitations@muixisoftware.tech>')
    expect(call.to).toBe('guest@example.com')
    expect(call.subject).toContain('Alice')
    expect(call.subject).toContain('Charlie')
    expect(call.html).toContain('Bob')
    expect(call.html).toContain('https://example.com/invite?token=xyz')
  })

  it('throws when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY

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

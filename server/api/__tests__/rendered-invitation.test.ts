import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  seedTiers,
  seedTemplate,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const handler = (await import('../invitations/[slug]/rendered.html.get')).default

describe('Rendered invitation HTML endpoint', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  it('returns substituted HTML for a paid event with a template', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'r@test.com', name: 'R' })
    const template = seedTemplate(testDb, 2)
    createTestEvent(testDb, user!.id, {
      slug: 'render-ok',
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })

    const event = createMockEvent({ params: { slug: 'render-ok' } })
    const result = await handler(event)

    expect(typeof result).toBe('string')
    // seedTemplate uses "<div>{{coupleName1}} & {{coupleName2}}</div>" as html
    expect(result).toContain('Alice & Bob')
    expect(result).toContain('noindex, nofollow')
    expect(result).toMatch(/invitation-height/)
  })

  it('returns 404 for an unpaid event', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'np@test.com', name: 'NP' })
    const template = seedTemplate(testDb, 2)
    createTestEvent(testDb, user!.id, {
      slug: 'unpaid',
      paymentStatus: 'pending',
      templateId: template!.id,
    })

    const event = createMockEvent({ params: { slug: 'unpaid' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 404 for an unknown slug', async () => {
    const event = createMockEvent({ params: { slug: 'missing' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 500 for a paid event with no template', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'nt@test.com', name: 'NT' })
    createTestEvent(testDb, user!.id, {
      slug: 'paid-no-template',
      paymentStatus: 'paid',
      templateId: null,
    })

    const event = createMockEvent({ params: { slug: 'paid-no-template' } })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
  })

  it('sets Content-Type to text/html', async () => {
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'ct@test.com', name: 'CT' })
    const template = seedTemplate(testDb, 2)
    createTestEvent(testDb, user!.id, {
      slug: 'ct-test',
      paymentStatus: 'paid',
      templateId: template!.id,
    })

    const event = createMockEvent({ params: { slug: 'ct-test' } })
    await handler(event)

    // h3's setHeader writes to the underlying ServerResponse
    const contentType = event.node.res.getHeader('content-type')
    expect(contentType).toMatch(/text\/html/)
  })
})

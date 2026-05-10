import { describe, it, expect } from 'vitest'
import { formatDate, toEventDate, dateFormatOptions } from '../date-format'

describe('dateFormatOptions', () => {
  it('exposes short, long, and datetime named formats', () => {
    expect(Object.keys(dateFormatOptions).sort()).toEqual(['datetime', 'long', 'short'])
  })
})

describe('toEventDate', () => {
  it('pins YYYY-MM-DD to local noon so the calendar day survives all TZs', () => {
    const d = toEventDate('2026-05-10')
    expect(d.getHours()).toBe(12)
    expect(d.getDate()).toBe(10)
    expect(d.getMonth()).toBe(4)
    expect(d.getFullYear()).toBe(2026)
  })
})

describe('formatDate', () => {
  const d = toEventDate('2026-05-10')

  it('formats short dates in English (en)', () => {
    expect(formatDate(d, 'en', 'short')).toMatch(/^5\/10\/2026$/)
  })

  it('formats short dates in Spanish (es)', () => {
    expect(formatDate(d, 'es', 'short')).toMatch(/^10\/5\/2026$/)
  })

  it('formats long dates in English (en)', () => {
    expect(formatDate(d, 'en', 'long')).toMatch(/Sunday,\s*May\s*10,\s*2026/)
  })

  it('formats long dates in Spanish (es)', () => {
    expect(formatDate(d, 'es', 'long')).toMatch(/domingo/)
    expect(formatDate(d, 'es', 'long')).toMatch(/mayo/)
    expect(formatDate(d, 'es', 'long')).toMatch(/2026/)
  })

  it('formats datetime values with both date and time parts', () => {
    const dt = new Date('2026-05-10T15:30:00')
    const enOut = formatDate(dt, 'en', 'datetime')
    expect(enOut).toMatch(/2026/)
    expect(enOut).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns the original input when given an unparsable string', () => {
    expect(formatDate('not-a-date', 'en', 'short')).toBe('not-a-date')
  })

  it('defaults to short format when no name is provided', () => {
    expect(formatDate(d, 'en')).toBe(formatDate(d, 'en', 'short'))
  })
})

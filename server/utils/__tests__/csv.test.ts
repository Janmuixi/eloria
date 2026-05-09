import { describe, it, expect } from 'vitest'
import { csvEscape, csvSlugify } from '../csv'

describe('csvEscape', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape('')).toBe('')
  })

  it('passes simple strings through unquoted', () => {
    expect(csvEscape('Alice')).toBe('Alice')
    expect(csvEscape('alice@example.com')).toBe('alice@example.com')
  })

  it('quotes fields containing a comma', () => {
    expect(csvEscape('Doe, Jr.')).toBe('"Doe, Jr."')
  })

  it('quotes and doubles internal quotes', () => {
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""')
  })

  it('quotes fields containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('coerces non-string values to strings', () => {
    expect(csvEscape(42)).toBe('42')
    expect(csvEscape(true)).toBe('true')
  })
})

describe('csvSlugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(csvSlugify('Plat principal')).toBe('plat_principal')
  })

  it('strips diacritics', () => {
    expect(csvSlugify('Entrée')).toBe('entree')
    expect(csvSlugify('Café')).toBe('cafe')
  })

  it('collapses runs of non-alphanumerics into a single underscore', () => {
    expect(csvSlugify('Dessert (kid)')).toBe('dessert_kid')
    expect(csvSlugify('A -- B')).toBe('a_b')
  })

  it('trims leading and trailing underscores', () => {
    expect(csvSlugify('  hello world  ')).toBe('hello_world')
    expect(csvSlugify('--abc--')).toBe('abc')
  })

  it('returns empty string for input with no alphanumerics', () => {
    expect(csvSlugify('???')).toBe('')
    expect(csvSlugify('')).toBe('')
  })
})

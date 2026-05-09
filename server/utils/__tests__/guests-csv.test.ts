import { describe, it, expect } from 'vitest'
import { buildGuestsCsv, type CsvCourse } from '../guests-csv'
import type { LoadedGuest } from '../event-guests'
import type { AllergenKey } from '~/shared/menu'

const NO_COURSES: CsvCourse[] = []

function guest(overrides: Partial<LoadedGuest> = {}): LoadedGuest {
  return {
    id: 1,
    eventId: 1,
    name: 'Alice',
    email: 'alice@example.com',
    phone: null,
    rsvpStatus: 'pending',
    companionsAllowed: 0,
    token: 'tok',
    emailSentAt: null,
    emailOpenedAt: null,
    createdAt: null,
    menuChoices: {},
    allergies: null,
    companions: [],
    ...overrides,
  }
}

describe('buildGuestsCsv', () => {
  it('emits BOM + header row only when guest list is empty', () => {
    const csv = buildGuestsCsv([], NO_COURSES)
    expect(csv.startsWith('﻿')).toBe(true)
    const body = csv.slice(1)
    expect(body).toBe(
      'group_id,role,companion_position,name,email,phone,rsvp_status,companions_allowed,allergies,invited_at\r\n'
    )
  })

  it('uses CRLF line endings', () => {
    const csv = buildGuestsCsv([guest()], NO_COURSES)
    const lines = csv.slice(1).split('\r\n')
    // header + 1 data row + trailing empty from final CRLF = 3
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('')
  })

  it('renders one primary row per guest with no companions', () => {
    const g = guest({ id: 7, name: 'Alice', email: 'a@x.com', phone: '555', rsvpStatus: 'confirmed', emailSentAt: '2026-05-01T10:00:00Z' })
    const csv = buildGuestsCsv([g], NO_COURSES)
    const rows = csv.slice(1).trim().split('\r\n')
    expect(rows[1]).toBe('7,primary,,Alice,a@x.com,555,confirmed,0,,2026-05-01T10:00:00Z')
  })

  it('only emits companion rows for attending companions', () => {
    const g = guest({
      id: 3,
      name: 'Host',
      companionsAllowed: 2,
      rsvpStatus: 'confirmed',
      companions: [
        { id: 11, position: 1, name: 'Plus One', attending: true, menuChoices: {}, allergies: null },
        { id: 12, position: 2, name: null, attending: false, menuChoices: {}, allergies: null },
      ],
    })
    const rows = buildGuestsCsv([g], NO_COURSES).slice(1).trim().split('\r\n')
    // header + primary + 1 companion = 3 rows
    expect(rows).toHaveLength(3)
    expect(rows[1].startsWith('3,primary,')).toBe(true)
    expect(rows[2]).toBe('3,companion,1,Plus One,,,attending,,,')
  })

  it('emits menu_<slug> columns in course sortOrder, mapping option ids to names', () => {
    const courses: CsvCourse[] = [
      { id: 100, name: 'Starter', sortOrder: 0, options: [{ id: 1001, name: 'Soup' }, { id: 1002, name: 'Salad' }] },
      { id: 200, name: 'Plat principal', sortOrder: 1, options: [{ id: 2001, name: 'Beef' }] },
    ]
    const g = guest({
      id: 5,
      name: 'Alice',
      rsvpStatus: 'confirmed',
      companionsAllowed: 1,
      menuChoices: { 100: 1001, 200: 2001 },
      companions: [
        { id: 21, position: 1, name: 'Bob', attending: true, menuChoices: { 100: 1002 }, allergies: null },
      ],
    })
    const csv = buildGuestsCsv([g], courses)
    const rows = csv.slice(1).trim().split('\r\n')
    expect(rows[0]).toBe(
      'group_id,role,companion_position,name,email,phone,rsvp_status,companions_allowed,allergies,invited_at,menu_starter,menu_plat_principal'
    )
    expect(rows[1].endsWith(',Soup,Beef')).toBe(true)
    expect(rows[2].endsWith(',Salad,')).toBe(true) // companion has no main course pick
  })

  it('formats allergies as "keys, "other"" with raw key names', () => {
    const g = guest({
      id: 1,
      allergies: { keys: ['gluten', 'dairy'] as AllergenKey[], other: 'shellfish bisque' },
    })
    const rows = buildGuestsCsv([g], NO_COURSES).slice(1).trim().split('\r\n')
    // The allergies field contains commas and quotes, so the cell is wrapped in quotes
    // and inner quotes are doubled.
    expect(rows[1]).toContain('"gluten, dairy, ""shellfish bisque"""')
  })

  it('quotes fields containing commas, quotes, and newlines', () => {
    const g = guest({ id: 9, name: 'O\'Hara, Jr.', phone: 'line1\nline2', email: 'a"b@x.com' })
    const rows = buildGuestsCsv([g], NO_COURSES).slice(1).trim().split('\r\n')
    expect(rows[1]).toContain(',"O\'Hara, Jr.",')
    expect(rows[1]).toContain(',"a""b@x.com",')
    expect(rows[1]).toContain(',"line1\nline2",')
  })

  it('avoids collisions between natural slugs and synthetic suffixes', () => {
    const courses: CsvCourse[] = [
      { id: 1, name: 'Dessert', sortOrder: 0, options: [] },
      { id: 2, name: 'Dessert 2', sortOrder: 1, options: [] },
      { id: 3, name: 'Dessert', sortOrder: 2, options: [] },
    ]
    const csv = buildGuestsCsv([], courses)
    const header = csv.split('\r\n')[0]
    expect(header).toContain('menu_dessert,menu_dessert_2,menu_dessert_3')
  })

  it('disambiguates duplicate slugified course names', () => {
    const courses: CsvCourse[] = [
      { id: 1, name: 'Dessert', sortOrder: 0, options: [] },
      { id: 2, name: 'Dessert', sortOrder: 1, options: [] },
    ]
    const csv = buildGuestsCsv([], courses)
    expect(csv.split('\r\n')[0]).toContain('menu_dessert,menu_dessert_2')
  })
})

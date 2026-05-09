import { csvEscape, csvSlugify } from './csv'
import type { LoadedGuest } from './event-guests'
import type { Allergies } from '~/shared/menu'

export type CsvCourse = {
  id: number
  name: string
  sortOrder: number
  options: Array<{ id: number; name: string }>
}

const FIXED_HEADERS = [
  'group_id',
  'role',
  'companion_position',
  'name',
  'email',
  'phone',
  'rsvp_status',
  'companions_allowed',
  'allergies',
  'invited_at',
] as const

const BOM = '﻿'
const CRLF = '\r\n'

function formatAllergies(a: Allergies | null): string {
  if (!a) return ''
  const parts: string[] = [...a.keys]
  if (a.other) parts.push(`"${a.other}"`)
  return parts.join(', ')
}

function buildMenuHeaders(courses: CsvCourse[]): { headers: string[]; courseIds: number[] } {
  const sorted = [...courses].sort((a, b) => a.sortOrder - b.sortOrder)
  const used = new Set<string>()
  const headers: string[] = []
  const courseIds: number[] = []
  for (const c of sorted) {
    const base = `menu_${csvSlugify(c.name) || 'course'}`
    let candidate = base
    let n = 2
    while (used.has(candidate)) {
      candidate = `${base}_${n++}`
    }
    used.add(candidate)
    headers.push(candidate)
    courseIds.push(c.id)
  }
  return { headers, courseIds }
}

export function buildGuestsCsv(guests: LoadedGuest[], courses: CsvCourse[]): string {
  const optionNameById = new Map<number, string>()
  for (const c of courses) {
    for (const o of c.options) optionNameById.set(o.id, o.name)
  }

  const { headers: menuHeaders, courseIds } = buildMenuHeaders(courses)

  const headerRow = [...FIXED_HEADERS, ...menuHeaders].map(csvEscape).join(',')
  const lines: string[] = [headerRow]

  for (const g of guests) {
    // primary row
    const primary: string[] = [
      String(g.id),
      'primary',
      '',
      csvEscape(g.name),
      csvEscape(g.email),
      csvEscape(g.phone),
      csvEscape(g.rsvpStatus),
      String(g.companionsAllowed),
      csvEscape(formatAllergies(g.allergies)),
      csvEscape(g.emailSentAt),
    ]
    for (const cid of courseIds) {
      const optId = g.menuChoices[cid]
      primary.push(csvEscape(optId != null ? optionNameById.get(optId) ?? '' : ''))
    }
    lines.push(primary.join(','))

    // companion rows (only attending)
    for (const c of g.companions) {
      if (!c.attending) continue
      const row: string[] = [
        String(g.id),
        'companion',
        String(c.position),
        csvEscape(c.name),
        '',
        '',
        'attending',
        '',
        csvEscape(formatAllergies(c.allergies)),
        '',
      ]
      for (const cid of courseIds) {
        const optId = c.menuChoices[cid]
        row.push(csvEscape(optId != null ? optionNameById.get(optId) ?? '' : ''))
      }
      lines.push(row.join(','))
    }
  }

  return BOM + lines.join(CRLF) + CRLF
}

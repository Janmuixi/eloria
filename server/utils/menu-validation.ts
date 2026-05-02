// server/utils/menu-validation.ts
import { ALLERGEN_KEYS, ALLERGY_OTHER_MAX_LENGTH, type AllergenKey, type Allergies, type MenuTreeInput } from '~/shared/menu'

export function validateMenuTree(input: unknown): MenuTreeInput {
  if (!input || typeof input !== 'object' || !Array.isArray((input as any).courses)) {
    throw createError({ statusCode: 400, statusMessage: 'menu.courses must be an array' })
  }
  const courses = (input as any).courses
  if (courses.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'menu must have at least one course' })
  }
  for (const c of courses) {
    if (!c || typeof c.name !== 'string' || c.name.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'every course needs a non-empty name' })
    }
    if (!Array.isArray(c.options) || c.options.length === 0) {
      throw createError({ statusCode: 400, statusMessage: `course "${c.name}" must have at least one option` })
    }
    for (const o of c.options) {
      if (!o || typeof o.name !== 'string' || o.name.trim().length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'every option needs a non-empty name' })
      }
    }
  }
  const seenCourseIds = new Set<number>()
  for (const c of courses) {
    if (typeof c.id === 'number') {
      if (seenCourseIds.has(c.id)) {
        throw createError({ statusCode: 400, statusMessage: 'duplicate course id in menu' })
      }
      seenCourseIds.add(c.id)
    }
    const seenOptionIds = new Set<number>()
    for (const o of c.options) {
      if (typeof o.id === 'number') {
        if (seenOptionIds.has(o.id)) {
          throw createError({ statusCode: 400, statusMessage: 'duplicate option id in course' })
        }
        seenOptionIds.add(o.id)
      }
    }
  }
  return input as MenuTreeInput
}

export function validateAllergies(input: unknown): Allergies | null {
  if (input == null) return null
  if (typeof input !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'allergies must be an object' })
  }
  const keysRaw = (input as any).keys
  const otherRaw = (input as any).other
  const keys: AllergenKey[] = []
  if (Array.isArray(keysRaw)) {
    for (const k of keysRaw) {
      if (!ALLERGEN_KEYS.includes(k)) {
        throw createError({ statusCode: 400, statusMessage: `unknown allergen key: ${k}` })
      }
      if (!keys.includes(k)) keys.push(k)
    }
  }
  let other = ''
  if (typeof otherRaw === 'string') {
    other = otherRaw.trim().slice(0, ALLERGY_OTHER_MAX_LENGTH)
  }
  if (keys.length === 0 && other === '') return null
  return { keys, other }
}

export function serializeAllergies(a: Allergies | null): string | null {
  return a ? JSON.stringify(a) : null
}

export function parseAllergies(stored: string | null | undefined): Allergies | null {
  if (!stored) return null
  try {
    const obj = JSON.parse(stored)
    return validateAllergies(obj)
  } catch {
    return null
  }
}

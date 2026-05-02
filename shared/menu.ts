// shared/menu.ts

export const ALLERGEN_KEYS = [
  'nuts',
  'gluten',
  'dairy',
  'shellfish',
  'eggs',
  'vegetarian',
  'vegan',
] as const

export type AllergenKey = typeof ALLERGEN_KEYS[number]

export const ALLERGY_OTHER_MAX_LENGTH = 200

export interface Allergies {
  keys: AllergenKey[]
  other: string
}

export interface MenuOption {
  id: number
  name: string
  sortOrder: number
}

export interface MenuCourse {
  id: number
  name: string
  sortOrder: number
  options: MenuOption[]
}

export interface MenuTree {
  courses: MenuCourse[]
}

// Used by the PUT endpoint and wizard payload — incoming items may not have ids yet.
export interface MenuOptionInput {
  id?: number
  name: string
  sortOrder: number
}

export interface MenuCourseInput {
  id?: number
  name: string
  sortOrder: number
  options: MenuOptionInput[]
}

export interface MenuTreeInput {
  courses: MenuCourseInput[]
}

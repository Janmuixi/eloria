import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'

export type TemplateMeta = {
  name: string
  category: string
  colorScheme: { primary: string; secondary: string; background: string; text: string; accent: string }
  fontPairings: { heading: string; body: string }
  tags: string[]
  minimumTier: string
}

export type TemplateInsertRow = {
  slug: string
  name: string
  category: string
  previewImageUrl: string
  htmlTemplate: string
  cssTemplate: string
  colorScheme: string
  fontPairings: string
  tags: string
  minimumTierId: number
}

const REQUIRED_META_FIELDS: (keyof TemplateMeta)[] = [
  'name', 'category', 'colorScheme', 'fontPairings', 'tags', 'minimumTier',
]

export function loadTemplatesFromDisk(
  templatesDir: string,
  tierSlugToId: Map<string, number>,
): TemplateInsertRow[] {
  const entries = readdirSync(templatesDir)
    .filter(entry => {
      const full = join(templatesDir, entry)
      return statSync(full).isDirectory()
    })
    .sort()

  return entries.map(slug => loadOne(templatesDir, slug, tierSlugToId))
}

function loadOne(templatesDir: string, slug: string, tierSlugToId: Map<string, number>): TemplateInsertRow {
  const folder = join(templatesDir, slug)
  const htmlPath = join(folder, 'template.html')
  const metaPath = join(folder, 'meta.json')

  if (!existsSync(htmlPath)) {
    throw new Error(`Template "${slug}" is missing template.html at ${htmlPath}`)
  }
  if (!existsSync(metaPath)) {
    throw new Error(`Template "${slug}" is missing meta.json at ${metaPath}`)
  }

  let meta: TemplateMeta
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch (err) {
    throw new Error(`Template "${slug}" has invalid meta.json: ${(err as Error).message}`)
  }

  for (const field of REQUIRED_META_FIELDS) {
    if (meta[field] === undefined || meta[field] === null) {
      throw new Error(`Template "${slug}" meta.json is missing required field "${field}"`)
    }
  }

  const tierId = tierSlugToId.get(meta.minimumTier)
  if (tierId === undefined) {
    throw new Error(`Template "${slug}" references unknown minimumTier "${meta.minimumTier}"`)
  }

  const html = readFileSync(htmlPath, 'utf-8')

  return {
    slug,
    name: meta.name,
    category: meta.category,
    previewImageUrl: `/images/templates/${slug}.jpg`,
    htmlTemplate: html,
    cssTemplate: '',
    colorScheme: JSON.stringify(meta.colorScheme),
    fontPairings: JSON.stringify(meta.fontPairings),
    tags: JSON.stringify(meta.tags),
    minimumTierId: tierId,
  }
}

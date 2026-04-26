import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer'
import { substituteTemplate, type TemplateData } from '../utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const IMAGES_DIR = 'public/images/templates'
const LOCALES = ['en', 'es'] as const
const LOCALE_FILE = (locale: string) => `i18n/lang/${locale}.json`
const VIEWPORT = { width: 800, height: 1200 }

const REQUIRED_SAMPLE_FIELDS: (keyof TemplateData)[] = [
  'coupleName1', 'coupleName2', 'date', 'venue', 'venueAddress', 'wording',
]

function loadLocaleData(locale: string): { translations: Record<string, unknown>; sampleData: TemplateData } {
  const path = LOCALE_FILE(locale)
  if (!existsSync(path)) {
    throw new Error(`[screenshots] locale file missing: ${path}`)
  }
  const translations = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
  const templates = translations.templates as Record<string, unknown> | undefined
  const sample = templates?.sampleData as Partial<TemplateData> | undefined
  if (!sample) {
    throw new Error(`[screenshots] ${path} is missing templates.sampleData`)
  }
  for (const field of REQUIRED_SAMPLE_FIELDS) {
    if (typeof sample[field] !== 'string' || sample[field] === '') {
      throw new Error(`[screenshots] ${path} templates.sampleData.${field} is missing or not a non-empty string`)
    }
  }
  return { translations, sampleData: sample as TemplateData }
}

async function main() {
  const slugs = readdirSync(TEMPLATES_DIR)
    .filter(entry => statSync(join(TEMPLATES_DIR, entry)).isDirectory())
    .sort()

  type Job = { locale: string; slug: string; outPath: string; translations: Record<string, unknown>; sampleData: TemplateData }
  const jobs: Job[] = []
  let skipped = 0

  for (const locale of LOCALES) {
    const localeDir = join(IMAGES_DIR, locale)
    if (!existsSync(localeDir)) {
      mkdirSync(localeDir, { recursive: true })
    }
    const { translations, sampleData } = loadLocaleData(locale)
    for (const slug of slugs) {
      const outPath = join(localeDir, `${slug}.jpg`)
      if (existsSync(outPath)) {
        console.log(`[screenshots] skipped ${locale}/${slug} (image exists)`)
        skipped++
        continue
      }
      jobs.push({ locale, slug, outPath, translations, sampleData })
    }
  }

  if (jobs.length === 0) {
    console.log('[screenshots] nothing to do.')
    return
  }

  console.log(`[screenshots] generating ${jobs.length} image(s)...`)
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  try {
    for (const job of jobs) {
      const html = readFileSync(join(TEMPLATES_DIR, job.slug, 'template.html'), 'utf-8')
      const rendered = substituteTemplate(html, job.sampleData, job.translations)
      const page = await browser.newPage()
      await page.setViewport(VIEWPORT)
      await page.setContent(rendered, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const card = await page.$('.invitation, .card')
      const buffer = card
        ? await card.screenshot({ type: 'jpeg', quality: 85 })
        : await page.screenshot({ type: 'jpeg', quality: 85, fullPage: false })
      writeFileSync(job.outPath, buffer)
      await page.close()
      console.log(`[screenshots] wrote ${job.outPath}`)
    }
  } finally {
    await browser.close()
  }
  console.log(`[screenshots] done. generated=${jobs.length}, skipped=${skipped}`)
}

main().catch(err => {
  console.error('[screenshots] failed:', err)
  process.exit(1)
})

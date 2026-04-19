import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer'
import { substituteTemplate } from '../utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const IMAGES_DIR = 'public/images/templates'
const SAMPLE_DATA = {
  coupleName1: 'Alex',
  coupleName2: 'Jordan',
  date: 'Saturday, June 14th, 2026',
  venue: 'The Old Mill',
  venueAddress: '123 River Lane, Somewhere, USA',
  wording: 'Together with their families, they invite you to celebrate\ntheir marriage.',
}
const VIEWPORT = { width: 800, height: 1200 }

async function main() {
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true })
  }

  const slugs = readdirSync(TEMPLATES_DIR)
    .filter(entry => statSync(join(TEMPLATES_DIR, entry)).isDirectory())
    .sort()

  const pending = slugs.filter(slug => !existsSync(join(IMAGES_DIR, `${slug}.jpg`)))
  const skipped = slugs.filter(slug => existsSync(join(IMAGES_DIR, `${slug}.jpg`)))

  for (const slug of skipped) console.log(`[screenshots] skipped ${slug} (image exists)`)

  if (pending.length === 0) {
    console.log('[screenshots] nothing to do.')
    return
  }

  console.log(`[screenshots] generating ${pending.length} image(s)...`)
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  try {
    for (const slug of pending) {
      const html = readFileSync(join(TEMPLATES_DIR, slug, 'template.html'), 'utf-8')
      const rendered = substituteTemplate(html, SAMPLE_DATA)
      const page = await browser.newPage()
      await page.setViewport(VIEWPORT)
      await page.setContent(rendered, { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts.ready)
      const outPath = join(IMAGES_DIR, `${slug}.jpg`)
      const buffer = await page.screenshot({ type: 'jpeg', quality: 85, fullPage: false })
      writeFileSync(outPath, buffer)
      await page.close()
      console.log(`[screenshots] wrote ${outPath}`)
    }
  } finally {
    await browser.close()
  }
  console.log(`[screenshots] done. generated=${pending.length}, skipped=${skipped.length}`)
}

main().catch(err => {
  console.error('[screenshots] failed:', err)
  process.exit(1)
})

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { substituteTemplate } from '~/server/utils/template-substitute'

const TEMPLATES_DIR = 'server/db/templates'
const EN_LOCALE_PATH = 'i18n/lang/en.json'
const SAMPLE_DATA = {
  coupleName1: 'Maria',
  coupleName2: 'James',
  date: 'Saturday, June 14th, 2026',
  venue: 'The Grand Ballroom',
  venueAddress: '123 Wedding Lane, City',
  wording: 'Together with their families, they invite you to celebrate\ntheir marriage.',
}

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  const htmlPath = join(TEMPLATES_DIR, slug, 'template.html')
  if (!existsSync(htmlPath)) {
    const available = readdirSync(TEMPLATES_DIR).filter(d => existsSync(join(TEMPLATES_DIR, d, 'template.html')))
    throw createError({
      statusCode: 404,
      statusMessage: `Template "${slug}" not found. Available: ${available.join(', ')}`,
    })
  }

  const html = readFileSync(htmlPath, 'utf-8')
  const translations = JSON.parse(readFileSync(EN_LOCALE_PATH, 'utf-8'))
  const rendered = substituteTemplate(html, SAMPLE_DATA, translations)
  const absolutePath = join(process.cwd(), htmlPath)

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Preview: ${slug}</title>
<style>
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #f5f5f5; }
  header { padding: 12px 20px; background: #111; color: #eee; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  header .slug { font-weight: 600; }
  header .path { font-family: ui-monospace, monospace; color: #aaa; }
  iframe { border: none; width: 100%; height: calc(100vh - 49px); background: #fff; display: block; }
</style>
</head>
<body>
<header>
  <span class="slug">${slug}</span>
  <span class="path">${absolutePath}</span>
</header>
<iframe srcdoc="${rendered.replace(/"/g, '&quot;')}"></iframe>
</body>
</html>`
})

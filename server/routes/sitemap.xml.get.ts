export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const base = (config.BASE_URL || `${getRequestProtocol(event)}://${getRequestHost(event)}`).replace(/\/$/, '')

  const lastmod = new Date().toISOString().slice(0, 10)
  const urls = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/pricing', changefreq: 'monthly', priority: '0.8' },
    { loc: '/templates', changefreq: 'weekly', priority: '0.8' },
  ]

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${base}${u.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  )
  .join('\n')}
</urlset>
`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return body
})

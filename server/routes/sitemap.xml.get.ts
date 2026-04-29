export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const base = (config.BASE_URL || `${getRequestProtocol(event)}://${getRequestHost(event)}`).replace(/\/$/, '')

  const lastmod = new Date().toISOString().slice(0, 10)
  const paths = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/pricing', changefreq: 'monthly', priority: '0.8' },
    { path: '/templates', changefreq: 'weekly', priority: '0.8' },
  ]
  const locales = [
    { code: 'en', prefix: '', hreflang: 'en' },
    { code: 'es', prefix: '/es', hreflang: 'es' },
  ]

  const urls = paths.flatMap((p) =>
    locales.map((l) => {
      const loc = `${base}${l.prefix}${p.path === '/' ? (l.prefix ? '' : '/') : p.path}`
      const alternates = locales
        .map((alt) => {
          const altLoc = `${base}${alt.prefix}${p.path === '/' ? (alt.prefix ? '' : '/') : p.path}`
          return `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${altLoc}" />`
        })
        .join('\n')
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${base}${p.path === '/' ? '/' : p.path}" />`
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
${alternates}
${xDefault}
  </url>`
    }),
  )

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return body
})

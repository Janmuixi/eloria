export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const base = (config.BASE_URL || `${getRequestProtocol(event)}://${getRequestHost(event)}`).replace(/\/$/, '')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return `User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /api
Disallow: /i/

Sitemap: ${base}/sitemap.xml
`
})

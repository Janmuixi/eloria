export type TemplateData = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  wording: string
}

export type TemplateTranslations = Record<string, unknown>

const TRANSLATION_TOKEN_REGEX = /\{\{t:([a-zA-Z0-9_.]+)\}\}/g

export function substituteTemplate(
  html: string,
  data: TemplateData,
  translations?: TemplateTranslations,
): string {
  let out = html
    .replace(/\{\{coupleName1\}\}/g, data.coupleName1)
    .replace(/\{\{coupleName2\}\}/g, data.coupleName2)
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{venue\}\}/g, data.venue)
    .replace(/\{\{venueAddress\}\}/g, data.venueAddress)
    .replace(/\{\{wording\}\}/g, data.wording)

  if (translations) {
    out = out.replace(TRANSLATION_TOKEN_REGEX, (match, path: string) => {
      const resolved = resolveTranslation(translations, path)
      return typeof resolved === 'string' ? resolved : match
    })
  }

  return out
}

function resolveTranslation(root: TemplateTranslations, path: string): unknown {
  const segments = path.split('.')
  let node: unknown = root
  for (const seg of segments) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[seg]
  }
  return node
}

import { requireAuth } from '~/server/utils/auth'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
}

function fallbackVariations(locale: string, coupleName1: string, coupleName2: string, date: string, venue: string): string[] {
  if (locale === 'es') {
    return [
      `Junto con sus familias, ${coupleName1} y ${coupleName2} tienen el placer de invitarte a celebrar su boda el ${date} en ${venue}.`,
      `${coupleName1} y ${coupleName2} solicitan el honor de tu compañía en la celebración de su boda el ${date} en ${venue}.`,
      `Acompáñanos en una celebración de amor mientras ${coupleName1} y ${coupleName2} se unen en matrimonio el ${date} en ${venue}.`,
    ]
  }
  return [
    `Together with their families, ${coupleName1} and ${coupleName2} invite you to celebrate their wedding on ${date} at ${venue}.`,
    `${coupleName1} and ${coupleName2} request the pleasure of your company at their wedding celebration on ${date} at ${venue}.`,
    `Join us for a celebration of love as ${coupleName1} and ${coupleName2} unite in marriage on ${date} at ${venue}.`,
  ]
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  const { coupleName1, coupleName2, date, venue, tone, locale } = body
  const lang = typeof locale === 'string' && LANGUAGE_NAMES[locale] ? locale : 'en'
  const languageName = LANGUAGE_NAMES[lang]

  const apiKey = resolveEnvVar('OPENAI_API_KEY')
  if (!apiKey || apiKey.startsWith('sk-...')) {
    return { variations: fallbackVariations(lang, coupleName1, coupleName2, date, venue) }
  }

  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a wedding invitation copywriter. Generate 3 invitation wording variations in the specified tone. Write all variations in ${languageName}. Return JSON: {"variations": ["...", "...", "..."]}`,
        },
        {
          role: 'user',
          content: `Couple: ${coupleName1} & ${coupleName2}. Date: ${date}. Venue: ${venue}. Tone: ${tone || 'formal'}. Language: ${languageName}.`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    return JSON.parse(response.choices[0].message.content || '{"variations":[]}')
  } catch {
    return { variations: fallbackVariations(lang, coupleName1, coupleName2, date, venue).slice(0, 1) }
  }
})

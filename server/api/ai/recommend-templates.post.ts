import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const allTemplates = await db.query.templates.findMany({
    with: { tier: true },
  })

  // If no OpenAI key, return all templates as-is
  const apiKey = resolveEnvVar('OPENAI_API_KEY')
  if (!apiKey || apiKey.startsWith('sk-...')) {
    return { recommended: allTemplates.slice(0, 5), all: allTemplates }
  }

  // With OpenAI, get ranked recommendations
  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const templateSummaries = allTemplates.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      tags: JSON.parse(t.tags),
    }))

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a wedding invitation style advisor. Given event details and a style description, rank templates by relevance. Return JSON: {"ids": [1,2,3]}. Max 5 IDs.',
        },
        {
          role: 'user',
          content: `Event: ${body.coupleName1} and ${body.coupleName2}, ${body.venue}, ${body.date}. Style: ${body.description || 'classic and elegant'}. Templates: ${JSON.stringify(templateSummaries)}`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const result = JSON.parse(response.choices[0].message.content || '{"ids":[]}')
    const recommended = (result.ids || [])
      .map((id: number) => allTemplates.find(t => t.id === id))
      .filter(Boolean)

    return { recommended, all: allTemplates }
  } catch {
    return { recommended: allTemplates.slice(0, 5), all: allTemplates }
  }
})

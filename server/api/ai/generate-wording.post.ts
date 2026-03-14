import { requireAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  const { coupleName1, coupleName2, date, venue, tone } = body

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.startsWith('sk-...')) {
    // Fallback wording
    return {
      variations: [
        `Together with their families, ${coupleName1} and ${coupleName2} invite you to celebrate their wedding on ${date} at ${venue}.`,
        `${coupleName1} and ${coupleName2} request the pleasure of your company at their wedding celebration on ${date} at ${venue}.`,
        `Join us for a celebration of love as ${coupleName1} and ${coupleName2} unite in marriage on ${date} at ${venue}.`,
      ],
    }
  }

  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a wedding invitation copywriter. Generate 3 invitation wording variations in the specified tone. Return JSON: {"variations": ["...", "...", "..."]}',
        },
        {
          role: 'user',
          content: `Couple: ${coupleName1} & ${coupleName2}. Date: ${date}. Venue: ${venue}. Tone: ${tone || 'formal'}.`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    return JSON.parse(response.choices[0].message.content || '{"variations":[]}')
  } catch {
    return {
      variations: [
        `Together with their families, ${coupleName1} and ${coupleName2} invite you to celebrate their wedding on ${date} at ${venue}.`,
      ],
    }
  }
})

import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, tiers, menuCourses, menuOptions } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { hasActiveSubscription } from '~/server/utils/subscription'
import { validateMenuTree } from '~/server/utils/menu-validation'

function generateSlug(name1: string, name2: string): string {
  const base = `${name1}-and-${name2}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { title, coupleName1, coupleName2, date, venue, venueAddress, venueMapUrl, description, allergiesEnabled } = body

  if (!title || !coupleName1 || !coupleName2 || !date || !venue || !venueAddress) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  const slug = generateSlug(coupleName1, coupleName2)

  const isSubscriber = await hasActiveSubscription(user.id)

  const premiumTier = await db.query.tiers.findFirst({
    where: eq(tiers.slug, 'premium'),
  })

  const eventData: Record<string, unknown> = {
    userId: user.id,
    title,
    coupleName1,
    coupleName2,
    date,
    venue,
    venueAddress,
    venueMapUrl: venueMapUrl || null,
    description: description || null,
    slug,
    allergiesEnabled: allergiesEnabled === true,
  }

  if (isSubscriber && premiumTier) {
    eventData.paymentStatus = 'paid'
    eventData.tierId = premiumTier.id
  }

  const [newEvent] = await db.insert(events).values(eventData).returning()

  if (body.menu) {
    const tree = validateMenuTree(body.menu)
    for (let ci = 0; ci < tree.courses.length; ci++) {
      const c = tree.courses[ci]
      const [createdCourse] = await db.insert(menuCourses).values({
        eventId: newEvent.id, name: c.name.trim(), sortOrder: ci,
      }).returning()
      for (let oi = 0; oi < c.options.length; oi++) {
        const o = c.options[oi]
        await db.insert(menuOptions).values({
          courseId: createdCourse.id, name: o.name.trim(), sortOrder: oi,
        }).run()
      }
    }
  }

  return newEvent
})

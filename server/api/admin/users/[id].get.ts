import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions, tiers } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = parseInt(getRouterParam(event, 'id')!, 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const eventRows = await db
    .select({
      id: events.id,
      title: events.title,
      date: events.date,
      slug: events.slug,
      paymentStatus: events.paymentStatus,
      tierSlug: tiers.slug,
      tierName: tiers.name,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(tiers, eq(tiers.id, events.tierId))
    .where(eq(events.userId, id))
    .orderBy(desc(events.createdAt))

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, id))
    .orderBy(desc(subscriptions.createdAt))

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      googleId: user.googleId,
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
      passwordHash: null,
      hasPassword: !!user.passwordHash,
      resetToken: null,
      hasResetToken: !!user.resetToken,
      resetTokenExpiresAt: user.resetTokenExpiresAt,
    },
    events: eventRows.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      slug: e.slug,
      paymentStatus: e.paymentStatus,
      tier: e.tierSlug ? { slug: e.tierSlug, name: e.tierName! } : null,
      createdAt: e.createdAt,
    })),
    subscriptions: subRows,
  }
})

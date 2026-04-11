import { db } from '~/server/db'
import { subscriptions } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function hasActiveSubscription(userId: number): Promise<boolean> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: [desc(subscriptions.createdAt)],
  })
  return subscription?.status === 'active'
}

export async function getActiveSubscription(userId: number): Promise<{
  id: number
  status: string
  currentPeriodEnd: string | null
} | null> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: [desc(subscriptions.createdAt)],
  })
  if (!subscription || subscription.status !== 'active') {
    return null
  }
  return {
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
  }
}

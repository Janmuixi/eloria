import { db } from '~/server/db'
import { subscriptions } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export async function hasActiveSubscription(userId: number): Promise<boolean> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
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

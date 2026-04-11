import { requireAuth } from '~/server/utils/auth'
import { getActiveSubscription } from '~/server/utils/subscription'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const subscription = await getActiveSubscription(user.id)

  return {
    hasActiveSubscription: subscription !== null,
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    } : null,
  }
})

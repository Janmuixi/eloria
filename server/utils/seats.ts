import { db } from '~/server/db'
import { guests } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * Returns the seat count for an event: number of guests + sum of companions_allowed.
 * One seat per guest plus one per allowed companion slot. Used to gate against tier.guestLimit.
 */
export async function countSeats(eventId: number): Promise<number> {
  const [row] = await db
    .select({
      seats: sql<number>`COUNT(*) + COALESCE(SUM(${guests.companionsAllowed}), 0)`,
    })
    .from(guests)
    .where(eq(guests.eventId, eventId))
  return Number(row?.seats ?? 0)
}

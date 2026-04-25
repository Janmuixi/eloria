import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { tiers } from './schema'

const dbUrl = process.env.DATABASE_URL || 'file:./db/eloria.db'
const sqlite = new Database(dbUrl.replace('file:', '') || './db/eloria.db')
const db = drizzle(sqlite)

const TIER_DEFINITIONS = [
  {
    name: 'Basic',
    slug: 'basic',
    price: 1500,
    sortOrder: 1,
    guestLimit: 15,
    hasEmailDelivery: true,
    hasPdfExport: true,
    hasAiTextGeneration: true,
    removeBranding: true,
    hasMultipleVariants: true,
  },
  {
    name: 'Premium',
    slug: 'premium',
    price: 3500,
    sortOrder: 2,
    guestLimit: null,
    hasEmailDelivery: true,
    hasPdfExport: true,
    hasAiTextGeneration: true,
    removeBranding: true,
    hasMultipleVariants: true,
  },
  {
    name: 'Pro',
    slug: 'pro',
    price: 4900,
    sortOrder: 3,
    guestLimit: null,
    hasEmailDelivery: true,
    hasPdfExport: true,
    hasAiTextGeneration: true,
    removeBranding: true,
    hasMultipleVariants: true,
  },
]

async function seed() {
  console.log('Seeding tiers...')

  for (const tier of TIER_DEFINITIONS) {
    await db.insert(tiers).values(tier).onConflictDoUpdate({
      target: tiers.slug,
      set: {
        name: tier.name,
        price: tier.price,
        sortOrder: tier.sortOrder,
        guestLimit: tier.guestLimit,
        hasEmailDelivery: tier.hasEmailDelivery,
        hasPdfExport: tier.hasPdfExport,
        hasAiTextGeneration: tier.hasAiTextGeneration,
        removeBranding: tier.removeBranding,
        hasMultipleVariants: tier.hasMultipleVariants,
      },
    })
  }

  console.log('Seeding complete.')
  sqlite.close()
}

seed()

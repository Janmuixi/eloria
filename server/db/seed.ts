import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { tiers } from './schema'
import { resolveEnvVar } from '../utils/resolve-env-var'

const dbUrl = resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db')
const sqlite = new Database(dbUrl.replace('file:', '') || './db/eloria.db')
const db = drizzle(sqlite)

async function seed() {
  console.log('Seeding tiers...')

  await db.insert(tiers).values([
    {
      name: 'Basic',
      slug: 'basic',
      price: 1500,
      sortOrder: 1,
      guestLimit: 50,
      hasEmailDelivery: false,
      hasPdfExport: false,
      hasAiTextGeneration: false,
      removeBranding: false,
      hasMultipleVariants: false,
    },
    {
      name: 'Premium',
      slug: 'premium',
      price: 3000,
      sortOrder: 2,
      guestLimit: 200,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: false,
    },
    {
      name: 'Pro',
      slug: 'pro',
      price: 4500,
      sortOrder: 3,
      guestLimit: null,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: true,
    },
  ]).onConflictDoNothing()

  console.log('Seeding complete.')
  sqlite.close()
}

seed()

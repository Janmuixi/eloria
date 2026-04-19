import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { templates, tiers } from './schema'
import { loadTemplatesFromDisk } from './load-templates'

const dbUrl = process.env.DATABASE_URL || 'file:./db/eloria.db'
const sqlite = new Database(dbUrl.replace('file:', ''))
const db = drizzle(sqlite, { schema: { templates, tiers } })

const TEMPLATES_DIR = 'server/db/templates'

async function seedTemplates() {
  console.log('[seed-templates] loading tiers...')
  const tierRows = await db.select().from(tiers)
  if (tierRows.length === 0) {
    console.error('[seed-templates] No tiers found. Run `npm run db:seed` first.')
    sqlite.close()
    process.exit(1)
  }
  const tierMap = new Map(tierRows.map(t => [t.slug, t.id]))

  console.log(`[seed-templates] reading templates from ${TEMPLATES_DIR}...`)
  const rows = loadTemplatesFromDisk(TEMPLATES_DIR, tierMap)
  console.log(`[seed-templates] found ${rows.length} templates: ${rows.map(r => r.slug).join(', ')}`)

  for (const row of rows) {
    await db.insert(templates).values(row).onConflictDoUpdate({
      target: templates.slug,
      set: {
        name: row.name,
        category: row.category,
        previewImageUrl: row.previewImageUrl,
        htmlTemplate: row.htmlTemplate,
        cssTemplate: row.cssTemplate,
        colorScheme: row.colorScheme,
        fontPairings: row.fontPairings,
        tags: row.tags,
        minimumTierId: row.minimumTierId,
      },
    })
  }

  console.log(`[seed-templates] upserted ${rows.length} templates.`)
  sqlite.close()
}

seedTemplates().catch(err => {
  console.error('[seed-templates] failed:', err)
  sqlite.close()
  process.exit(1)
})

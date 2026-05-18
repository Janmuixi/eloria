import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { templates, tiers } from '~/server/db/schema'
import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      slug: templates.slug,
      category: templates.category,
      colorScheme: templates.colorScheme,
      fontPairings: templates.fontPairings,
      tags: templates.tags,
      createdAt: templates.createdAt,
      tierId: tiers.id,
      tierSlug: tiers.slug,
      tierName: tiers.name,
    })
    .from(templates)
    .innerJoin(tiers, eq(tiers.id, templates.minimumTierId))
    .orderBy(asc(templates.category), asc(templates.name))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    category: r.category,
    colorScheme: r.colorScheme,
    fontPairings: r.fontPairings,
    tags: r.tags,
    createdAt: r.createdAt,
    minimumTier: { id: r.tierId, slug: r.tierSlug, name: r.tierName },
  }))
})

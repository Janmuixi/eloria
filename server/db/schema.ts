import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// ─── Tiers ──────────────────────────────────────────────────────────────────

export const tiers = sqliteTable('tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  price: integer('price').notNull(),
  sortOrder: integer('sort_order').notNull(),
  guestLimit: integer('guest_limit'),
  hasEmailDelivery: integer('has_email_delivery', { mode: 'boolean' }).default(false),
  hasPdfExport: integer('has_pdf_export', { mode: 'boolean' }).default(false),
  hasAiTextGeneration: integer('has_ai_text_generation', { mode: 'boolean' }).default(false),
  removeBranding: integer('remove_branding', { mode: 'boolean' }).default(false),
  hasMultipleVariants: integer('has_multiple_variants', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const tiersRelations = relations(tiers, ({ many }) => ({
  templates: many(templates),
  events: many(events),
}))

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
}))

// ─── Templates ──────────────────────────────────────────────────────────────

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  previewImageUrl: text('preview_image_url').notNull(),
  htmlTemplate: text('html_template').notNull(),
  cssTemplate: text('css_template').notNull(),
  colorScheme: text('color_scheme').notNull(),
  fontPairings: text('font_pairings').notNull(),
  tags: text('tags').notNull(),
  minimumTierId: integer('minimum_tier_id').notNull().references(() => tiers.id),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const templatesRelations = relations(templates, ({ one }) => ({
  tier: one(tiers, {
    fields: [templates.minimumTierId],
    references: [tiers.id],
  }),
}))

// ─── Events ─────────────────────────────────────────────────────────────────

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  coupleName1: text('couple_name_1').notNull(),
  coupleName2: text('couple_name_2').notNull(),
  date: text('date').notNull(),
  venue: text('venue').notNull(),
  venueAddress: text('venue_address').notNull(),
  venueMapUrl: text('venue_map_url'),
  description: text('description'),
  templateId: integer('template_id').references(() => templates.id),
  customization: text('customization'),
  tierId: integer('tier_id').references(() => tiers.id),
  paymentStatus: text('payment_status').notNull().default('pending'),
  stripePaymentId: text('stripe_payment_id'),
  slug: text('slug').notNull().unique(),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [events.templateId],
    references: [templates.id],
  }),
  tier: one(tiers, {
    fields: [events.tierId],
    references: [tiers.id],
  }),
  guests: many(guests),
}))

// ─── Guests ─────────────────────────────────────────────────────────────────

export const guests = sqliteTable('guests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  rsvpStatus: text('rsvp_status').notNull().default('pending'),
  plusOne: integer('plus_one', { mode: 'boolean' }).default(false),
  plusOneName: text('plus_one_name'),
  token: text('token').notNull().unique(),
  emailSentAt: text('email_sent_at'),
  emailOpenedAt: text('email_opened_at'),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const guestsRelations = relations(guests, ({ one }) => ({
  event: one(events, {
    fields: [guests.eventId],
    references: [events.id],
  }),
}))

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
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
  passwordHash: text('password_hash'),
  googleId: text('google_id').unique(),
  avatarUrl: text('avatar_url'),
  name: text('name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
  subscriptions: many(subscriptions),
}))

export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  status: text('status').notNull(),
  price: integer('price').notNull(),
  currentPeriodStart: text('current_period_start'),
  currentPeriodEnd: text('current_period_end'),
  canceledAt: text('canceled_at'),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}))

// ─── Templates ──────────────────────────────────────────────────────────────

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category').notNull(),
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
  invitationType: text('invitation_type').notNull().default('template'),
  customImagePath: text('custom_image_path'),
  customization: text('customization'),
  tierId: integer('tier_id').references(() => tiers.id),
  paymentStatus: text('payment_status').notNull().default('pending'),
  stripePaymentId: text('stripe_payment_id'),
  language: text('language').notNull().default('en'),
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
  menuCourses: many(menuCourses),
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
  allergies: text('allergies'),
  plusOneAllergies: text('plus_one_allergies'),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const guestsRelations = relations(guests, ({ one, many }) => ({
  event: one(events, {
    fields: [guests.eventId],
    references: [events.id],
  }),
  menuChoices: many(guestMenuChoices),
}))

// ─── Menu ───────────────────────────────────────────────────────────────────

export const menuCourses = sqliteTable('menu_courses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const menuOptions = sqliteTable('menu_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  courseId: integer('course_id').notNull().references(() => menuCourses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(new Date().toISOString()),
})

export const guestMenuChoices = sqliteTable('guest_menu_choices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guestId: integer('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  courseId: integer('course_id').notNull().references(() => menuCourses.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').references(() => menuOptions.id, { onDelete: 'set null' }),
  forPlusOne: integer('for_plus_one', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(new Date().toISOString()),
}, (t) => ({
  guestCourseForPlusOneUnq: uniqueIndex('guest_menu_choices_guest_course_plusone_unq')
    .on(t.guestId, t.courseId, t.forPlusOne),
}))

export const menuCoursesRelations = relations(menuCourses, ({ one, many }) => ({
  event: one(events, { fields: [menuCourses.eventId], references: [events.id] }),
  options: many(menuOptions),
  choices: many(guestMenuChoices),
}))

export const menuOptionsRelations = relations(menuOptions, ({ one, many }) => ({
  course: one(menuCourses, { fields: [menuOptions.courseId], references: [menuCourses.id] }),
  choices: many(guestMenuChoices),
}))

export const guestMenuChoicesRelations = relations(guestMenuChoices, ({ one }) => ({
  guest: one(guests, { fields: [guestMenuChoices.guestId], references: [guests.id] }),
  course: one(menuCourses, { fields: [guestMenuChoices.courseId], references: [menuCourses.id] }),
  option: one(menuOptions, { fields: [guestMenuChoices.optionId], references: [menuOptions.id] }),
}))

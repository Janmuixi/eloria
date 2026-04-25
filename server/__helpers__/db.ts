import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { tiers, users, templates, events, guests, subscriptions } from '../db/schema'

export type TestDb = ReturnType<typeof createTestDb>

export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      guest_limit INTEGER,
      has_email_delivery INTEGER DEFAULT 0,
      has_pdf_export INTEGER DEFAULT 0,
      has_ai_text_generation INTEGER DEFAULT 0,
      remove_branding INTEGER DEFAULT 0,
      has_multiple_variants INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      reset_token TEXT,
      reset_token_expires_at TEXT,
      stripe_customer_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      preview_image_url TEXT NOT NULL,
      html_template TEXT NOT NULL,
      css_template TEXT NOT NULL,
      color_scheme TEXT NOT NULL,
      font_pairings TEXT NOT NULL,
      tags TEXT NOT NULL,
      minimum_tier_id INTEGER NOT NULL REFERENCES tiers(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      couple_name_1 TEXT NOT NULL,
      couple_name_2 TEXT NOT NULL,
      date TEXT NOT NULL,
      venue TEXT NOT NULL,
      venue_address TEXT NOT NULL,
      venue_map_url TEXT,
      description TEXT,
      template_id INTEGER REFERENCES templates(id),
      invitation_type TEXT NOT NULL DEFAULT 'template',
      custom_image_path TEXT,
      customization TEXT,
      tier_id INTEGER REFERENCES tiers(id),
      payment_status TEXT NOT NULL DEFAULT 'pending',
      stripe_payment_id TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      rsvp_status TEXT NOT NULL DEFAULT 'pending',
      plus_one INTEGER DEFAULT 0,
      plus_one_name TEXT,
      token TEXT NOT NULL UNIQUE,
      email_sent_at TEXT,
      email_opened_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      price INTEGER NOT NULL,
      current_period_start TEXT,
      current_period_end TEXT,
      canceled_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  return drizzle(sqlite, { schema })
}

export function seedTiers(db: TestDb) {
  return db.insert(tiers).values([
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
      price: 3500,
      sortOrder: 2,
      guestLimit: null,
      hasEmailDelivery: true,
      hasPdfExport: true,
      hasAiTextGeneration: true,
      removeBranding: true,
      hasMultipleVariants: true,
    },
  ]).run()
}

export function seedTemplate(db: TestDb, tierId: number) {
  const rows = db.insert(templates).values({
    name: 'Test Template',
    slug: `test-template-${Math.random().toString(36).substring(2, 6)}`,
    category: 'classic',
    previewImageUrl: '/test.png',
    htmlTemplate: '<div>{{coupleName1}} & {{coupleName2}}</div>',
    cssTemplate: 'body { font-family: serif; }',
    colorScheme: '{"primary":"#333"}',
    fontPairings: '{"heading":"serif"}',
    tags: '["classic","elegant"]',
    minimumTierId: tierId,
  }).returning().all()
  return rows[0]
}

export async function createTestUser(db: TestDb, overrides?: Partial<{
  email: string; name: string; password: string; emailVerified: boolean
}>) {
  const { hashPassword } = await import('../utils/password')
  const passwordHash = await hashPassword(overrides?.password || 'testpass123')
  const rows = db.insert(users).values({
    email: overrides?.email || 'test@example.com',
    name: overrides?.name || 'Test User',
    passwordHash,
    emailVerified: overrides?.emailVerified ?? false,
  }).returning().all()
  return rows[0]
}

export function createTestEvent(db: TestDb, userId: number, overrides?: Partial<{
  title: string; coupleName1: string; coupleName2: string; date: string;
  venue: string; venueAddress: string; slug: string; tierId: number | null;
  templateId: number | null; paymentStatus: string; customization: string | null;
  invitationType: string; customImagePath: string | null;
}>) {
  const rows = db.insert(events).values({
    userId,
    title: overrides?.title || 'Test Wedding',
    coupleName1: overrides?.coupleName1 || 'Alice',
    coupleName2: overrides?.coupleName2 || 'Bob',
    date: overrides?.date || '2026-06-15',
    venue: overrides?.venue || 'Grand Hotel',
    venueAddress: overrides?.venueAddress || '123 Main St',
    slug: overrides?.slug || `test-slug-${Math.random().toString(36).substring(2, 6)}`,
    tierId: overrides?.tierId ?? null,
    templateId: overrides?.templateId ?? null,
    paymentStatus: overrides?.paymentStatus || 'pending',
    customization: overrides?.customization ?? null,
    invitationType: overrides?.invitationType || 'template',
    customImagePath: overrides?.customImagePath ?? null,
  }).returning().all()
  return rows[0]
}

export function createTestGuest(db: TestDb, eventId: number, overrides?: Partial<{
  name: string; email: string | null; phone: string | null; token: string;
  rsvpStatus: string; plusOne: boolean; plusOneName: string | null;
}>) {
  const rows = db.insert(guests).values({
    eventId,
    name: overrides?.name || 'Guest User',
    email: overrides?.email ?? 'guest@example.com',
    phone: overrides?.phone ?? null,
    token: overrides?.token || crypto.randomUUID(),
    rsvpStatus: overrides?.rsvpStatus || 'pending',
    plusOne: overrides?.plusOne ?? false,
    plusOneName: overrides?.plusOneName ?? null,
  }).returning().all()
  return rows[0]
}

export function createTestSubscription(db: TestDb, userId: number, overrides?: Partial<{
  stripeSubscriptionId: string; stripeCustomerId: string; status: string;
  price: number; currentPeriodEnd: string | null;
}>) {
  const rows = db.insert(subscriptions).values({
    userId,
    stripeSubscriptionId: overrides?.stripeSubscriptionId || `sub_test_${crypto.randomUUID()}`,
    stripeCustomerId: overrides?.stripeCustomerId || 'cus_test',
    status: overrides?.status || 'active',
    price: overrides?.price ?? 4900,
    currentPeriodEnd: overrides?.currentPeriodEnd ?? null,
  }).returning().all()
  return rows[0]
}

# Eloria Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a wedding invitation platform where users create AI-recommended template-based invitations, manage guest RSVPs, and deliver via link/email/PDF.

**Architecture:** Nuxt 3 SSR app with Nitro server routes for API, SQLite database via Drizzle ORM, Stripe for payments, Resend for email, OpenAI for AI features. All TypeScript.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Tailwind CSS, Drizzle ORM, SQLite, Stripe, Resend, OpenAI, Puppeteer

**Design doc:** `docs/plans/2026-03-14-eloria-design.md`

---

## Phase 1: Project Setup & Database Schema

### Task 1: Scaffold Nuxt 3 Project

**Files:**
- Create: `package.json`, `nuxt.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.example`, `.gitignore`

**Step 1: Initialize Nuxt 3 project**

```bash
npx nuxi@latest init eloria
cd eloria
```

Select: TypeScript, npm

**Step 2: Install core dependencies**

```bash
npm install drizzle-orm better-sqlite3 @libsql/client
npm install -D drizzle-kit @types/better-sqlite3 @nuxtjs/tailwindcss
```

**Step 3: Configure Tailwind**

Add `@nuxtjs/tailwindcss` to `nuxt.config.ts` modules array.

Create `tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf4f5',
          100: '#fce8ec',
          200: '#f9d5dc',
          300: '#f4b3c0',
          400: '#ec8599',
          500: '#df5676',
          600: '#cc365c',
          700: '#ab284c',
          800: '#8f2444',
          900: '#7a223f',
          950: '#440e1f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
```

**Step 4: Create `.env.example`**

```
DATABASE_URL=file:./db/eloria.db
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
OPENAI_API_KEY=sk-...
JWT_SECRET=change-me-to-a-random-string
BASE_URL=http://localhost:3000
```

**Step 5: Create `.gitignore`**

Ensure it includes: `node_modules`, `.nuxt`, `.output`, `db/*.db`, `.env`

**Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Nuxt dev server running on http://localhost:3000

**Step 7: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Nuxt 3 project with TypeScript and Tailwind"
```

---

### Task 2: Define Drizzle Database Schema

**Files:**
- Create: `server/db/schema.ts`
- Create: `server/db/index.ts`
- Create: `drizzle.config.ts`

**Step 1: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./db/eloria.db',
  },
})
```

**Step 2: Create `server/db/schema.ts`**

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

export const tiers = sqliteTable('tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  price: integer('price').notNull(), // cents
  sortOrder: integer('sort_order').notNull(),
  guestLimit: integer('guest_limit'), // null = unlimited
  hasEmailDelivery: integer('has_email_delivery', { mode: 'boolean' }).notNull().default(false),
  hasPdfExport: integer('has_pdf_export', { mode: 'boolean' }).notNull().default(false),
  hasAiTextGeneration: integer('has_ai_text_generation', { mode: 'boolean' }).notNull().default(false),
  removeBranding: integer('remove_branding', { mode: 'boolean' }).notNull().default(false),
  hasMultipleVariants: integer('has_multiple_variants', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  previewImageUrl: text('preview_image_url').notNull(),
  htmlTemplate: text('html_template').notNull(),
  cssTemplate: text('css_template').notNull(),
  colorScheme: text('color_scheme').notNull(), // JSON
  fontPairings: text('font_pairings').notNull(), // JSON
  tags: text('tags').notNull(), // JSON
  minimumTierId: integer('minimum_tier_id').notNull().references(() => tiers.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

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
  customization: text('customization'), // JSON
  tierId: integer('tier_id').references(() => tiers.id),
  paymentStatus: text('payment_status').notNull().default('pending'),
  stripePaymentId: text('stripe_payment_id'),
  slug: text('slug').notNull().unique(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const guests = sqliteTable('guests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  rsvpStatus: text('rsvp_status').notNull().default('pending'),
  plusOne: integer('plus_one', { mode: 'boolean' }).notNull().default(false),
  plusOneName: text('plus_one_name'),
  token: text('token').notNull().unique(),
  emailSentAt: text('email_sent_at'),
  emailOpenedAt: text('email_opened_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// Relations
export const tiersRelations = relations(tiers, ({ many }) => ({
  templates: many(templates),
  events: many(events),
}))

export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
}))

export const templatesRelations = relations(templates, ({ one }) => ({
  minimumTier: one(tiers, {
    fields: [templates.minimumTierId],
    references: [tiers.id],
  }),
}))

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, { fields: [events.userId], references: [users.id] }),
  template: one(templates, { fields: [events.templateId], references: [templates.id] }),
  tier: one(tiers, { fields: [events.tierId], references: [tiers.id] }),
  guests: many(guests),
}))

export const guestsRelations = relations(guests, ({ one }) => ({
  event: one(events, { fields: [guests.eventId], references: [events.id] }),
}))
```

**Step 3: Create `server/db/index.ts`**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', '') || './db/eloria.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
```

**Step 4: Generate and run initial migration**

```bash
mkdir -p db
npx drizzle-kit generate
npx drizzle-kit push
```

**Step 5: Verify database was created**

```bash
ls db/eloria.db
```

Expected: file exists

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Drizzle schema for tiers, users, templates, events, guests"
```

---

### Task 3: Seed Tiers Data

**Files:**
- Create: `server/db/seed.ts`

**Step 1: Create seed script**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { tiers } from './schema'

const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', '') || './db/eloria.db')
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
```

**Step 2: Add seed script to package.json**

Add to `scripts`: `"db:seed": "npx tsx server/db/seed.ts"`

Also add: `"db:push": "npx drizzle-kit push"`, `"db:generate": "npx drizzle-kit generate"`

**Step 3: Install tsx and run seed**

```bash
npm install -D tsx
npm run db:seed
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add database seed script with tier data"
```

---

## Phase 2: Authentication

### Task 4: Auth Utilities (Password Hashing, JWT)

**Files:**
- Create: `server/utils/auth.ts`
- Create: `server/utils/password.ts`

**Step 1: Install auth dependencies**

```bash
npm install jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs
```

**Step 2: Create `server/utils/password.ts`**

```ts
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

**Step 3: Create `server/utils/auth.ts`**

```ts
import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_EXPIRY = '7d'

interface JwtPayload {
  userId: number
  email: string
}

export function createToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export async function getAuthUser(event: H3Event) {
  const token = getCookie(event, 'auth_token')
  if (!token) return null

  try {
    const payload = verifyToken(token)
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    })
    return user || null
  } catch {
    return null
  }
}

export async function requireAuth(event: H3Event) {
  const user = await getAuthUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add auth utilities for password hashing and JWT"
```

---

### Task 5: Auth API Routes (Register, Login, Logout)

**Files:**
- Create: `server/api/auth/register.post.ts`
- Create: `server/api/auth/login.post.ts`
- Create: `server/api/auth/logout.post.ts`
- Create: `server/api/auth/me.get.ts`

**Step 1: Create `server/api/auth/register.post.ts`**

```ts
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { hashPassword } from '~/server/utils/password'
import { createToken } from '~/server/utils/auth'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, name } = body

  if (!email || !password || !name) {
    throw createError({ statusCode: 400, statusMessage: 'Email, password, and name are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' })
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  })

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const passwordHash = await hashPassword(password)

  const [user] = await db.insert(users).values({
    email: email.toLowerCase(),
    passwordHash,
    name,
  }).returning()

  const token = createToken({ userId: user.id, email: user.email })

  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return { user: { id: user.id, email: user.email, name: user.name } }
})
```

**Step 2: Create `server/api/auth/login.post.ts`**

```ts
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { verifyPassword } from '~/server/utils/password'
import { createToken } from '~/server/utils/auth'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  })

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const token = createToken({ userId: user.id, email: user.email })

  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return { user: { id: user.id, email: user.email, name: user.name } }
})
```

**Step 3: Create `server/api/auth/logout.post.ts`**

```ts
export default defineEventHandler(async (event) => {
  deleteCookie(event, 'auth_token', { path: '/' })
  return { success: true }
})
```

**Step 4: Create `server/api/auth/me.get.ts`**

```ts
import { getAuthUser } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getAuthUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  return { user: { id: user.id, email: user.email, name: user.name } }
})
```

**Step 5: Test manually with curl or browser**

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add auth API routes (register, login, logout, me)"
```

---

### Task 6: Auth Composable and Middleware

**Files:**
- Create: `composables/useAuth.ts`
- Create: `middleware/auth.ts`

**Step 1: Create `composables/useAuth.ts`**

```ts
interface User {
  id: number
  email: string
  name: string
}

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null)
  const loading = useState<boolean>('auth_loading', () => true)

  const fetchUser = async () => {
    try {
      const data = await $fetch('/api/auth/me')
      user.value = data.user
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  const login = async (email: string, password: string) => {
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = data.user
    return data
  }

  const register = async (email: string, password: string, name: string) => {
    const data = await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email, password, name },
    })
    user.value = data.user
    return data
  }

  const logout = async () => {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    navigateTo('/auth/login')
  }

  return { user, loading, fetchUser, login, register, logout }
}
```

**Step 2: Create `middleware/auth.ts`**

```ts
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchUser, loading } = useAuth()

  if (loading.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo('/auth/login')
  }
})
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add auth composable and route middleware"
```

---

### Task 7: Auth Pages (Login, Register)

**Files:**
- Create: `pages/auth/login.vue`
- Create: `pages/auth/register.vue`

**Step 1: Create `pages/auth/register.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { register } = useAuth()
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const submitting = ref(false)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await register(form.email, form.password, form.name)
    navigateTo('/dashboard')
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Registration failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-md">
      <h1 class="text-3xl font-bold text-center mb-8">Create your Eloria account</h1>
      <form @submit.prevent="onSubmit" class="bg-white rounded-lg shadow p-8 space-y-4">
        <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>
        <div>
          <label class="block text-sm font-medium mb-1">Name</label>
          <input v-model="form.name" type="text" required
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input v-model="form.email" type="email" required
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Password</label>
          <input v-model="form.password" type="password" required minlength="8"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <button type="submit" :disabled="submitting"
          class="w-full bg-primary-600 text-white rounded-lg py-2 font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ submitting ? 'Creating account...' : 'Create account' }}
        </button>
        <p class="text-center text-sm text-gray-500">
          Already have an account? <NuxtLink to="/auth/login" class="text-primary-600 hover:underline">Sign in</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
```

**Step 2: Create `pages/auth/login.vue`**

Same structure as register, but with email/password only and calls `login()` instead.

**Step 3: Create `layouts/auth.vue`**

Simple layout with no nav bar, just a centered container:

```vue
<template>
  <div>
    <slot />
  </div>
</template>
```

**Step 4: Verify login/register flow works in browser**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add login and register pages with auth layout"
```

---

## Phase 3: Public Pages

### Task 8: Landing Page

**Files:**
- Create: `pages/index.vue`
- Create: `layouts/default.vue`
- Create: `components/ui/Navbar.vue`
- Create: `components/ui/Footer.vue`

**Step 1: Create default layout with Navbar and Footer**

`layouts/default.vue`:
```vue
<template>
  <div class="min-h-screen flex flex-col">
    <UiNavbar />
    <main class="flex-1">
      <slot />
    </main>
    <UiFooter />
  </div>
</template>
```

**Step 2: Create Navbar component**

`components/ui/Navbar.vue` -- logo, nav links (Templates, Pricing), auth buttons (Login/Register or Dashboard/Logout based on auth state).

**Step 3: Create Footer component**

Simple footer with copyright and links.

**Step 4: Create landing page**

`pages/index.vue` -- hero section (headline, subheading, CTA button), features grid (3 cards: Create, Send, Track), template preview section, pricing summary, final CTA.

All SSR-rendered for SEO. Use `useHead()` for meta tags.

**Step 5: Verify page renders correctly**

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add landing page with navbar, footer, default layout"
```

---

### Task 9: Pricing Page

**Files:**
- Create: `pages/pricing.vue`

**Step 1: Create pricing page**

Fetch tiers from API: `server/api/tiers/index.get.ts`

```ts
// server/api/tiers/index.get.ts
import { db } from '~/server/db'
import { tiers } from '~/server/db/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  return db.select().from(tiers).orderBy(asc(tiers.sortOrder))
})
```

`pages/pricing.vue` renders a comparison table/cards from the tiers data. Uses `useFetch('/api/tiers')` for SSR data fetching.

**Step 2: Verify page renders with tier data**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add pricing page with tier comparison"
```

---

### Task 10: Template Gallery Page

**Files:**
- Create: `pages/templates/index.vue`
- Create: `server/api/templates/index.get.ts`

**Step 1: Create templates API route**

Returns all templates with their minimum tier info. Supports optional `?category=` query filter.

**Step 2: Create template gallery page**

Grid of template preview cards. Each card shows preview image, name, category, and a badge if it's premium/pro only. Filter buttons at the top for categories. Uses `useFetch` for SSR.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add template gallery page with category filtering"
```

---

## Phase 4: Dashboard & Event Management

### Task 11: Dashboard Layout and My Events Page

**Files:**
- Create: `layouts/dashboard.vue`
- Create: `pages/dashboard/index.vue`
- Create: `server/api/events/index.get.ts`

**Step 1: Create dashboard layout**

`layouts/dashboard.vue` -- sidebar navigation (My Events, Create Event, Account) + top bar with user info and logout. Applies `auth` middleware.

**Step 2: Create events list API**

`server/api/events/index.get.ts` -- returns all events for the authenticated user, with tier and template info.

```ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  return db.query.events.findMany({
    where: eq(events.userId, user.id),
    orderBy: desc(events.createdAt),
    with: { tier: true, template: true },
  })
})
```

**Step 3: Create dashboard index page**

Shows list of events as cards with status indicators (pending payment, active, etc.) and a "Create New Event" CTA. Empty state when no events.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add dashboard layout and events list page"
```

---

### Task 12: Create Event Wizard -- Step 1: Event Details

**Files:**
- Create: `pages/dashboard/events/new.vue`
- Create: `server/api/events/index.post.ts`

**Step 1: Create event creation API**

Accepts event details, generates a unique slug from couple names, creates event with `paymentStatus: 'pending'`.

```ts
// server/api/events/index.post.ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

function generateSlug(name1: string, name2: string): string {
  const base = `${name1}-and-${name2}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { title, coupleName1, coupleName2, date, venue, venueAddress, venueMapUrl, description } = body

  if (!title || !coupleName1 || !coupleName2 || !date || !venue || !venueAddress) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  const slug = generateSlug(coupleName1, coupleName2)

  const [newEvent] = await db.insert(events).values({
    userId: user.id,
    title,
    coupleName1,
    coupleName2,
    date,
    venue,
    venueAddress,
    venueMapUrl: venueMapUrl || null,
    description: description || null,
    slug,
  }).returning()

  return newEvent
})
```

**Step 2: Create wizard page -- step 1 (details form)**

Multi-step wizard component. Step 1: form for event details. On submit, creates the event via API and moves to step 2 (template selection).

Use a `currentStep` ref to track wizard progress. Steps: Details -> Template -> Customize -> Preview -> Pay.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add create event wizard step 1 (event details)"
```

---

### Task 13: Create Event Wizard -- Step 2: Template Selection (with AI)

**Files:**
- Create: `server/api/ai/recommend-templates.post.ts`
- Modify: `pages/dashboard/events/new.vue` (add step 2)

**Step 1: Create AI template recommendation API**

```ts
// server/api/ai/recommend-templates.post.ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { templates } from '~/server/db/schema'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  const { description, coupleName1, coupleName2, venue, date } = body

  // Fetch all templates with their tags
  const allTemplates = await db.select().from(templates)

  const templateSummaries = allTemplates.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    tags: JSON.parse(t.tags),
  }))

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a wedding invitation style advisor. Given event details and a style description, rank the provided templates by relevance. Return a JSON array of template IDs in order of best match, maximum 5. Only return the JSON array, nothing else.`,
      },
      {
        role: 'user',
        content: `Event: ${coupleName1} and ${coupleName2}, ${venue}, ${date}. Style description: ${description || 'classic and elegant'}. Available templates: ${JSON.stringify(templateSummaries)}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(response.choices[0].message.content || '{"ids":[]}')
  const recommendedIds: number[] = result.ids || []

  // Return full template objects in recommended order
  const recommended = recommendedIds
    .map(id => allTemplates.find(t => t.id === id))
    .filter(Boolean)

  return { recommended, all: allTemplates }
})
```

**Step 2: Add step 2 to wizard**

Optional text input for style description. "Get AI recommendations" button. Shows recommended templates first, then all templates. User clicks to select.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add AI template recommendation and wizard step 2"
```

---

### Task 14: Create Event Wizard -- Step 3: Customize

**Files:**
- Modify: `pages/dashboard/events/new.vue` (add step 3)
- Create: `components/invitation/TemplatePreview.vue`
- Create: `server/api/ai/generate-wording.post.ts`

**Step 1: Create wording generation API**

Accepts event details and tone (formal/casual/poetic/funny), returns generated invitation wording via OpenAI.

**Step 2: Create TemplatePreview component**

Renders the selected template's HTML with event data injected. Uses `v-html` with sanitized content. Updates live as user changes customization options.

**Step 3: Add step 3 to wizard**

Form with:
- Color palette picker (from template's color options)
- Font pairing selector (dropdown from curated options)
- Invitation wording (textarea with AI generation button for suggestions)
- Photo upload (couple photo)
- Live preview panel on the right side

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add customization step with live preview and AI wording"
```

---

### Task 15: Create Event Wizard -- Step 4: Preview & Step 5: Payment

**Files:**
- Modify: `pages/dashboard/events/new.vue` (add steps 4 and 5)
- Create: `server/api/events/[id].put.ts`

**Step 1: Add step 4 (full preview)**

Full-width preview of the invitation as guests will see it. "Looks good" button to proceed to payment.

**Step 2: Create event update API**

`server/api/events/[id].put.ts` -- updates event with selected template, customization, and tier.

**Step 3: Add step 5 (tier selection + Stripe redirect)**

Display tier comparison cards. User selects tier. "Pay & Publish" button initiates Stripe checkout (Task 16 will implement Stripe).

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add preview and payment steps to event wizard"
```

---

## Phase 5: Stripe Payment Integration

### Task 16: Stripe Checkout and Webhook

**Files:**
- Create: `server/api/payments/create-checkout.post.ts`
- Create: `server/api/payments/webhook.post.ts`
- Create: `pages/dashboard/events/[id]/success.vue`

**Step 1: Install Stripe**

```bash
npm install stripe
```

**Step 2: Create checkout session API**

```ts
// server/api/payments/create-checkout.post.ts
import Stripe from 'stripe'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, tiers } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { eventId, tierSlug } = body

  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const tier = await db.query.tiers.findFirst({
    where: eq(tiers.slug, tierSlug),
  })

  if (!tier) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tier' })
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Eloria ${tier.name} - ${userEvent.title}`,
            description: `Wedding invitation for ${userEvent.coupleName1} & ${userEvent.coupleName2}`,
          },
          unit_amount: tier.price,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.BASE_URL}/dashboard/events/${eventId}/success`,
    cancel_url: `${process.env.BASE_URL}/dashboard/events/new?step=5&eventId=${eventId}`,
    metadata: {
      eventId: eventId.toString(),
      tierId: tier.id.toString(),
    },
  })

  return { url: session.url }
})
```

**Step 3: Create webhook handler**

`server/api/payments/webhook.post.ts` -- verifies Stripe signature, on `checkout.session.completed`, updates event with `paymentStatus: 'paid'`, sets `tierId` and `stripePaymentId`.

Important: use `readRawBody(event)` for signature verification.

**Step 4: Create success page**

Shows confirmation message, link to event dashboard.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Stripe checkout and webhook for event payments"
```

---

## Phase 6: Public Invitation Page

### Task 17: Invitation Page (SSR, Guest-Facing)

**Files:**
- Create: `pages/i/[slug].vue`
- Create: `server/api/invitations/[slug].get.ts`
- Create: `components/invitation/InvitationRenderer.vue`

**Step 1: Create public invitation API**

`server/api/invitations/[slug].get.ts` -- fetches event by slug (only if paid), returns event data with template. No auth required.

**Step 2: Create InvitationRenderer component**

Takes event data + template + customization. Renders the template HTML with data interpolated. Sections: hero (names + date), details, venue (with map embed link), RSVP form.

**Step 3: Create invitation page**

`pages/i/[slug].vue` -- SSR page. Fetches event data via `useFetch`. Renders InvitationRenderer. Sets `useHead()` with couple names and date for SEO/social sharing (og:title, og:image).

Handles `?g=[token]` query param to identify the guest for RSVP pre-population.

**Step 4: Add Eloria branding footer for Basic tier, hidden for Premium/Pro**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add public invitation page with SSR rendering"
```

---

## Phase 7: Guest Management

### Task 18: Guest List CRUD

**Files:**
- Create: `server/api/events/[id]/guests/index.get.ts`
- Create: `server/api/events/[id]/guests/index.post.ts`
- Create: `server/api/events/[id]/guests/[guestId].delete.ts`
- Create: `server/api/events/[id]/guests/import.post.ts`
- Create: `pages/dashboard/events/[id]/guests.vue`

**Step 1: Create guest CRUD APIs**

- GET: list all guests for event (with auth + ownership check)
- POST: add single guest (generates unique token via `crypto.randomUUID()`)
- DELETE: remove guest
- POST import: accepts CSV text, parses rows, bulk inserts guests

**Step 2: Create guests management page**

Table with columns: name, email, RSVP status, plus-one, actions. Add guest form (inline or modal). CSV import button with textarea for paste. Delete button per row.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add guest management with CRUD and CSV import"
```

---

## Phase 8: RSVP System

### Task 19: RSVP API and Form

**Files:**
- Create: `server/api/rsvp/[token].post.ts`
- Create: `server/api/rsvp/[token].get.ts`
- Modify: `pages/i/[slug].vue` (add RSVP form)

**Step 1: Create RSVP GET endpoint**

Returns current RSVP status for a guest by token. No auth required.

**Step 2: Create RSVP POST endpoint**

Updates guest rsvpStatus (confirmed/declined/maybe), plusOne, plusOneName. Validates token.

**Step 3: Add RSVP form to invitation page**

If `?g=[token]` is present, show RSVP form at bottom with guest name pre-filled. Radio buttons for confirm/decline/maybe. Optional plus-one toggle. Submit button.

If no token, show a generic "Contact the couple to RSVP" message.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add RSVP tracking with public form on invitation page"
```

---

### Task 20: RSVP Dashboard

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`

**Step 1: Add RSVP stats to event dashboard**

Summary cards: total guests, confirmed, declined, maybe, pending. Progress bar. Guest list with RSVP status badges.

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add RSVP stats dashboard for event owners"
```

---

## Phase 9: Email Delivery

### Task 21: Email Service Setup (Resend)

**Files:**
- Create: `server/utils/email.ts`
- Create: `server/api/events/[id]/send-invitations.post.ts`

**Step 1: Install Resend**

```bash
npm install resend
```

**Step 2: Create email utility**

```ts
// server/utils/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendInvitationParams {
  to: string
  guestName: string
  coupleName1: string
  coupleName2: string
  date: string
  invitationUrl: string
}

export async function sendInvitationEmail(params: SendInvitationParams) {
  return resend.emails.send({
    from: 'Eloria <invitations@yourdomain.com>',
    to: params.to,
    subject: `You're invited to ${params.coupleName1} & ${params.coupleName2}'s wedding`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; text-align: center; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #333;">You're Invited!</h1>
        <p style="font-size: 16px; color: #666;">
          Dear ${params.guestName},<br><br>
          ${params.coupleName1} & ${params.coupleName2} would love for you to celebrate their wedding on ${params.date}.
        </p>
        <a href="${params.invitationUrl}" style="display: inline-block; background: #df5676; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-size: 16px;">
          View Invitation & RSVP
        </a>
      </div>
    `,
  })
}
```

**Step 3: Create send invitations API**

`server/api/events/[id]/send-invitations.post.ts` -- requires auth + event ownership + paid status + email delivery tier feature. Fetches guests with email addresses that haven't been sent yet. Sends emails in batches. Updates `emailSentAt` for each guest.

**Step 4: Add "Send Invitations" button to event dashboard**

Only visible if tier has email delivery. Shows count of unsent vs sent.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add email delivery via Resend for guest invitations"
```

---

## Phase 10: AI Integration

### Task 22: AI Wording Generation

**Files:**
- Create: `server/api/ai/generate-wording.post.ts`

**Step 1: Create wording generation API**

```ts
// server/api/ai/generate-wording.post.ts
import { requireAuth } from '~/server/utils/auth'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  const { coupleName1, coupleName2, date, venue, tone } = body

  // tone: 'formal' | 'casual' | 'poetic' | 'funny'

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a wedding invitation copywriter. Generate beautiful invitation wording in the specified tone. Return exactly 3 variations as a JSON object with a "variations" array of strings. Each variation should be 2-4 sentences.`,
      },
      {
        role: 'user',
        content: `Couple: ${coupleName1} & ${coupleName2}. Date: ${date}. Venue: ${venue}. Tone: ${tone || 'formal'}.`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  return JSON.parse(response.choices[0].message.content || '{"variations":[]}')
})
```

**Step 2: Install OpenAI SDK**

```bash
npm install openai
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add AI wording generation via OpenAI"
```

---

## Phase 11: PDF Export

### Task 23: PDF Generation

**Files:**
- Create: `server/api/events/[id]/pdf.get.ts`

**Step 1: Install Puppeteer**

```bash
npm install puppeteer
```

**Step 2: Create PDF generation API**

```ts
// server/api/events/[id]/pdf.get.ts
import puppeteer from 'puppeteer'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = parseInt(getRouterParam(event, 'id')!)

  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  if (!userEvent.tier?.hasPdfExport) {
    throw createError({ statusCode: 403, statusMessage: 'PDF export not available on your plan' })
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  await page.goto(`${process.env.BASE_URL}/i/${userEvent.slug}?print=true`, {
    waitUntil: 'networkidle0',
  })

  const pdf = await page.pdf({
    format: 'A5',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })

  await browser.close()

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${userEvent.slug}.pdf"`,
  })

  return pdf
})
```

**Step 3: Add `?print=true` handling to invitation page**

When `print=true` query param is present, hide RSVP form and any navigation. Render just the invitation content optimized for print/PDF.

**Step 4: Add "Download PDF" button to event dashboard**

Only visible if tier has PDF export.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add PDF export via Puppeteer"
```

---

## Phase 12: Invitation Templates

### Task 24: Create Starter Templates

**Files:**
- Create: `templates/rustic-autumn/template.html`
- Create: `templates/rustic-autumn/styles.css`
- Create: `templates/modern-minimal/template.html`
- Create: `templates/modern-minimal/styles.css`
- Create: `templates/classic-elegant/template.html`
- Create: `templates/classic-elegant/styles.css`
- Create: `server/db/seed-templates.ts`

**Step 1: Create 3 starter templates**

Each template has:
- `template.html`: HTML with `{{coupleName1}}`, `{{coupleName2}}`, `{{date}}`, `{{venue}}`, `{{venueAddress}}`, `{{description}}`, `{{wording}}` placeholders
- `styles.css`: Scoped CSS for the template

Template 1: **Rustic Autumn** -- warm earthy tones, serif fonts, textured background
Template 2: **Modern Minimal** -- clean white, sans-serif, lots of whitespace
Template 3: **Classic Elegant** -- gold accents, script fonts, formal layout

**Step 2: Create template seed script**

Reads template files from filesystem and inserts metadata into the database. Links to the Basic tier (sortOrder 1) for minimumTierId so all tiers can access starter templates.

**Step 3: Run seed**

```bash
npx tsx server/db/seed-templates.ts
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add 3 starter invitation templates with seed script"
```

---

## Phase 13: Polish & Integration Testing

### Task 25: Email Verification Flow

**Files:**
- Create: `server/api/auth/verify.post.ts`
- Create: `server/api/auth/send-verification.post.ts`
- Create: `pages/auth/verify.vue`

**Step 1: Implement email verification**

On registration, send verification email with a signed token link. Verification page validates token and sets `emailVerified: true`.

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add email verification flow"
```

---

### Task 26: Event Dashboard Polish

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`
- Create: `pages/dashboard/events/[id]/settings.vue`

**Step 1: Complete event dashboard**

- Overview tab: invitation preview, RSVP stats, quick actions
- Settings tab: edit event details, change template, update customization
- Share section: copyable invitation link, social sharing buttons

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: polish event dashboard with settings and sharing"
```

---

### Task 27: Error Handling and Loading States

**Files:**
- Create: `components/ui/LoadingSpinner.vue`
- Create: `error.vue`
- Modify: various pages to add loading/error states

**Step 1: Add global error page**

`error.vue` for 404 and other errors.

**Step 2: Add loading states to all pages**

All pages using `useFetch` should show loading spinners while data loads and error messages if requests fail.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add error handling and loading states across all pages"
```

---

### Task 28: SEO and Meta Tags

**Files:**
- Modify: `pages/index.vue`, `pages/pricing.vue`, `pages/templates/index.vue`, `pages/i/[slug].vue`

**Step 1: Add meta tags to all public pages**

Use `useHead()` and `useSeoMeta()` for:
- Title, description
- Open Graph tags (og:title, og:description, og:image)
- Twitter card tags
- Canonical URLs

The invitation page (`/i/[slug]`) should have dynamic OG tags with the couple names and wedding date.

**Step 2: Add `robots.txt` and `sitemap.xml`**

Use Nuxt SEO module or manual server routes.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add SEO meta tags and sitemap"
```

---

## Summary

| Phase | Tasks | Description |
| ----- | ----- | ----------- |
| 1     | 1-3   | Project setup, database schema, seed data |
| 2     | 4-7   | Authentication (API, composable, pages) |
| 3     | 8-10  | Public pages (landing, pricing, templates) |
| 4     | 11-15 | Dashboard and event creation wizard |
| 5     | 16    | Stripe payment integration |
| 6     | 17    | Public invitation page (SSR) |
| 7     | 18    | Guest management (CRUD, CSV import) |
| 8     | 19-20 | RSVP system (form + dashboard) |
| 9     | 21    | Email delivery via Resend |
| 10    | 22    | AI wording generation |
| 11    | 23    | PDF export via Puppeteer |
| 12    | 24    | Starter invitation templates |
| 13    | 25-28 | Polish (verification, error handling, SEO) |

**Total: 28 tasks across 13 phases.**

Each task should take 15-45 minutes. Full implementation estimate: ~3-5 days of focused development.

# Eloria - Wedding Invitation Platform Design

## Product Summary

Eloria is a wedding invitation platform where couples and wedding organizers create, customize, and deliver wedding invitations. Users pay a one-time per-event fee, choose from AI-recommended templates, customize via form fields, and manage guest RSVPs from a dashboard.

**Delivery methods:** shareable link, email delivery, printable PDF.

## Tech Stack

| Layer      | Technology                        |
| ---------- | --------------------------------- |
| Framework  | Nuxt 3 (Vue 3, TypeScript, SSR)  |
| Styling    | Tailwind CSS                      |
| Database   | SQLite + Drizzle ORM              |
| Auth       | Email/password (custom)           |
| Payments   | Stripe (one-time checkout)        |
| Email      | Resend                            |
| AI         | OpenAI API                        |
| PDF        | Puppeteer (server-side HTML→PDF)  |

## Pricing Model

Per-event purchase. Tiers stored in a database table for future flexibility.

| Tier        | Price | Guest Limit | Email Delivery | PDF Export | AI Text | Branding Removed | Multiple Variants |
| ----------- | ----- | ----------- | -------------- | ---------- | ------- | ---------------- | ----------------- |
| **Basic**   | ~$15  | 50          | No             | No         | No      | No               | No                |
| **Premium** | ~$30  | 200         | Yes            | Yes        | Yes     | Yes              | No                |
| **Pro**     | ~$45  | Unlimited   | Yes (priority) | Yes        | Yes     | Yes              | Yes               |

## Data Model

### Tier

| Field                | Type    | Notes                         |
| -------------------- | ------- | ----------------------------- |
| id                   | int PK  |                               |
| name                 | text    | "Basic", "Premium", "Pro"     |
| slug                 | text    | "basic", "premium", "pro"     |
| price                | int     | Price in cents                |
| sortOrder            | int     | For access comparison         |
| guestLimit           | int?    | null = unlimited              |
| hasEmailDelivery     | boolean |                               |
| hasPdfExport         | boolean |                               |
| hasAiTextGeneration  | boolean |                               |
| removeBranding       | boolean |                               |
| hasMultipleVariants  | boolean |                               |
| createdAt            | text    |                               |

### User

| Field          | Type    | Notes                |
| -------------- | ------- | -------------------- |
| id             | int PK  |                      |
| email          | text    | unique               |
| passwordHash   | text    |                      |
| name           | text    |                      |
| emailVerified  | boolean | default false        |
| createdAt      | text    |                      |

### Template

| Field           | Type    | Notes                                      |
| --------------- | ------- | ------------------------------------------ |
| id              | int PK  |                                            |
| name            | text    | Display name                               |
| category        | text    | "rustic", "modern", "elegant", etc.        |
| previewImageUrl | text    | Path to preview image                      |
| htmlTemplate    | text    | HTML template with placeholders            |
| cssTemplate     | text    | Scoped CSS for the template                |
| colorScheme     | text    | JSON array of hex colors                   |
| fontPairings    | text    | JSON array of font pairs                   |
| tags            | text    | JSON array of tags for AI matching         |
| minimumTierId   | int FK  | References Tier. Lowest tier with access   |
| createdAt       | text    |                                            |

### Event

| Field            | Type    | Notes                                  |
| ---------------- | ------- | -------------------------------------- |
| id               | int PK  |                                        |
| userId           | int FK  | References User                        |
| title            | text    | Internal title for dashboard           |
| coupleName1      | text    |                                        |
| coupleName2      | text    |                                        |
| date             | text    | Wedding date                           |
| venue            | text    | Venue name                             |
| venueAddress     | text    |                                        |
| venueMapUrl      | text?   | Google Maps or similar link            |
| description      | text?   | Additional details shown on invitation |
| templateId       | int FK  | References Template                    |
| customization    | text    | JSON: colors, fonts, wording overrides |
| tierId           | int FK  | References Tier (purchased plan)       |
| paymentStatus    | text    | "pending", "paid", "failed"            |
| stripePaymentId  | text?   |                                        |
| slug             | text    | Unique URL slug (maria-and-james)      |
| createdAt        | text    |                                        |

### Guest

| Field          | Type    | Notes                                      |
| -------------- | ------- | ------------------------------------------ |
| id             | int PK  |                                            |
| eventId        | int FK  | References Event                           |
| name           | text    |                                            |
| email          | text?   |                                            |
| phone          | text?   |                                            |
| rsvpStatus     | text    | "pending", "confirmed", "declined", "maybe"|
| plusOne         | boolean | default false                              |
| plusOneName     | text?   |                                            |
| token          | text    | Unique token for guest-specific URL        |
| emailSentAt    | text?   |                                            |
| emailOpenedAt  | text?   |                                            |
| createdAt      | text    |                                            |

### Access Rule

A user can use a template if: `event.tier.sortOrder >= template.minimumTier.sortOrder`

## Invitation Builder (AI-Assisted Template Matching)

Users do not design invitations from scratch. Instead:

1. User enters event details (names, date, venue).
2. Optionally describes their style ("rustic barn wedding, autumn colors, elegant but casual").
3. AI (OpenAI) analyzes the description + event details against template tags/categories.
4. Returns top 3-5 matching templates, ranked by relevance.
5. User picks a template and customizes via form fields:
   - Color palette (from template's options or AI-suggested)
   - Font pairing (from curated set)
   - Invitation wording (AI can generate formal/casual/poetic options)
   - Photo upload (couple photo for hero section)
6. Live preview updates as they customize.
7. User saves, selects tier, pays via Stripe, invitation goes live.

This approach guarantees professional-looking results while still feeling personalized.

## User Flows

### Public Pages (SSR, SEO-optimized)

- **Landing page** (`/`) -- value proposition, template gallery preview, pricing summary, CTA
- **Template gallery** (`/templates`) -- browsable, filterable by category/style
- **Pricing page** (`/pricing`) -- tier comparison table
- **Auth pages** (`/auth/*`) -- sign up, sign in, forgot password, verify email

### Authenticated Dashboard

- **My Events** (`/dashboard`) -- list of user's events with status indicators
- **Create Event** (`/dashboard/events/new`) -- wizard flow (details → AI match → customize → preview → pay)
- **Event Dashboard** (`/dashboard/events/[id]`) -- per-event management:
  - View/edit invitation
  - Guest list management (manual add, CSV import, paste emails)
  - Send invitations via email (batch via Resend)
  - RSVP tracking (confirmed/declined/maybe/pending counts + list)
  - Download PDF

### Guest-Facing Pages (public)

- **Invitation page** (`/i/[slug]`) -- public, single scrollable page
  - Hero section with couple names and date
  - Event details and description
  - Venue with map embed
  - RSVP form at bottom
- **Guest-specific link** (`/i/[slug]?g=[token]`) -- same page but pre-identifies the guest for RSVP tracking

## Project Structure

```
eloria/
├── server/
│   ├── api/
│   │   ├── auth/        # login, register, verify, forgot-password
│   │   ├── events/      # CRUD events, customization
│   │   ├── guests/      # guest management, CSV import
│   │   ├── rsvp/        # public RSVP endpoint (no auth)
│   │   ├── payments/    # Stripe checkout session, webhooks
│   │   ├── ai/          # template recommendation, text generation
│   │   └── pdf/         # PDF generation via Puppeteer
│   ├── db/
│   │   ├── schema.ts    # Drizzle schema definitions
│   │   ├── migrations/
│   │   └── index.ts     # DB connection
│   ├── middleware/       # Auth middleware, rate limiting
│   └── utils/           # Email (Resend), Stripe helpers, AI client
├── pages/
│   ├── index.vue
│   ├── templates/
│   │   └── index.vue
│   ├── pricing.vue
│   ├── auth/
│   │   ├── login.vue
│   │   ├── register.vue
│   │   ├── verify.vue
│   │   └── forgot-password.vue
│   ├── dashboard/
│   │   ├── index.vue
│   │   └── events/
│   │       ├── new.vue
│   │       └── [id]/
│   │           ├── index.vue
│   │           ├── guests.vue
│   │           └── settings.vue
│   └── i/
│       └── [slug].vue
├── components/
│   ├── invitation/      # Template renderer, live preview
│   ├── dashboard/       # Dashboard UI components
│   ├── forms/           # Reusable form components
│   └── ui/              # Buttons, modals, cards (Tailwind)
├── composables/         # useAuth, useEvent, useGuests, etc.
├── templates/           # Invitation HTML/CSS template files
│   ├── rustic-autumn/
│   ├── modern-minimal/
│   └── ...
├── assets/
├── nuxt.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Key Technical Decisions

- **Templates** are HTML/CSS files stored in the filesystem under `templates/`, with metadata in the DB. Nuxt SSR renders them with event data injected.
- **PDF generation** uses Puppeteer to load the invitation page server-side and export to PDF.
- **AI integration** is a server API route that sends event details + template metadata to OpenAI and returns ranked template matches + generated wording options.
- **RSVP** is a public API endpoint that authenticates via the unique guest token (no user auth required).
- **Payments** use Stripe Checkout Sessions for one-time purchases. A webhook confirms payment and activates the event.
- **Email delivery** batches guest emails through Resend with per-guest tracking (sent/opened).

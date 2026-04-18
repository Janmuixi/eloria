# Eloria

Wedding planner / RSVP app. Nuxt 3 + Drizzle (SQLite) + Stripe + Resend.

## Prerequisites

- Node.js 20+
- [Stripe CLI](https://docs.stripe.com/stripe-cli) (local dev only — for forwarding webhooks)
- A Stripe account (test keys for local, live for prod)
- A Resend API key (for transactional email)

## Local development

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable                              | Notes                                                                                         |
|---------------------------------------|-----------------------------------------------------------------------------------------------|
| `DATABASE_URL`                        | `file:./db/eloria.db` for local SQLite                                                        |
| `STRIPE_SECRET_KEY`                   | Stripe **test** secret key                                                                    |
| `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`  | The `whsec_...` value printed by `stripe listen` (set this AFTER first running it — see #4)   |
| `STRIPE_WEBHOOK_SECRET`               | Other Stripe webhook secret (event payments)                                                  |
| `RESEND_API_KEY`                      | From resend.com                                                                               |
| `OPENAI_API_KEY`                      | For AI text generation feature                                                                |
| `JWT_SECRET`                          | Any long random string                                                                        |
| `BASE_URL`                            | `http://localhost:3000`                                                                       |

### 3. Initialize the database

```bash
npm run db:migrate            # creates schema from migrations
npm run db:seed               # seed tiers
npm run db:seed-templates     # seed templates
```

### 4. Run the dev server

In one terminal:

```bash
npm run dev
```

In a second terminal (required for Stripe subscription flows to work locally):

```bash
npm run dev:stripe
```

The first time you run `dev:stripe`, it will print:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx (^C to quit)
```

Copy that `whsec_...` value into `.env` as `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, then restart `npm run dev`. The CLI keeps the same secret across runs as long as you stay logged into the same Stripe account, so this is a one-time step.

### Tests

```bash
npm test                      # one-shot
npm run test:watch            # watch mode
```

## Database migrations

Schema lives in `server/db/schema.ts`. After changing it:

```bash
npm run db:generate           # creates server/db/migrations/NNNN_*.sql
```

Review the generated SQL, commit it, then apply with:

```bash
npm run db:migrate
```

`db:migrate` is idempotent — it tracks applied migrations in a `__drizzle_migrations` table and skips anything already applied. The first run on an existing un-tracked DB will print `[migrate] bootstrapped __drizzle_migrations with N existing entries` and then proceed normally; subsequent runs are quiet no-ops if there's nothing pending.

> **Note:** `server/db/schema.ts` currently uses `text('created_at').default(new Date().toISOString())` which evaluates at module load time. Every `db:generate` produces a fresh literal default, causing drizzle to emit drop+recreate-via-temp-table noise for every existing table. Until that pattern is fixed (use `sql\`CURRENT_TIMESTAMP\`` or `$defaultFn`), review generated migrations carefully — you may need to hand-trim them.

## Production deployment

The production server hosts the app at `/var/www/eloria`, with git tracking `origin/master` and the process managed by pm2 under the name `eloria`.

### Standard deploy (no schema changes)

```bash
cd /var/www/eloria
git pull
npm install
npm run build
pm2 restart eloria
```

### Deploy with schema changes

Run migrations between `npm install` and `pm2 restart`. Back up the DB first.

```bash
cd /var/www/eloria
git pull
cp db/eloria.db db/eloria.db.bak.$(date +%Y-%m-%d)
npm install
npm run db:migrate
npm run build
pm2 restart eloria
```

If the first migrate ever errors with `SQLITE_IOERR_SHORT_READ`, stale WAL files are the culprit:

```bash
rm -f db/eloria.db-wal db/eloria.db-shm
npm run db:migrate
```

### Production environment

Production reads the same env vars as local from `/var/www/eloria/.env`. Differences from local:

- `DATABASE_URL=file:./db/eloria.db` (relative to the cwd pm2 starts the process in)
- `STRIPE_SECRET_KEY` is the **live** key
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` is the secret from the live webhook endpoint configured in Stripe Dashboard → Developers → Webhooks
- `BASE_URL=https://eloria-rsvp.com`
- `NODE_ENV=production`

### Logs

```bash
pm2 logs eloria               # tail
pm2 logs eloria --lines 200 --nostream   # recent history
```

### Stripe webhooks (production)

The live Stripe dashboard must have a webhook endpoint configured at:

```
https://eloria-rsvp.com/api/subscriptions/webhook
```

subscribed to at least these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

If subscriptions aren't appearing in the DB after a successful checkout, check Stripe Dashboard → Developers → Webhooks → your endpoint → recent attempts. Non-2xx responses indicate either a missing/wrong `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` or an app error (check pm2 logs).

## Useful scripts

| Command                       | What it does                                          |
|-------------------------------|-------------------------------------------------------|
| `npm run dev`                 | Nuxt dev server on `localhost:3000`                   |
| `npm run dev:stripe`          | Forward Stripe webhooks to local dev server           |
| `npm run build`               | Production build into `.output/`                      |
| `npm run preview`             | Preview the production build                          |
| `npm test`                    | Run vitest once                                       |
| `npm run db:generate`         | Generate a new SQL migration from schema diffs        |
| `npm run db:migrate`          | Apply pending migrations to the DB (idempotent)       |
| `npm run db:push`             | Push schema directly to DB (dev only — bypasses migrations) |
| `npm run db:seed`             | Seed pricing tiers                                    |
| `npm run db:seed-templates`   | Seed wedding templates                                |

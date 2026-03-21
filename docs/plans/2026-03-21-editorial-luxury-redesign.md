# Editorial Luxury Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Eloria from a generic SaaS look into a luxurious editorial wedding brand with Cormorant Garamond + DM Sans typography and a charcoal/champagne color palette.

**Architecture:** Pure CSS/Tailwind restyling -- no structural or logic changes. Replace the color tokens and font config in Tailwind, then update every page and component to use the new design system. Work foundation-first (config, layout), then public pages, then dashboard.

**Tech Stack:** Tailwind CSS, Google Fonts (Cormorant Garamond + DM Sans), Nuxt 3

**Design doc:** `docs/plans/2026-03-21-editorial-luxury-redesign-design.md`

---

### Task 1: Foundation -- Tailwind Config & Font Setup

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `nuxt.config.ts`
- Modify: `app.vue`

**Step 1: Update `tailwind.config.ts` with new color tokens and font families**

Replace the existing `colors` block with the new charcoal/champagne/ivory palette from the design doc. Add `fontFamily` extending `display` (Cormorant Garamond) and `sans` (DM Sans). Remove the old `primary-*` tokens entirely.

```ts
import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        '1500': '1500ms',
      },
      colors: {
        charcoal: {
          900: '#1a1a1a',
          700: '#3d3d3d',
          500: '#6b6b6b',
          300: '#b0b0b0',
          200: '#e0e0e0',
          100: '#f0f0f0',
        },
        champagne: {
          600: '#b8944f',
          500: '#c9a96e',
          400: '#d4bc8a',
          100: '#faf6ee',
        },
        ivory: {
          50: '#FDFCF9',
          100: '#FAF8F3',
          200: '#F5EFDF',
          300: '#EDE4CC',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
```

**Step 2: Add Google Fonts to `nuxt.config.ts`**

Add a `link` entry in the `app.head` config to load Cormorant Garamond (500,600,700) and DM Sans (400,500,600) from Google Fonts.

```ts
app: {
  head: {
    link: [
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@400;500;600&display=swap',
      },
    ],
  },
},
```

**Step 3: Update `app.vue` background**

Change `bg-ivory-50` if present -- confirm it uses the new token. The value `#FDFCF9` is very close to the existing `#FEFDF9` so this is a subtle change.

**Step 4: Verify fonts load**

Run: `npx nuxi dev` and check the browser. Cormorant Garamond and DM Sans should appear in the Network tab. Add `class="font-sans"` to `app.vue`'s root element to apply DM Sans globally.

**Step 5: Commit**

```bash
git add tailwind.config.ts nuxt.config.ts app.vue
git commit -m "feat(redesign): replace color palette and add editorial fonts"
```

---

### Task 2: Navbar & Footer Restyle

**Files:**
- Modify: `components/ui/Navbar.vue`
- Modify: `components/ui/Footer.vue`

**Step 1: Restyle `Navbar.vue`**

- Logo "Eloria": `font-display font-semibold text-xl text-charcoal-900` (was `text-primary-600 font-bold`)
- Container border: `border-b border-charcoal-200` (was `border-gray-200`)
- Links: `text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:underline` (was `text-gray-600 hover:text-gray-900`)
- CTA button: `bg-champagne-500 text-charcoal-900 rounded-full px-5 py-2 font-medium hover:bg-champagne-600 transition-all duration-200` (was `bg-primary-600 text-white rounded-lg`)
- Mobile menu: same color/font updates
- Replace all `primary-*` and `gray-*` references

**Step 2: Restyle `Footer.vue`**

- Background: `bg-ivory-100 border-t border-charcoal-200` (was `bg-ivory-100 border-ivory-300`)
- Logo: `font-display font-semibold text-charcoal-900`
- Links: `text-charcoal-500 hover:text-charcoal-900 hover:underline`
- Text: `text-charcoal-500`

**Step 3: Verify in browser**

Run dev server, check homepage navbar and footer visually.

**Step 4: Commit**

```bash
git add components/ui/Navbar.vue components/ui/Footer.vue
git commit -m "feat(redesign): restyle navbar and footer with editorial design"
```

---

### Task 3: Auth Pages

**Files:**
- Modify: `pages/auth/login.vue`
- Modify: `pages/auth/register.vue`
- Modify: `layouts/auth.vue`

**Step 1: Update `layouts/auth.vue`**

Add a centered container with ivory-50 background and a subtle decorative champagne element:

```html
<template>
  <div class="min-h-screen bg-ivory-50 flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-md">
      <slot />
    </div>
  </div>
</template>
```

**Step 2: Restyle `login.vue`**

- Card: `bg-ivory-100 rounded-xl p-8 shadow-sm border border-charcoal-200`
- Title "Sign in to Eloria": `font-display font-semibold text-2xl text-charcoal-900`
- Labels: `text-sm font-medium text-charcoal-700`
- Inputs: `border border-charcoal-200 rounded-lg px-4 py-2.5 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20`
- Button: full-width champagne pill `bg-champagne-500 text-charcoal-900 rounded-full font-medium hover:bg-champagne-600`
- Link: `text-champagne-500 hover:text-champagne-600 underline`

**Step 3: Restyle `register.vue`**

Same pattern as login.

**Step 4: Verify in browser**

Navigate to `/auth/login` and `/auth/register`.

**Step 5: Commit**

```bash
git add pages/auth/login.vue pages/auth/register.vue layouts/auth.vue
git commit -m "feat(redesign): restyle auth pages with editorial design"
```

---

### Task 4: Landing Page Redesign

**Files:**
- Modify: `pages/index.vue`

This is the most impactful change. The entire page layout changes from a generic SaaS template to an editorial design.

**Step 1: Rewrite the hero section**

- Remove the carousel entirely
- Centered layout with generous padding `py-28 md:py-36`
- Headline: `font-display font-bold text-5xl md:text-6xl lg:text-7xl text-charcoal-900 tracking-tight`
- Subtitle: `font-sans text-lg text-charcoal-500 max-w-xl mx-auto mt-6`
- Single champagne pill CTA
- Below: grid of 2-3 invitation preview cards at editorial angles or a simple showcase

**Step 2: Rewrite the features section**

- Replace 3-column grid with alternating text+image layout
- Section headings: `font-display font-semibold text-3xl text-charcoal-900`
- Body: `font-sans text-charcoal-500`
- Thin champagne-400 divider lines between sections
- Icon containers: `bg-champagne-100` with champagne-500 colored icons

**Step 3: Rewrite "How it works"**

- Large circled numbers in `font-display`
- Connected by thin champagne-400 line
- Step titles: `font-display font-semibold text-lg`
- Descriptions: `font-sans text-charcoal-500`

**Step 4: Restyle the CTA section**

- `bg-charcoal-900` with `text-ivory-50` heading in Cormorant Garamond
- Champagne pill CTA

**Step 5: Restyle the pricing teaser**

- Heading in Cormorant Garamond, charcoal tones
- Link in champagne-500

**Step 6: Verify in browser**

Full scroll through the landing page.

**Step 7: Commit**

```bash
git add pages/index.vue
git commit -m "feat(redesign): redesign landing page with editorial layout"
```

---

### Task 5: Pricing Page

**Files:**
- Modify: `pages/pricing.vue`

**Step 1: Restyle the pricing page**

- Page title: `font-display font-bold text-4xl text-charcoal-900`
- Subtitle: `font-sans text-charcoal-500`
- Cards: `bg-ivory-100 border border-charcoal-200 rounded-xl p-8`
- Highlighted card: `border-2 border-champagne-500 shadow-lg`
- "Most Popular" badge: `bg-champagne-500 text-charcoal-900 rounded-full text-xs font-semibold px-3 py-1`
- Prices: `font-display font-bold text-4xl text-charcoal-900`
- Feature checkmarks: `text-champagne-500`
- CTA buttons: champagne pill for highlighted, outlined pill for others
- Replace all `primary-*` and `gray-*` references

**Step 2: Verify in browser**

Navigate to `/pricing`.

**Step 3: Commit**

```bash
git add pages/pricing.vue
git commit -m "feat(redesign): restyle pricing page"
```

---

### Task 6: Templates Gallery

**Files:**
- Modify: `pages/templates/index.vue`

**Step 1: Restyle the templates gallery**

- Page title: `font-display font-bold text-4xl text-charcoal-900`
- Filter pills: active `bg-champagne-500 text-charcoal-900 rounded-full`, inactive `bg-charcoal-100 text-charcoal-500 rounded-full`
- Cards: `bg-ivory-100 border border-charcoal-200 rounded-xl overflow-hidden hover:border-champagne-400 hover:shadow-md transition-all duration-200`
- Template names: `font-display font-semibold text-charcoal-900`
- Category badges: keep per-category colors but use `rounded-full`
- Replace all `primary-*` and `gray-*` references

**Step 2: Verify in browser**

Navigate to `/templates`.

**Step 3: Commit**

```bash
git add pages/templates/index.vue
git commit -m "feat(redesign): restyle templates gallery"
```

---

### Task 7: Dashboard Layout

**Files:**
- Modify: `layouts/dashboard.vue`

**Step 1: Restyle the dashboard layout**

- Sidebar: `bg-ivory-100 border-r border-charcoal-200`
- Logo: `font-display font-semibold text-2xl text-charcoal-900`
- Active nav: `bg-champagne-100 border-l-2 border-champagne-500 text-charcoal-900 font-medium`
- Inactive nav: `text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100`
- Header bar: `bg-white border-b border-charcoal-200`
- User name: `text-sm text-charcoal-700`
- Sign out: `text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline`
- Content area: `bg-ivory-50`
- Mobile header/drawer: same updates

**Step 2: Verify in browser**

Log in and check dashboard.

**Step 3: Commit**

```bash
git add layouts/dashboard.vue
git commit -m "feat(redesign): restyle dashboard layout"
```

---

### Task 8: Dashboard Index & Event Cards

**Files:**
- Modify: `pages/dashboard/index.vue`

**Step 1: Restyle the dashboard index**

- Page title "My Events": `font-display font-bold text-2xl text-charcoal-900`
- "Create New Event" link: champagne pill button
- Event cards: `bg-ivory-100 border border-charcoal-200 rounded-xl p-6 hover:border-champagne-400 hover:shadow-sm transition-all duration-200`
- Event titles: `font-display font-semibold text-lg text-charcoal-900`
- Couple names + date: `font-sans text-sm text-charcoal-500`
- Status "Active": `bg-champagne-500 text-charcoal-900 rounded-full px-3 py-1 text-xs font-medium`
- Status "Pending Payment": `bg-charcoal-100 text-charcoal-500 rounded-full px-3 py-1 text-xs font-medium`
- "Manage" link: `text-charcoal-700 hover:text-charcoal-900 font-medium hover:underline`
- Empty state: `text-charcoal-500`, CTA as champagne pill

**Step 2: Verify in browser**

Check dashboard with events.

**Step 3: Commit**

```bash
git add pages/dashboard/index.vue
git commit -m "feat(redesign): restyle dashboard event cards"
```

---

### Task 9: Event Creation Wizard

**Files:**
- Modify: `pages/dashboard/events/new.vue`

**Step 1: Restyle the wizard step indicator**

- Active step: `bg-champagne-500 text-charcoal-900` number circle, `font-display font-semibold`
- Completed step: same as active
- Pending step: `bg-charcoal-200 text-charcoal-500`
- Connecting lines: `bg-champagne-400` for completed, `bg-charcoal-200` for pending

**Step 2: Restyle all form sections (Steps 1, 3)**

- All headings: `font-display font-bold text-2xl text-charcoal-900`
- Subtitles: `font-sans text-charcoal-500`
- Inputs: new input styling from design doc
- Buttons: champagne pills for primary, ghost for back navigation
- Labels: `font-sans text-sm font-medium text-charcoal-700`

**Step 3: Restyle template selection (Step 2)**

- Template cards: `border border-charcoal-200 rounded-xl overflow-hidden hover:border-champagne-400 transition-all`
- Selected card: `border-2 border-champagne-500 ring-2 ring-champagne-500/20`
- Template names: `font-display font-semibold`

**Step 4: Restyle preview (Step 4)**

- Preview wrapper: `border border-champagne-400 rounded-xl overflow-hidden shadow-lg`
- "Looks Good, Continue" button: champagne pill

**Step 5: Restyle payment tier selection (Step 5)**

- Tier cards: same as pricing page pattern
- Price: `font-display font-bold`

**Step 6: Replace all `primary-*` and `gray-*` references in the file**

**Step 7: Verify in browser**

Walk through the entire 5-step wizard.

**Step 8: Commit**

```bash
git add pages/dashboard/events/new.vue
git commit -m "feat(redesign): restyle event creation wizard"
```

---

### Task 10: Event Detail, Guests, Settings & Success Pages

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`
- Modify: `pages/dashboard/events/[id]/guests.vue`
- Modify: `pages/dashboard/events/[id]/settings.vue`
- Modify: `pages/dashboard/events/[id]/success.vue`

**Step 1: Restyle event detail page**

- Event title: `font-display font-bold text-2xl text-charcoal-900`
- Info text: `font-sans text-charcoal-500`
- Status badge: champagne/charcoal pills
- Preview wrapper: `border border-champagne-400 rounded-xl`
- Stats cards: `bg-ivory-100 border border-charcoal-200 rounded-xl`
- Tab navigation: active `border-b-2 border-champagne-500 text-charcoal-900`, inactive `text-charcoal-500`
- Danger zone: keep red accents but use `rounded-full` for delete button, `font-sans`

**Step 2: Restyle guests page**

- Table headers: `font-sans font-medium text-charcoal-700`
- Table rows: `border-b border-charcoal-200`
- RSVP badges: keep semantic colors (green/red/yellow) but use `rounded-full` pill shape
- Add guest form: new input styling

**Step 3: Restyle settings page**

- Form inputs: new styling
- Buttons: champagne pills
- Section headings: `font-display font-semibold`

**Step 4: Restyle success page**

- Title: `font-display font-bold text-2xl text-charcoal-900`
- Success icon container: `bg-champagne-100`
- Success icon: `text-champagne-500`
- CTA: champagne pill

**Step 5: Verify in browser**

Navigate through each sub-page.

**Step 6: Commit**

```bash
git add pages/dashboard/events/
git commit -m "feat(redesign): restyle event detail, guests, settings, and success pages"
```

---

### Task 11: Loading Spinner & Error Page

**Files:**
- Modify: `components/ui/LoadingSpinner.vue`
- Modify: `error.vue`

**Step 1: Update spinner colors**

- Border: `border-champagne-500` (was `border-primary-600`)
- Background ring: `border-charcoal-200`

**Step 2: Restyle error page**

- Use `font-display` for heading, `font-sans` for body
- Replace any `primary-*` or `gray-*` references

**Step 3: Commit**

```bash
git add components/ui/LoadingSpinner.vue error.vue
git commit -m "feat(redesign): restyle spinner and error page"
```

---

### Task 12: Final Verification & Cleanup

**Step 1: Search for stale color references**

Run: `grep -rn 'primary-\|bg-gray-\|text-gray-\|border-gray-' pages/ components/ layouts/ app.vue`

Fix any remaining old color references.

**Step 2: Full visual walkthrough**

Navigate every route in the browser:
- `/` (landing)
- `/pricing`
- `/templates`
- `/auth/login`
- `/auth/register`
- `/dashboard`
- `/dashboard/events/new` (all 5 steps)
- `/dashboard/events/:id`
- `/dashboard/events/:id/guests`
- `/dashboard/events/:id/settings`
- `/dashboard/events/:id/success`

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "feat(redesign): final cleanup of stale color references"
```

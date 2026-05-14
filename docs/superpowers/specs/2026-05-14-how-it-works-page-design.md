# How It Works — public marketing page

## Goal

Add a public `/how-it-works` page that walks visitors through the five steps of
the event creation wizard using real screenshots. Help prospective couples see
what they're signing up for before they register, and give the existing landing
page a deeper place to link to.

## Scope

In scope:

- A new public page at `/how-it-works` (and `/es/how-it-works` for Spanish).
- A navbar link visible on every public page.
- Five step-by-step sections backed by screenshots captured from the running
  dev server.
- Full i18n coverage (en + es) following the patterns already used on
  `pages/index.vue` and `pages/pricing.vue`.

Out of scope:

- Changes to the actual event creation wizard or any of the screenshots'
  source pages.
- Rewriting the brief 3-step "How It Works" section on the landing page.
- FAQ, testimonials, comparison tables, video walkthroughs, animation, or
  interactive demos.
- A separate page for the guest-facing RSVP flow (could be a follow-up).

## Page layout — editorial zigzag

```
┌───────────────────────────────────────────┐
│                  HERO                     │  centered title + subtitle + CTA
├───────────────────────────────────────────┤
│  [screenshot]    │   Step 1 — Details     │  image left, copy right
├───────────────────────────────────────────┤
│  Step 2 — Template │   [screenshot]       │  image right, copy left
├───────────────────────────────────────────┤
│  [screenshot]    │   Step 3 — Customize   │  image left, copy right
├───────────────────────────────────────────┤
│  Step 4 — Preview │   [screenshot]        │  image right, copy left
├───────────────────────────────────────────┤
│  [screenshot]    │   Step 5 — Publish     │  image left, copy right
├───────────────────────────────────────────┤
│              CLOSING CTA BAND             │  dark panel + Register button
└───────────────────────────────────────────┘
```

On mobile (`< md`), every section collapses to a single column with the
screenshot stacked above its copy block.

### Step copy

| # | Eyebrow | Title                                    | Body                                                                                                                                                            |
|---|---------|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Step 1  | Tell us about the day                    | Couple names, date, venue. Optionally let guests pick a menu or share allergies — those choices flow straight into their RSVP.                                  |
| 2 | Step 2  | Pick a template, or upload your own      | Describe your style and let AI surface the templates that fit. Or skip ahead and upload a design you already have.                                              |
| 3 | Step 3  | Make the words yours                     | Write the wording, or let AI generate variations in your chosen tone — formal, casual, poetic, funny. The live preview updates as you type.                     |
| 4 | Step 4  | See exactly what guests will see         | Review the finished invitation in full before anything is published. Step back and tweak if anything feels off.                                                 |
| 5 | Step 5  | Publish and share                        | Pick a plan that fits your event size, then send invites by link, email, or PDF — and track RSVPs from your dashboard.                                          |

The bodies above are the canonical English copy. Spanish translations are
produced from these in the i18n file (see "i18n keys" below).

## Files to add or modify

### New

- `pages/how-it-works.vue` — page component, uses the default layout
  (Navbar + Footer).
- `public/images/how-it-works/step-1-details.jpg`
- `public/images/how-it-works/step-2-templates.jpg`
- `public/images/how-it-works/step-3-customize.jpg`
- `public/images/how-it-works/step-4-preview.jpg`
- `public/images/how-it-works/step-5-publish.jpg`

The five screenshots already exist at the project root from the brainstorming
session (`flow-01-step1-filled.png`, `flow-02-step2-templates.png`,
`flow-03-step3-customize-filled.png`, `flow-04-step4-preview.png`,
`flow-05-step5-payment.png`). They are not committed. The implementer converts
each to JPEG quality 85 via a one-shot `tsx`/`sharp` invocation, writes the
output under `public/images/how-it-works/`, then deletes the source PNGs.
Only the JPEGs are committed.

### Modified

- `components/ui/Navbar.vue` — add a "How it works" link in the desktop nav
  (between Templates and Pricing) and the mobile menu.
- `i18n/lang/en.json` — add `nav.howItWorks` and the `howItWorks.*` namespace.
- `i18n/lang/es.json` — same keys in Spanish.

## Page component (`pages/how-it-works.vue`)

Single Vue file, mirrors the patterns already in `pages/index.vue` and
`pages/pricing.vue`:

```vue
<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: t('howItWorks.seoTitle'),
  description: t('howItWorks.seoDescription'),
  ogTitle: t('howItWorks.seoTitle'),
  ogDescription: t('howItWorks.seoDescription'),
  ogType: 'website',
  twitterTitle: t('howItWorks.seoTitle'),
  twitterDescription: t('howItWorks.seoDescription'),
})

const steps = computed(() => [
  { n: 1, image: '/images/how-it-works/step-1-details.jpg',   alt: t('howItWorks.steps.1.alt') },
  { n: 2, image: '/images/how-it-works/step-2-templates.jpg', alt: t('howItWorks.steps.2.alt') },
  { n: 3, image: '/images/how-it-works/step-3-customize.jpg', alt: t('howItWorks.steps.3.alt') },
  { n: 4, image: '/images/how-it-works/step-4-preview.jpg',   alt: t('howItWorks.steps.4.alt') },
  { n: 5, image: '/images/how-it-works/step-5-publish.jpg',   alt: t('howItWorks.steps.5.alt') },
])
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-20 md:py-28">…</section>

    <!-- Five zigzag sections -->
    <section v-for="step in steps" :key="step.n" class="py-12 md:py-20">
      <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <!-- Image column: order swaps for even-numbered steps on md+ -->
        <div :class="step.n % 2 === 0 ? 'md:order-2' : ''">…</div>
        <!-- Copy column -->
        <div :class="step.n % 2 === 0 ? 'md:order-1' : ''">
          <span class="text-xs uppercase tracking-widest text-champagne-600">
            {{ $t('howItWorks.stepEyebrow', { n: step.n }) }}
          </span>
          <h2>{{ $t(`howItWorks.steps.${step.n}.title`) }}</h2>
          <p>{{ $t(`howItWorks.steps.${step.n}.body`) }}</p>
        </div>
      </div>
    </section>

    <!-- Closing CTA band -->
    <section class="bg-charcoal-900 py-20 md:py-28">…</section>
  </div>
</template>
```

Tailwind tokens come from the existing palette already in use on the landing
(`champagne-*`, `charcoal-*`, `ivory-*`, `font-display`). No new design tokens.

### Image presentation

Each screenshot is wrapped in a `rounded-2xl border border-charcoal-100 shadow-lg overflow-hidden` div, with the `<img>` set to `w-full h-auto`. Lazy-load attributes (`loading="lazy" decoding="async"`) on every image except step 1, which sits inside the first scroll viewport.

## i18n keys

Added under each locale file. Sample English entries (`i18n/lang/en.json`):

```json
{
  "nav": {
    "howItWorks": "How it works"
  },
  "howItWorks": {
    "seoTitle": "How Eloria works — Eloria",
    "seoDescription": "See exactly how Eloria turns your event details into a beautiful invitation in five short steps.",
    "heroTitle": "From idea to invitation in five steps",
    "heroSubtitle": "Eloria walks you through every part of creating a wedding invitation — design, wording, preview, and sending.",
    "heroCta": "Start creating",
    "stepEyebrow": "Step {n}",
    "steps": {
      "1": { "title": "Tell us about the day", "body": "Couple names, date, venue. Optionally let guests pick a menu or share allergies — those choices flow straight into their RSVP.", "alt": "Event details form with couple names, date, and venue filled in" },
      "2": { "title": "Pick a template, or upload your own", "body": "Describe your style and let AI surface the templates that fit. Or skip ahead and upload a design you already have.", "alt": "Template gallery showing AI-recommended designs alongside the full template grid" },
      "3": { "title": "Make the words yours", "body": "Write the wording, or let AI generate variations in your chosen tone — formal, casual, poetic, funny. The live preview updates as you type.", "alt": "Customization screen with invitation wording on the left and a live preview on the right" },
      "4": { "title": "See exactly what guests will see", "body": "Review the finished invitation in full before anything is published. Step back and tweak if anything feels off.", "alt": "Preview of the finished invitation rendered in the chosen template" },
      "5": { "title": "Publish and share", "body": "Pick a plan that fits your event size, then send invites by link, email, or PDF — and track RSVPs from your dashboard.", "alt": "Plan selection screen with single-event tiers and a Pro subscription upsell" }
    },
    "closingTitle": "Invite with intention",
    "closingSubtitle": "Create your first invitation in a few minutes — no design experience needed.",
    "closingCta": "Get started free"
  }
}
```

Spanish strings live under the same keys in `i18n/lang/es.json`.

## Navbar change

In `components/ui/Navbar.vue`, insert one extra `NuxtLinkLocale` in two places:

- Desktop nav (the `<div class="hidden md:flex items-center gap-8">` block):
  insert **between** the Templates and Pricing links.
- Mobile menu: insert in the same relative position inside the mobile
  hamburger panel.

Both links use the same styling as their siblings (`text-sm font-medium
text-charcoal-700 ...`) and point to `/how-it-works`.

## Build steps the implementer will run

1. Write a one-shot conversion script (or inline `tsx` command) that reads the
   five `flow-*.png` files at the repo root, converts each to JPEG quality 85
   with `sharp`, and writes the output to
   `public/images/how-it-works/step-N-*.jpg`. After conversion, delete the
   source PNGs so the repo isn't left with two copies.
2. Build the page, the navbar entry, and the i18n keys.
3. Run `npm run dev`, walk the page in `en` and `es`, screenshot the live page
   on desktop (1280px) and a small mobile viewport (390px) to verify the
   editorial zigzag and the stacked-mobile fallback both render correctly.

## Acceptance

- Visiting `http://localhost:3000/how-it-works` shows the hero, the five
  zigzag step sections (with screenshots), and the closing CTA.
- Visiting `http://localhost:3000/es/how-it-works` shows the same page fully
  translated.
- The Navbar shows a "How it works" link on desktop and inside the mobile
  hamburger menu, on every public page.
- The page is usable without horizontal scroll at 390px wide; image and copy
  stack cleanly.
- No new TypeScript errors and no console errors when navigating to the page
  in either locale.

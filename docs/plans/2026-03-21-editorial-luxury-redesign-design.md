# Editorial Luxury Redesign -- Design Document

**Date:** 2026-03-21
**Goal:** Transform Eloria from a generic SaaS template into a luxurious, editorial wedding brand inspired by Zola's confident typography and premium feel.
**Scope:** Full rebrand -- every page and component.

## Typography

Google Fonts (free):

| Role | Font | Weights | Usage |
|---|---|---|---|
| Display/Headings | Cormorant Garamond | 500, 600, 700 | h1-h3, hero, section titles, logo, prices |
| Body/UI | DM Sans | 400, 500, 600 | Body, buttons, nav, labels, badges, forms |

Load via `@nuxtjs/google-fonts` or a `<link>` in `nuxt.config.ts`. Extend Tailwind `fontFamily` with `display` (Cormorant Garamond) and `sans` (DM Sans).

## Color Palette

Replace the steel-blue `primary-*` and adjust `ivory-*` tokens in `tailwind.config.ts`:

| Token | Hex | Role |
|---|---|---|
| `charcoal-900` | `#1a1a1a` | Primary text, headings |
| `charcoal-700` | `#3d3d3d` | Secondary text |
| `charcoal-500` | `#6b6b6b` | Muted text, placeholders |
| `charcoal-300` | `#b0b0b0` | Disabled text |
| `charcoal-200` | `#e0e0e0` | Borders, dividers |
| `charcoal-100` | `#f0f0f0` | Subtle backgrounds |
| `champagne-600` | `#b8944f` | Accent hover/pressed |
| `champagne-500` | `#c9a96e` | Primary accent -- CTAs, links, active states |
| `champagne-400` | `#d4bc8a` | Light accent (borders, highlights) |
| `champagne-100` | `#faf6ee` | Accent background tint |
| `ivory-50` | `#FDFCF9` | Page background |
| `ivory-100` | `#FAF8F3` | Card/elevated surfaces |

Remove all `primary-*` tokens. Replace all Tailwind `gray-*` usage in the codebase with appropriate `charcoal-*` tokens.

## Button Styles

| Variant | Classes |
|---|---|
| Primary | `bg-champagne-500 text-charcoal-900 font-medium rounded-full px-6 py-2.5 hover:bg-champagne-600 transition-all duration-200 hover:scale-[1.02]` |
| Secondary | `border border-charcoal-900 text-charcoal-900 font-medium rounded-full px-6 py-2.5 hover:bg-charcoal-100 transition-all duration-200` |
| Ghost | `text-charcoal-700 underline hover:text-charcoal-900 transition-colors` |
| Disabled | `opacity-50 cursor-not-allowed` (applied to any variant) |

## Form Inputs

```
w-full border border-charcoal-200 rounded-lg px-4 py-2.5 font-sans text-charcoal-900
placeholder:text-charcoal-500
focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none
transition-colors
```

## Navbar

- `bg-white border-b border-charcoal-200`
- Logo: "Eloria" in `font-display font-semibold text-xl text-charcoal-900`
- Links: `font-sans font-medium text-sm text-charcoal-700 hover:text-charcoal-900 hover:underline`
- CTA: primary pill button
- Mobile: hamburger with slide-out drawer (restyle existing pattern)

## Landing Page (`pages/index.vue`)

### Hero
- Remove carousel, replace with static editorial layout
- Centered, generous padding: `py-28 md:py-36`
- Headline: Cormorant Garamond 700, `text-5xl md:text-6xl lg:text-7xl text-charcoal-900 tracking-tight`
- Copy: "Your Wedding, Beautifully Invited"
- Subtitle: DM Sans 400, `text-lg text-charcoal-500 max-w-xl mx-auto mt-6`
- Single champagne pill CTA below
- Below hero: full-width showcase of 2-3 invitation template previews in an editorial grid

### Features
- Alternating text+image layout (not 3-column grid)
- Section headings: Cormorant Garamond 600, `text-3xl`
- Thin `champagne-400` divider lines between sections
- Generous spacing: `py-20 md:py-28`

### How It Works
- Horizontal 3-step layout
- Large circled numbers in Cormorant Garamond
- Connected by thin champagne-400 line
- Step titles: Cormorant Garamond 600
- Descriptions: DM Sans 400

### CTA Section
- `bg-charcoal-900` dark section with `text-ivory-50` headings
- Champagne pill CTA that inverts: `bg-champagne-500 text-charcoal-900`

### Footer
- `bg-ivory-100 border-t border-charcoal-200`
- Logo + minimal links in DM Sans 400
- Understated

## Auth Pages (`login.vue`, `register.vue`)

- Centered card: `bg-ivory-100 rounded-xl p-8 shadow-sm border border-charcoal-200`
- Title: Cormorant Garamond 600
- Inputs: standard form input styling above
- Submit: full-width champagne pill
- Subtle decorative champagne ornament (thin line or small SVG) for brand identity

## Dashboard Layout (`layouts/dashboard.vue`)

- Sidebar: `bg-ivory-100` with logo in Cormorant Garamond
- Active nav: `bg-champagne-100 border-l-2 border-champagne-500 text-charcoal-900`
- Inactive nav: `text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100`
- Header bar: clean DM Sans, charcoal tones
- Content: `bg-ivory-50`

## Dashboard Event Cards

- `bg-ivory-100 border border-charcoal-200 rounded-xl p-6`
- Event title: Cormorant Garamond 600
- Status badge "Active": `bg-champagne-500 text-charcoal-900 rounded-full px-3 py-1 text-xs font-medium`
- Status badge "Pending": `bg-charcoal-100 text-charcoal-500 rounded-full px-3 py-1 text-xs font-medium`
- Hover: `hover:border-champagne-400 hover:shadow-sm transition-all duration-200`

## Pricing Page

- 3-column card grid
- Highlighted tier: `border-2 border-champagne-500 shadow-lg`
- Default tier: `border border-charcoal-200`
- "Most Popular": `bg-champagne-500 text-charcoal-900 rounded-full text-xs font-semibold px-3 py-1`
- Prices: Cormorant Garamond 700, large size
- Feature checkmarks: champagne-500 color

## Templates Gallery

- Cards: `rounded-xl hover:shadow-md transition-all duration-200`
- Template name: Cormorant Garamond 600
- Filter pills: active `bg-champagne-500 text-charcoal-900 rounded-full`, inactive `bg-charcoal-100 text-charcoal-500 rounded-full`

## Event Wizard (`pages/dashboard/events/new.vue`)

- Step indicator: champagne-500 for active/completed, charcoal-200 for pending
- Step numbers: Cormorant Garamond
- Form styling matches auth pages
- Preview card border: `border-champagne-400`

## Event Detail Page

- Event title: Cormorant Garamond 600
- Status badge: same as dashboard cards
- Invitation preview wrapper: `border border-champagne-400 rounded-xl`
- Stats cards: `bg-ivory-100 border border-charcoal-200 rounded-xl`

## Global Micro-interactions

- Links: underline style (editorial convention)
- Buttons: `transition-all duration-200`, subtle `hover:scale-[1.02]` on primary
- Cards: `transition-all duration-200` on hover border/shadow
- Focus states: champagne ring throughout

## Files to Modify

1. `tailwind.config.ts` -- new color tokens, font families
2. `nuxt.config.ts` -- Google Fonts integration
3. `app.vue` -- background color update
4. `components/ui/Navbar.vue` -- full restyle
5. `components/ui/Footer.vue` -- full restyle
6. `layouts/default.vue` -- minor
7. `layouts/dashboard.vue` -- sidebar restyle
8. `layouts/auth.vue` -- add minimal decorative chrome
9. `pages/index.vue` -- full landing page redesign
10. `pages/pricing.vue` -- color/typography swap
11. `pages/templates/index.vue` -- color/typography swap
12. `pages/auth/login.vue` -- restyle
13. `pages/auth/register.vue` -- restyle
14. `pages/dashboard/index.vue` -- card restyle
15. `pages/dashboard/events/new.vue` -- wizard restyle
16. `pages/dashboard/events/[id]/index.vue` -- detail page restyle
17. `pages/dashboard/events/[id]/success.vue` -- minor restyle
18. `pages/dashboard/events/[id]/guests.vue` -- table restyle
19. `pages/dashboard/events/[id]/settings.vue` -- form restyle
20. `components/ui/LoadingSpinner.vue` -- color update

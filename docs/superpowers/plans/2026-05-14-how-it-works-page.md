# How It Works Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public `/how-it-works` marketing page that walks visitors through the five steps of the event creation wizard using real screenshots, bilingual in English and Spanish, linked from the navbar.

**Architecture:** Single Vue page using the default layout (Navbar + Footer) and Tailwind utilities already in the design system (`champagne-*`, `charcoal-*`, `ivory-*`). Five alternating zigzag sections drive off a small `steps` array; layout collapses to a single column on `< md`. All copy lives behind `useI18n()` keys (en + es). Images served as JPEGs from `public/images/how-it-works/` after one-time conversion from PNGs captured in the prior brainstorming session.

**Tech Stack:** Nuxt 3, Vue 3 `<script setup>`, `@nuxtjs/i18n` (`prefix_except_default` strategy), Tailwind via `@nuxtjs/tailwindcss`, `sharp` (already a dependency) for the one-shot image conversion.

**Reference spec:** `docs/superpowers/specs/2026-05-14-how-it-works-page-design.md`

**Verification approach:** This project has no Vue/page test infrastructure — the existing public pages (`pages/index.vue`, `pages/pricing.vue`) ship without unit tests. Verification is done by running the dev server, visiting both locale URLs, and confirming the rendered output (desktop and mobile) matches the spec. Each task ends with concrete verification commands or browser checks before committing.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `public/images/how-it-works/step-1-details.jpg` | Create | Step 1 screenshot, JPEG q85 |
| `public/images/how-it-works/step-2-templates.jpg` | Create | Step 2 screenshot, JPEG q85 |
| `public/images/how-it-works/step-3-customize.jpg` | Create | Step 3 screenshot, JPEG q85 |
| `public/images/how-it-works/step-4-preview.jpg` | Create | Step 4 screenshot, JPEG q85 |
| `public/images/how-it-works/step-5-publish.jpg` | Create | Step 5 screenshot, JPEG q85 |
| `i18n/lang/en.json` | Modify | Add `nav.howItWorks` + `howItWorks.*` namespace |
| `i18n/lang/es.json` | Modify | Same in Spanish |
| `pages/how-it-works.vue` | Create | The page itself |
| `components/ui/Navbar.vue` | Modify | Add the "How it works" link in desktop + mobile menus |

Source PNGs at repo root (`flow-00-landing.png`, `flow-01-step1-filled.png`, `flow-01-step1-empty.png`, `flow-02-step2-templates.png`, `flow-02-step2-template-selected.png`, `flow-03-step3-customize-empty.png`, `flow-03-step3-customize-filled.png`, `flow-03-step3-ai-variations.png`, `flow-04-step4-preview.png`, `flow-05-step5-payment.png`) are consumed by Task 1 and then deleted; they never get committed.

---

### Task 1: Convert source screenshots to JPEG and place under `public/`

**Files:**
- Create: `public/images/how-it-works/step-1-details.jpg`
- Create: `public/images/how-it-works/step-2-templates.jpg`
- Create: `public/images/how-it-works/step-3-customize.jpg`
- Create: `public/images/how-it-works/step-4-preview.jpg`
- Create: `public/images/how-it-works/step-5-publish.jpg`
- Delete: `flow-00-landing.png`, `flow-01-step1-empty.png`, `flow-01-step1-filled.png`, `flow-02-step2-templates.png`, `flow-02-step2-template-selected.png`, `flow-03-step3-customize-empty.png`, `flow-03-step3-customize-filled.png`, `flow-03-step3-ai-variations.png`, `flow-04-step4-preview.png`, `flow-05-step5-payment.png` (all at repo root)

- [ ] **Step 1: Verify source PNGs exist at the repo root**

Run:

```bash
ls flow-01-step1-filled.png flow-02-step2-templates.png flow-03-step3-customize-filled.png flow-04-step4-preview.png flow-05-step5-payment.png
```

Expected: all five filenames listed, no `No such file` errors.

If any are missing, stop and capture them via Playwright before proceeding (the brainstorming session already produced them — they should be present).

- [ ] **Step 2: Make the output directory**

Run:

```bash
mkdir -p public/images/how-it-works
```

Expected: command returns silently, directory exists.

- [ ] **Step 3: Convert each PNG to JPEG quality 85 with `sharp`**

Run this as a one-shot `tsx` invocation from the repo root (no script file is committed):

```bash
npx tsx -e '
import sharp from "sharp"

const pairs: [string, string][] = [
  ["flow-01-step1-filled.png",       "public/images/how-it-works/step-1-details.jpg"],
  ["flow-02-step2-templates.png",    "public/images/how-it-works/step-2-templates.jpg"],
  ["flow-03-step3-customize-filled.png", "public/images/how-it-works/step-3-customize.jpg"],
  ["flow-04-step4-preview.png",      "public/images/how-it-works/step-4-preview.jpg"],
  ["flow-05-step5-payment.png",      "public/images/how-it-works/step-5-publish.jpg"],
]

for (const [src, dest] of pairs) {
  await sharp(src).jpeg({ quality: 85, mozjpeg: true }).toFile(dest)
  console.log(`wrote ${dest}`)
}
'
```

Expected output:
```
wrote public/images/how-it-works/step-1-details.jpg
wrote public/images/how-it-works/step-2-templates.jpg
wrote public/images/how-it-works/step-3-customize.jpg
wrote public/images/how-it-works/step-4-preview.jpg
wrote public/images/how-it-works/step-5-publish.jpg
```

- [ ] **Step 4: Verify the output JPEGs exist and are reasonably sized**

Run:

```bash
ls -la public/images/how-it-works/
```

Expected: five `.jpg` files, each roughly 50–250 KB (PNG screenshots compress well as JPEG q85).

- [ ] **Step 5: Delete all source PNGs from the repo root**

Run:

```bash
rm -f flow-00-landing.png flow-01-step1-empty.png flow-01-step1-filled.png flow-02-step2-templates.png flow-02-step2-template-selected.png flow-03-step3-customize-empty.png flow-03-step3-customize-filled.png flow-03-step3-ai-variations.png flow-04-step4-preview.png flow-05-step5-payment.png
```

Expected: silent. Confirm with `ls flow-*.png 2>&1` — should print `No such file or directory` (or just nothing if shell suppresses).

- [ ] **Step 6: Commit the JPEGs**

```bash
git add public/images/how-it-works/
git status
```

Expected `git status`: shows the five new JPEGs under `public/images/how-it-works/` staged, and no other changes.

```bash
git commit -m "feat(how-it-works): add wizard step screenshots"
```

---

### Task 2: Add `howItWorks` i18n namespace and `nav.howItWorks` key (English)

**Files:**
- Modify: `i18n/lang/en.json`

- [ ] **Step 1: Add `howItWorks` to the `nav` block**

Edit `i18n/lang/en.json`. Find:

```json
  "nav": {
    "templates": "Templates",
    "pricing": "Pricing",
    "dashboard": "Dashboard",
    "signIn": "Sign in",
    "signOut": "Sign out",
    "getStarted": "Get Started",
    "myAccount": "My Account"
  },
```

Replace with:

```json
  "nav": {
    "templates": "Templates",
    "howItWorks": "How it works",
    "pricing": "Pricing",
    "dashboard": "Dashboard",
    "signIn": "Sign in",
    "signOut": "Sign out",
    "getStarted": "Get Started",
    "myAccount": "My Account"
  },
```

- [ ] **Step 2: Add the `howItWorks` top-level namespace**

Insert the following block **immediately after** the closing `}` of the existing `"landing": { ... }` block (keep alphabetical-ish neighbours: it lives between `landing` and the next sibling). Add a trailing comma to the line that previously ended with `}` if needed.

```json
  "howItWorks": {
    "seoTitle": "How Eloria works — Eloria",
    "seoDescription": "See exactly how Eloria turns your event details into a beautiful invitation in five short steps.",
    "heroTitle": "From idea to invitation in five steps",
    "heroSubtitle": "Eloria walks you through every part of creating a wedding invitation — design, wording, preview, and sending.",
    "heroCta": "Start creating",
    "stepEyebrow": "Step {n}",
    "steps": {
      "1": {
        "title": "Tell us about the day",
        "body": "Couple names, date, venue. Optionally let guests pick a menu or share allergies — those choices flow straight into their RSVP.",
        "alt": "Event details form with couple names, date, and venue filled in"
      },
      "2": {
        "title": "Pick a template, or upload your own",
        "body": "Describe your style and let AI surface the templates that fit. Or skip ahead and upload a design you already have.",
        "alt": "Template gallery showing AI-recommended designs alongside the full template grid"
      },
      "3": {
        "title": "Make the words yours",
        "body": "Write the wording, or let AI generate variations in your chosen tone — formal, casual, poetic, funny. The live preview updates as you type.",
        "alt": "Customization screen with invitation wording on the left and a live preview on the right"
      },
      "4": {
        "title": "See exactly what guests will see",
        "body": "Review the finished invitation in full before anything is published. Step back and tweak if anything feels off.",
        "alt": "Preview of the finished invitation rendered in the chosen template"
      },
      "5": {
        "title": "Publish and share",
        "body": "Pick a plan that fits your event size, then send invites by link, email, or PDF — and track RSVPs from your dashboard.",
        "alt": "Plan selection screen with single-event tiers and a Pro subscription upsell"
      }
    },
    "closingTitle": "Invite with intention",
    "closingSubtitle": "Create your first invitation in a few minutes — no design experience needed.",
    "closingCta": "Get started free"
  },
```

- [ ] **Step 3: Validate the JSON parses**

Run:

```bash
node -e 'JSON.parse(require("fs").readFileSync("i18n/lang/en.json","utf8")); console.log("ok")'
```

Expected: `ok`.

If it prints a `SyntaxError`, fix the trailing-comma or brace problem and re-run before moving on.

- [ ] **Step 4: Confirm key paths resolve as expected**

Run:

```bash
node -e '
const j = JSON.parse(require("fs").readFileSync("i18n/lang/en.json","utf8"));
console.log(j.nav.howItWorks);
console.log(j.howItWorks.heroTitle);
console.log(j.howItWorks.steps["3"].title);
'
```

Expected output, exactly:
```
How it works
From idea to invitation in five steps
Make the words yours
```

- [ ] **Step 5: Commit**

```bash
git add i18n/lang/en.json
git commit -m "feat(i18n): add english how-it-works keys"
```

---

### Task 3: Add the same keys in Spanish

**Files:**
- Modify: `i18n/lang/es.json`

- [ ] **Step 1: Add `howItWorks` to the `nav` block**

Edit `i18n/lang/es.json`. Find:

```json
  "nav": {
    "templates": "Plantillas",
    "pricing": "Precios",
    "dashboard": "Dashboard",
    "signIn": "Iniciar sesión",
    "signOut": "Cerrar sesión",
    "getStarted": "Comenzar",
    "myAccount": "Mi cuenta"
  },
```

Replace with:

```json
  "nav": {
    "templates": "Plantillas",
    "howItWorks": "Cómo funciona",
    "pricing": "Precios",
    "dashboard": "Dashboard",
    "signIn": "Iniciar sesión",
    "signOut": "Cerrar sesión",
    "getStarted": "Comenzar",
    "myAccount": "Mi cuenta"
  },
```

- [ ] **Step 2: Add the `howItWorks` top-level namespace**

Insert this block **immediately after** the closing `}` of the existing `"landing": { ... }` block in `i18n/lang/es.json` (mirror the position used in `en.json`):

```json
  "howItWorks": {
    "seoTitle": "Cómo funciona Eloria — Eloria",
    "seoDescription": "Descubre cómo Eloria convierte los detalles de tu evento en una invitación preciosa en cinco pasos sencillos.",
    "heroTitle": "De la idea a la invitación en cinco pasos",
    "heroSubtitle": "Eloria te acompaña en cada parte de la creación de una invitación de boda: diseño, texto, vista previa y envío.",
    "heroCta": "Empieza a crear",
    "stepEyebrow": "Paso {n}",
    "steps": {
      "1": {
        "title": "Cuéntanos sobre el gran día",
        "body": "Nombres de la pareja, fecha y lugar. Si quieres, deja que los invitados elijan menú o indiquen alergias; sus respuestas llegan directamente con su confirmación.",
        "alt": "Formulario de detalles del evento con los nombres, la fecha y el lugar rellenados"
      },
      "2": {
        "title": "Elige una plantilla o sube la tuya",
        "body": "Describe tu estilo y deja que la IA te sugiera las plantillas que mejor encajan. O salta este paso y sube un diseño que ya tengas.",
        "alt": "Galería de plantillas con las recomendaciones de IA junto al resto de diseños disponibles"
      },
      "3": {
        "title": "Haz que las palabras sean tuyas",
        "body": "Escribe el texto o deja que la IA genere variaciones en el tono que elijas: formal, informal, poético o divertido. La vista previa se actualiza al instante.",
        "alt": "Pantalla de personalización con el texto de la invitación a la izquierda y la vista previa en vivo a la derecha"
      },
      "4": {
        "title": "Mira exactamente lo que verán tus invitados",
        "body": "Repasa la invitación completa antes de publicarla. Vuelve atrás y ajusta lo que no te convenza.",
        "alt": "Vista previa de la invitación final con la plantilla elegida"
      },
      "5": {
        "title": "Publica y comparte",
        "body": "Elige el plan que encaje con tu evento y envía las invitaciones por enlace, correo o PDF — y sigue las confirmaciones desde tu panel.",
        "alt": "Pantalla de selección de plan con las tarifas por evento y la oferta de suscripción Pro"
      }
    },
    "closingTitle": "Invita con intención",
    "closingSubtitle": "Crea tu primera invitación en unos minutos — sin experiencia de diseño.",
    "closingCta": "Empieza gratis"
  },
```

- [ ] **Step 3: Validate JSON and key resolution**

Run:

```bash
node -e '
const j = JSON.parse(require("fs").readFileSync("i18n/lang/es.json","utf8"));
console.log(j.nav.howItWorks);
console.log(j.howItWorks.heroTitle);
console.log(j.howItWorks.steps["3"].title);
console.log("ok");
'
```

Expected output, exactly:
```
Cómo funciona
De la idea a la invitación en cinco pasos
Haz que las palabras sean tuyas
ok
```

- [ ] **Step 4: Commit**

```bash
git add i18n/lang/es.json
git commit -m "feat(i18n): add spanish how-it-works keys"
```

---

### Task 4: Create the `pages/how-it-works.vue` page

**Files:**
- Create: `pages/how-it-works.vue`

- [ ] **Step 1: Write the page**

Create `pages/how-it-works.vue` with this exact content:

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
  { n: 1, image: '/images/how-it-works/step-1-details.jpg' },
  { n: 2, image: '/images/how-it-works/step-2-templates.jpg' },
  { n: 3, image: '/images/how-it-works/step-3-customize.jpg' },
  { n: 4, image: '/images/how-it-works/step-4-preview.jpg' },
  { n: 5, image: '/images/how-it-works/step-5-publish.jpg' },
])
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-20 md:py-28">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <h1 class="font-display font-bold text-4xl md:text-6xl text-charcoal-900">
          {{ $t('howItWorks.heroTitle') }}
        </h1>
        <p class="text-lg text-charcoal-500 max-w-2xl mx-auto mt-6">
          {{ $t('howItWorks.heroSubtitle') }}
        </p>
        <NuxtLinkLocale
          to="/auth/register"
          class="bg-champagne-500 text-white rounded-full px-8 py-3 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 mt-8 inline-block"
        >
          {{ $t('howItWorks.heroCta') }}
        </NuxtLinkLocale>
      </div>
    </section>

    <!-- Divider -->
    <div class="max-w-5xl mx-auto border-t border-champagne-400/20"></div>

    <!-- Step sections (editorial zigzag) -->
    <section
      v-for="step in steps"
      :key="step.n"
      class="py-16 md:py-24"
    >
      <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <!-- Image column -->
        <div :class="step.n % 2 === 0 ? 'md:order-2' : ''">
          <div class="rounded-2xl border border-charcoal-100 shadow-lg overflow-hidden bg-white">
            <img
              :src="step.image"
              :alt="$t(`howItWorks.steps.${step.n}.alt`)"
              :loading="step.n === 1 ? 'eager' : 'lazy'"
              decoding="async"
              class="w-full h-auto block"
            />
          </div>
        </div>

        <!-- Copy column -->
        <div :class="step.n % 2 === 0 ? 'md:order-1' : ''">
          <span class="text-xs uppercase tracking-widest text-champagne-600 font-medium">
            {{ $t('howItWorks.stepEyebrow', { n: step.n }) }}
          </span>
          <h2 class="font-display font-semibold text-3xl md:text-4xl text-charcoal-900 mt-2 mb-4">
            {{ $t(`howItWorks.steps.${step.n}.title`) }}
          </h2>
          <p class="text-charcoal-500 text-lg leading-relaxed">
            {{ $t(`howItWorks.steps.${step.n}.body`) }}
          </p>
        </div>
      </div>
    </section>

    <!-- Closing CTA band -->
    <section class="bg-charcoal-900 py-20 md:py-28">
      <div class="max-w-6xl mx-auto px-6 text-center">
        <h2 class="font-display font-semibold text-3xl text-ivory-50 mb-4">
          {{ $t('howItWorks.closingTitle') }}
        </h2>
        <p class="text-charcoal-300 mb-8 max-w-xl mx-auto">
          {{ $t('howItWorks.closingSubtitle') }}
        </p>
        <NuxtLinkLocale
          to="/auth/register"
          class="bg-champagne-500 text-white rounded-full px-8 py-3 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 inline-block"
        >
          {{ $t('howItWorks.closingCta') }}
        </NuxtLinkLocale>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 2: Confirm the dev server is running**

If it isn't already up, start it:

```bash
npm run dev
```

Then in another shell verify the server responds:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Expected: `200`.

- [ ] **Step 3: Hit the English page and verify a 200 + expected copy**

Run:

```bash
curl -s http://localhost:3000/how-it-works | grep -oE "(From idea to invitation in five steps|Tell us about the day|Publish and share)" | sort -u
```

Expected output (three lines, in some order — all three strings must appear):
```
From idea to invitation in five steps
Publish and share
Tell us about the day
```

If any string is missing, open the page in a browser, check the browser console for Vue errors, and fix before moving on.

- [ ] **Step 4: Hit the Spanish page and verify**

```bash
curl -s http://localhost:3000/es/how-it-works | grep -oE "(De la idea a la invitación en cinco pasos|Cuéntanos sobre el gran día|Publica y comparte)" | sort -u
```

Expected output:
```
Cuéntanos sobre el gran día
De la idea a la invitación en cinco pasos
Publica y comparte
```

- [ ] **Step 5: Verify the screenshots load (no 404s)**

Run:

```bash
for f in step-1-details step-2-templates step-3-customize step-4-preview step-5-publish; do
  printf "%s: " "$f"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/images/how-it-works/${f}.jpg"
done
```

Expected: each line ends in `200`.

- [ ] **Step 6: Commit**

```bash
git add pages/how-it-works.vue
git commit -m "feat(how-it-works): add public page with editorial zigzag layout"
```

---

### Task 5: Wire the navbar link

**Files:**
- Modify: `components/ui/Navbar.vue`

- [ ] **Step 1: Add the link to the desktop nav**

Open `components/ui/Navbar.vue`. Find the desktop nav block (lines around 25–28):

```vue
      <!-- Desktop nav links (centered) -->
      <div class="hidden md:flex items-center gap-8">
        <NuxtLinkLocale to="/templates" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.templates') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/pricing" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.pricing') }}</NuxtLinkLocale>
      </div>
```

Insert one new `NuxtLinkLocale` between the Templates and Pricing links, so the block becomes:

```vue
      <!-- Desktop nav links (centered) -->
      <div class="hidden md:flex items-center gap-8">
        <NuxtLinkLocale to="/templates" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.templates') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/how-it-works" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.howItWorks') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/pricing" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.pricing') }}</NuxtLinkLocale>
      </div>
```

- [ ] **Step 2: Add the same link to the mobile menu**

Still in `components/ui/Navbar.vue`, find the mobile menu block (lines around 70–73):

```vue
    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="md:hidden border-t border-charcoal-200 px-6 py-4 space-y-3">
      <NuxtLinkLocale to="/templates" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.templates') }}</NuxtLinkLocale>
      <NuxtLinkLocale to="/pricing" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.pricing') }}</NuxtLinkLocale>
```

Insert the new link between Templates and Pricing, so it becomes:

```vue
    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="md:hidden border-t border-charcoal-200 px-6 py-4 space-y-3">
      <NuxtLinkLocale to="/templates" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.templates') }}</NuxtLinkLocale>
      <NuxtLinkLocale to="/how-it-works" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.howItWorks') }}</NuxtLinkLocale>
      <NuxtLinkLocale to="/pricing" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.pricing') }}</NuxtLinkLocale>
```

- [ ] **Step 3: Verify the navbar link appears on the landing page in English**

Run:

```bash
curl -s http://localhost:3000/ | grep -oE 'href="/how-it-works"' | head -1
```

Expected: `href="/how-it-works"` (matches the desktop nav `NuxtLinkLocale` resolved URL).

- [ ] **Step 4: Verify the navbar link appears on the landing page in Spanish**

Run:

```bash
curl -s http://localhost:3000/es | grep -oE 'href="/es/how-it-works"' | head -1
```

Expected: `href="/es/how-it-works"`.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Navbar.vue
git commit -m "feat(nav): link how-it-works between templates and pricing"
```

---

### Task 6: Visual verification on desktop and mobile

This task produces no commits — it's the final check that the page actually looks right. Use the Playwright MCP browser tools.

- [ ] **Step 1: Open the English page at desktop width**

Use the MCP browser tool to resize to 1280×800 and navigate to `http://localhost:3000/how-it-works`. Take a full-page screenshot named `verify-en-desktop.png`. Save it temporarily in the repo root (the user's memory says to clean up `.playwright-mcp/` after).

Verify visually that:
- The hero shows "From idea to invitation in five steps".
- Five step sections are present, with images and copy alternating sides (image-left, image-right, image-left, image-right, image-left).
- The closing CTA band is dark with "Invite with intention" and a champagne-coloured button.

- [ ] **Step 2: Open the Spanish page at desktop width**

Navigate to `http://localhost:3000/es/how-it-works`. Take `verify-es-desktop.png`. Verify the hero reads "De la idea a la invitación en cinco pasos" and step bodies are in Spanish.

- [ ] **Step 3: Resize to mobile (390×844) and reopen both locales**

Resize the browser to 390×844 (iPhone 14 Pro portrait). Reload both pages, take `verify-en-mobile.png` and `verify-es-mobile.png`.

Verify visually that:
- The page is usable without horizontal scroll.
- Every step section stacks the screenshot above its copy (single column).
- The hero, dividers, and closing CTA all stay within the viewport width.

- [ ] **Step 4: Verify the navbar link works from the landing page (desktop)**

Resize back to 1280×800. Navigate to `http://localhost:3000/`. Confirm the desktop navbar shows "Templates · How it works · Pricing" in that order. Click "How it works" and confirm it navigates to `/how-it-works`.

- [ ] **Step 5: Verify the navbar link works from the landing page (mobile)**

Resize to 390×844. Navigate to `http://localhost:3000/`. Open the hamburger menu. Confirm "How it works" is listed between Templates and Pricing. Click it and confirm navigation.

- [ ] **Step 6: Clean up verification screenshots and Playwright temp directory**

Run:

```bash
rm -f verify-en-desktop.png verify-en-mobile.png verify-es-desktop.png verify-es-mobile.png
rm -rf .playwright-mcp/
```

Expected: silent.

If any of the visual checks revealed a regression (layout broken, missing translation, 404 on an image), stop and fix the underlying file. The fix gets its own commit.

---

## Acceptance

After all six tasks, all of the following must be true:

- `git log --oneline -5` shows commits for: screenshots, en i18n, es i18n, page, navbar (5 commits, no leftover work-in-progress files).
- `git status` is clean (no stray PNGs at the repo root, no `.playwright-mcp/` directory).
- `http://localhost:3000/how-it-works` returns 200 and renders the editorial-zigzag page in English.
- `http://localhost:3000/es/how-it-works` returns 200 and renders the same page in Spanish.
- The navbar shows "How it works" between Templates and Pricing on every public page, in both locales, both desktop and mobile.
- At 390px wide the page has no horizontal scroll; step sections stack image-above-copy.
- All five JPEGs under `public/images/how-it-works/` return 200 directly.

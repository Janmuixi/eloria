<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type EventRow = Record<string, unknown> & {
  id: number; title: string; userId: number; coupleName1: string; coupleName2: string;
  date: string; venue: string; venueAddress: string; venueMapUrl: string | null;
  description: string | null; templateId: number | null; invitationType: string;
  customImagePath: string | null; customization: string | null; tierId: number | null;
  paymentStatus: string; stripePaymentId: null; hasStripePayment: boolean; language: string;
  allergiesEnabled: boolean; slug: string; createdAt: string | null;
}

type Guest = {
  id: number; name: string; email: string | null; phone: string | null;
  rsvpStatus: string; companionsAllowed: number;
  allergies: { keys: string[]; other: string };
  menuChoices: Record<number, number>;
  companions: Array<{
    id: number; position: number; name: string | null; attending: boolean;
    allergies: { keys: string[]; other: string };
    menuChoices: Record<number, number>;
  }>;
}

type DetailResponse = {
  event: EventRow;
  owner: { id: number; email: string; name: string } | null;
  tier: Record<string, unknown> | null;
  template: { id: number; slug: string; name: string; category: string } | null;
  guests: Guest[];
  menu: Array<{ id: number; name: string; sortOrder: number; options: Array<{ id: number; name: string; sortOrder: number }> }>;
}

const route = useRoute()
const { data, status } = await useFetch<DetailResponse>(`/api/admin/events/${route.params.id}`)

const optionNameById = computed(() => {
  const map = new Map<number, string>()
  for (const c of data.value?.menu ?? []) {
    for (const o of c.options) map.set(o.id, o.name)
  }
  return map
})

function fmtAllergies(a: { keys: string[]; other: string }) {
  const parts = [...a.keys]
  if (a.other) parts.push(`"${a.other}"`)
  return parts.join(', ') || '—'
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Event detail</h1>
      <NuxtLinkLocale to="/dashboard/admin/events" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to events</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <template v-else-if="data">
      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Event</h2>
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div v-for="(value, key) in data.event" :key="key">
            <dt class="text-charcoal-500">{{ key }}</dt>
            <dd class="text-charcoal-900 font-medium break-all">{{ value === null ? '—' : typeof value === 'boolean' ? (value ? 'yes' : 'no') : value }}</dd>
          </div>
        </dl>
        <details v-if="data.event.customization" class="mt-4">
          <summary class="text-sm text-charcoal-700 cursor-pointer">customization JSON</summary>
          <pre class="mt-2 text-xs bg-ivory-50 p-3 rounded overflow-x-auto">{{ data.event.customization }}</pre>
        </details>
      </section>

      <section v-if="data.owner" class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">Owner</h2>
        <NuxtLinkLocale :to="`/dashboard/admin/users/${data.owner.id}`" class="text-charcoal-900 hover:underline">
          {{ data.owner.email }} ({{ data.owner.name }})
        </NuxtLinkLocale>
      </section>

      <section v-if="data.tier" class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">Tier</h2>
        <pre class="text-xs bg-ivory-50 p-3 rounded overflow-x-auto">{{ JSON.stringify(data.tier, null, 2) }}</pre>
      </section>

      <section v-if="data.template" class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">Template</h2>
        <p class="text-sm text-charcoal-700">{{ data.template.slug }} <span class="text-charcoal-500">({{ data.template.category }})</span></p>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Menu</h2>
        <p v-if="!data.menu.length" class="text-charcoal-500 text-sm">No menu.</p>
        <div v-for="c in data.menu" :key="c.id" class="mb-3">
          <p class="font-medium text-charcoal-900">{{ c.name }}</p>
          <ul class="text-sm text-charcoal-700 list-disc list-inside">
            <li v-for="o in c.options" :key="o.id">{{ o.name }}</li>
          </ul>
        </div>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Guests ({{ data.guests.length }})</h2>
        <p v-if="!data.guests.length" class="text-charcoal-500 text-sm">No guests.</p>
        <div v-for="g in data.guests" :key="g.id" class="border-t border-charcoal-100 first:border-t-0 py-3">
          <details>
            <summary class="cursor-pointer flex items-center justify-between">
              <span class="text-charcoal-900 font-medium">{{ g.name }}</span>
              <span class="text-xs text-charcoal-500">
                {{ g.rsvpStatus }} · companions {{ g.companions.length }}/{{ g.companionsAllowed }}
              </span>
            </summary>
            <div class="mt-3 text-sm text-charcoal-700 space-y-2 pl-4">
              <p>email: {{ g.email ?? '—' }} · phone: {{ g.phone ?? '—' }}</p>
              <p>allergies: {{ fmtAllergies(g.allergies) }}</p>
              <p v-if="data.menu.length">
                menu:
                <span v-for="c in data.menu" :key="c.id" class="mr-3">
                  {{ c.name }}: {{ optionNameById.get(g.menuChoices[c.id] ?? -1) ?? '—' }}
                </span>
              </p>
              <div v-if="g.companions.length" class="mt-2">
                <p class="text-charcoal-500 text-xs uppercase mb-1">Companions</p>
                <div v-for="comp in g.companions" :key="comp.id" class="pl-3 py-1 border-l-2 border-charcoal-100">
                  <p>#{{ comp.position }} {{ comp.name ?? '(unnamed)' }} — {{ comp.attending ? 'attending' : 'not attending' }}</p>
                  <p class="text-xs">allergies: {{ fmtAllergies(comp.allergies) }}</p>
                  <p v-if="data.menu.length && comp.attending" class="text-xs">
                    <span v-for="c in data.menu" :key="c.id" class="mr-3">
                      {{ c.name }}: {{ optionNameById.get(comp.menuChoices[c.id] ?? -1) ?? '—' }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Tier = {
  id: number; name: string; slug: string; price: number; sortOrder: number;
  guestLimit: number | null;
  hasEmailDelivery: boolean | null; hasPdfExport: boolean | null;
  hasAiTextGeneration: boolean | null; removeBranding: boolean | null;
  hasMultipleVariants: boolean | null; createdAt: string | null;
}

const { data, status } = await useFetch<Tier[]>('/api/admin/tiers')
const tick = (v: boolean | null) => (v ? '✓' : '—')
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Tiers</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.length" class="text-center py-12 text-charcoal-500">No tiers.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Slug</th>
            <th class="text-left px-4 py-2">Name</th>
            <th class="text-left px-4 py-2">Price</th>
            <th class="text-left px-4 py-2">Sort</th>
            <th class="text-left px-4 py-2">Guest limit</th>
            <th class="text-left px-4 py-2">Email</th>
            <th class="text-left px-4 py-2">PDF</th>
            <th class="text-left px-4 py-2">AI</th>
            <th class="text-left px-4 py-2">No brand</th>
            <th class="text-left px-4 py-2">Variants</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in data" :key="t.id" class="border-t border-charcoal-100">
            <td class="px-4 py-2 text-charcoal-500">{{ t.id }}</td>
            <td class="px-4 py-2">{{ t.slug }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ t.name }}</td>
            <td class="px-4 py-2">{{ t.price }}</td>
            <td class="px-4 py-2">{{ t.sortOrder }}</td>
            <td class="px-4 py-2">{{ t.guestLimit ?? '∞' }}</td>
            <td class="px-4 py-2">{{ tick(t.hasEmailDelivery) }}</td>
            <td class="px-4 py-2">{{ tick(t.hasPdfExport) }}</td>
            <td class="px-4 py-2">{{ tick(t.hasAiTextGeneration) }}</td>
            <td class="px-4 py-2">{{ tick(t.removeBranding) }}</td>
            <td class="px-4 py-2">{{ tick(t.hasMultipleVariants) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

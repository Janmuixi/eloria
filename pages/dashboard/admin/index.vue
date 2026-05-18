<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { data: stats, status } = await useFetch<{
  users: number; events: number; paidEvents: number; activeSubscriptions: number
}>('/api/admin/stats')

const cards = [
  { to: '/dashboard/admin/users', label: 'Users', description: 'Inspect user accounts, their events, and subscriptions.' },
  { to: '/dashboard/admin/events', label: 'Events', description: 'Browse every event with owner, tier, and guest detail.' },
  { to: '/dashboard/admin/subscriptions', label: 'Subscriptions', description: 'Stripe subscription rows joined with owner.' },
  { to: '/dashboard/admin/tiers', label: 'Tiers', description: 'Tier configuration (read-only).' },
  { to: '/dashboard/admin/templates', label: 'Templates', description: 'Template metadata (HTML/CSS omitted).' },
]
</script>

<template>
  <div>
    <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-6">Admin</h1>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Users</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.users ?? 0 }}</p>
      </div>
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Events</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.events ?? 0 }}</p>
      </div>
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Paid events</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.paidEvents ?? 0 }}</p>
      </div>
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-5">
        <p class="text-sm text-charcoal-500">Active subscriptions</p>
        <p class="text-3xl font-display font-semibold text-charcoal-900 mt-1">{{ stats?.activeSubscriptions ?? 0 }}</p>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <NuxtLinkLocale v-for="card in cards" :key="card.to" :to="card.to"
        class="block bg-ivory-100 border border-charcoal-200 rounded-2xl p-5 hover:border-champagne-400 hover:shadow-md transition-all duration-200">
        <h3 class="font-display font-semibold text-lg text-charcoal-900">{{ card.label }}</h3>
        <p class="text-sm text-charcoal-500 mt-1">{{ card.description }}</p>
      </NuxtLinkLocale>
    </div>
  </div>
</template>

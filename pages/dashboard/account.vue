<!-- pages/dashboard/account.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { user } = useAuth()
const { data: stats } = await useFetch<{ eventCount: number }>('/api/auth/me/stats')
</script>

<template>
  <div>
    <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-6">{{ t('account.title') }}</h1>

    <div class="bg-white border border-charcoal-200 rounded-2xl p-6 max-w-lg">
      <div class="mb-5">
        <p class="text-xs font-semibold text-charcoal-400 uppercase tracking-wide mb-1">{{ t('account.name') }}</p>
        <p class="text-sm text-charcoal-900">{{ user?.name }}</p>
      </div>
      <div class="mb-5">
        <p class="text-xs font-semibold text-charcoal-400 uppercase tracking-wide mb-1">{{ t('account.email') }}</p>
        <p class="text-sm text-charcoal-900">{{ user?.email }}</p>
      </div>
      <div>
        <p class="text-xs font-semibold text-charcoal-400 uppercase tracking-wide mb-1">{{ t('account.eventsCreated') }}</p>
        <p class="text-sm text-charcoal-900">{{ stats?.eventCount ?? '—' }}</p>
      </div>
    </div>
  </div>
</template>

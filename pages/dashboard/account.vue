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

    <!-- Profile card -->
    <div class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6 mb-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-full bg-champagne-100 border border-champagne-300 flex items-center justify-center flex-shrink-0">
          <span class="font-display font-semibold text-xl text-champagne-700">{{ user?.name?.charAt(0)?.toUpperCase() }}</span>
        </div>
        <div>
          <p class="font-display font-bold text-xl text-charcoal-900">{{ user?.name }}</p>
          <p class="text-sm text-charcoal-500 mt-0.5">{{ user?.email }}</p>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-4 text-center">
        <p class="font-display font-bold text-2xl text-charcoal-900">{{ stats?.eventCount ?? '—' }}</p>
        <p class="text-charcoal-500 text-sm mt-1">{{ t('account.eventsCreated') }}</p>
      </div>
    </div>
  </div>
</template>

<!-- pages/dashboard/account.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { user } = useAuth()
const { data: stats } = await useFetch<{ eventCount: number }>('/api/auth/me/stats')
const { data: subscriptionStatus, refresh: refreshSubscription } = await useFetch('/api/subscriptions/status')

const canceling = ref(false)

async function cancelSubscription() {
  if (!confirm('Are you sure you want to cancel your subscription? Your events will be locked at the end of your billing period.')) {
    return
  }
  canceling.value = true
  try {
    await $fetch('/api/subscriptions/cancel', { method: 'POST' })
    await refreshSubscription()
  } catch (e) {
    console.error('Failed to cancel subscription', e)
  } finally {
    canceling.value = false
  }
}

async function reactivateSubscription() {
  canceling.value = true
  try {
    await $fetch('/api/subscriptions/reactivate', { method: 'POST' })
    await refreshSubscription()
  } catch (e) {
    console.error('Failed to reactivate subscription', e)
  } finally {
    canceling.value = false
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}
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

    <!-- Subscription card -->
    <div class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6 mb-6">
      <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">{{ t('account.subscription') }}</h2>
      
      <div v-if="subscriptionStatus?.hasActiveSubscription" class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p class="font-semibold text-charcoal-900">{{ t('account.proPlan') }}</p>
            <p class="text-sm text-charcoal-500">{{ t('account.renewsOn', { date: formatDate(subscriptionStatus.subscription?.currentPeriodEnd || null) }) }}</p>
          </div>
        </div>

        <div class="pt-4 border-t border-charcoal-100">
          <button
            @click="cancelSubscription"
            :disabled="canceling"
            class="text-sm text-red-600 hover:text-red-700 underline disabled:opacity-50"
          >
            {{ canceling ? t('common.loading') : t('account.cancelSubscription') }}
          </button>
        </div>
      </div>

      <div v-else class="space-y-4">
        <p class="text-charcoal-500">{{ t('account.noActiveSubscription') }}</p>
        <NuxtLink
          to="/pricing"
          class="inline-block bg-champagne-500 text-white px-4 py-2 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200"
        >
          {{ t('account.viewPlans') }}
        </NuxtLink>
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

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const eventId = route.params.id as string

const { data: evt, status, refresh } = await useFetch(`/api/events/${eventId}`)

const form = reactive({
  title: '',
  coupleName1: '',
  coupleName2: '',
  date: '',
  venue: '',
  venueAddress: '',
  venueMapUrl: '',
  description: '',
})

watch(evt, (data) => {
  if (data) {
    form.title = data.title || ''
    form.coupleName1 = data.coupleName1 || ''
    form.coupleName2 = data.coupleName2 || ''
    form.date = data.date || ''
    form.venue = data.venue || ''
    form.venueAddress = data.venueAddress || ''
    form.venueMapUrl = data.venueMapUrl || ''
    form.description = data.description || ''
  }
}, { immediate: true })

const saving = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

async function saveSettings() {
  saving.value = true
  saveSuccess.value = false
  saveError.value = ''

  try {
    await $fetch(`/api/events/${eventId}`, {
      method: 'PUT',
      body: { ...form },
    })
    saveSuccess.value = true
    await refresh()
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (e: any) {
    saveError.value = e.data?.statusMessage || 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

const invitationUrl = computed(() => {
  if (!evt.value) return ''
  return `/i/${evt.value.slug}`
})

const fullInvitationUrl = computed(() => {
  if (import.meta.server) return invitationUrl.value
  return `${window.location.origin}${invitationUrl.value}`
})

const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(fullInvitationUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback
  }
}

const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])
</script>

<template>
  <div>
    <NuxtLink to="/dashboard" class="text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline mb-4 block">
      &larr; {{ t('eventDetail.backToEvents') }}
    </NuxtLink>

    <!-- Tabs -->
    <div class="border-b border-charcoal-200 mb-6">
      <nav class="flex gap-6">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="pb-3 text-sm border-b-2 transition-colors"
          :class="$route.path === tab.to
            ? 'border-champagne-500 text-charcoal-900 font-medium'
            : 'border-transparent text-charcoal-500 hover:text-charcoal-700'"
        >
          {{ tab.label }}
        </NuxtLink>
      </nav>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!evt" class="text-center py-12">
      <p class="text-charcoal-500">{{ t('eventDetail.eventNotFound') }}</p>
    </div>

    <div v-else>
      <h1 class="font-display font-semibold text-2xl text-charcoal-900 mb-6">{{ t('settings.title') }}</h1>

      <div v-if="evt.paymentStatus === 'paid'" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6 mb-6">
        <label class="block text-sm font-medium text-charcoal-700 mb-2">{{ t('eventDetail.publicInvitationLink') }}</label>
        <div class="flex gap-2">
          <input
            type="text"
            :value="fullInvitationUrl"
            readonly
            class="flex-1 px-3 py-2 bg-ivory-100 border border-charcoal-200 rounded-lg text-sm text-charcoal-500"
          />
          <button @click="copyLink"
            class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
            {{ copied ? t('common.copied') : t('common.copy') }}
          </button>
        </div>
      </div>

      <!-- Settings Form -->
      <form @submit.prevent="saveSettings" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6">
        <div v-if="saveError" class="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{{ saveError }}</div>
        <div v-if="saveSuccess" class="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">{{ t('settings.settingsSaved') }}</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.eventTitle') }}</label>
            <input v-model="form.title" type="text" required
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.partner1Name') }}</label>
            <input v-model="form.coupleName1" type="text" required
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.partner2Name') }}</label>
            <input v-model="form.coupleName2" type="text" required
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.date') }}</label>
            <input v-model="form.date" type="date" required
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.venue') }}</label>
            <input v-model="form.venue" type="text" required
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.venueAddress') }}</label>
            <input v-model="form.venueAddress" type="text" required
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.mapUrl') }}</label>
            <input v-model="form.venueMapUrl" type="url" :placeholder="t('settings.mapUrlPlaceholder')"
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>

          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('settings.description') }}</label>
            <textarea v-model="form.description" rows="3" :placeholder="t('settings.descriptionPlaceholder')"
              class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
          </div>
        </div>

        <div class="flex items-center gap-3 mt-6 pt-4 border-t border-charcoal-200">
          <button type="submit" :disabled="saving"
            class="px-6 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
            {{ saving ? t('settings.saving') : t('settings.saveChanges') }}
          </button>
          <NuxtLink to="/dashboard/events/new"
            class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
            {{ t('settings.changeTemplate') }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

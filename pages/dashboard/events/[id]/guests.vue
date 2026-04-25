<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const eventId = route.params.id as string

const { data: guests, refresh: refreshGuests, status } = await useFetch(`/api/events/${eventId}/guests`)
const { data: evt } = await useFetch(`/api/events/${eventId}`)

const guestLimit = computed(() => evt.value?.tier?.guestLimit ?? null)
const guestCountLabel = computed(() => {
  const current = guests.value?.length ?? 0
  if (guestLimit.value != null) {
    return t('guests.guestCount', { current, limit: guestLimit.value })
  }
  return t('guests.guestCountUnlimited', { current })
})

const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])

// Add guest form
const showAddForm = ref(false)
const addForm = reactive({ name: '', email: '' })
const addLoading = ref(false)
const addError = ref('')

async function addGuest() {
  if (!addForm.name.trim()) return
  addLoading.value = true
  addError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/guests`, {
      method: 'POST',
      body: { name: addForm.name, email: addForm.email || undefined },
    })
    addForm.name = ''
    addForm.email = ''
    showAddForm.value = false
    await refreshGuests()
  } catch (e: any) {
    if (e?.response?.status === 403) {
      addError.value = t('guests.guestLimitReached', { limit: guestLimit.value })
    } else {
      addError.value = t('errors.somethingWentWrong')
    }
  } finally {
    addLoading.value = false
  }
}

// Delete guest
async function deleteGuest(guestId: number) {
  if (!confirm(t('guests.confirmRemove'))) return
  try {
    await $fetch(`/api/events/${eventId}/guests/${guestId}`, { method: 'DELETE' })
    await refreshGuests()
  } catch (e) {
    console.error('Failed to delete guest:', e)
  }
}

// CSV import
const showImport = ref(false)
const csvText = ref('')
const importLoading = ref(false)
const importResult = ref<{ imported: number } | null>(null)

const importError = ref('')

async function importCsv() {
  if (!csvText.value.trim()) return
  importLoading.value = true
  importResult.value = null
  importError.value = ''
  try {
    const result = await $fetch(`/api/events/${eventId}/guests/import`, {
      method: 'POST',
      body: { csv: csvText.value },
    })
    importResult.value = result
    csvText.value = ''
    await refreshGuests()
  } catch (e: any) {
    if (e?.response?.status === 403) {
      const remaining = guestLimit.value != null ? guestLimit.value - (guests.value?.length ?? 0) : 0
      importError.value = t('guests.importLimitExceeded', { limit: guestLimit.value, remaining: Math.max(0, remaining) })
    } else {
      importError.value = t('errors.somethingWentWrong')
    }
  } finally {
    importLoading.value = false
  }
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-green-100 text-green-700'
    case 'declined': return 'bg-red-100 text-red-700'
    case 'maybe': return 'bg-yellow-100 text-yellow-700'
    default: return 'bg-charcoal-100 text-charcoal-500'
  }
}

const copiedGuestId = ref<number | null>(null)

function personalLink(token: string): string {
  if (!evt.value?.slug) return ''
  const origin = import.meta.client ? window.location.origin : ''
  return `${origin}/i/${evt.value.slug}?g=${token}`
}

async function copyPersonalLink(guest: { id: number; token: string }) {
  const url = personalLink(guest.token)
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    copiedGuestId.value = guest.id
    setTimeout(() => {
      if (copiedGuestId.value === guest.id) copiedGuestId.value = null
    }, 2000)
  } catch {
    /* clipboard rejected; ignore */
  }
}
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

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="font-display font-semibold text-2xl text-charcoal-900">
          {{ t('guests.guestList') }}
          <span v-if="guests" class="text-base font-normal text-charcoal-500">({{ guestCountLabel }})</span>
        </h1>
      </div>
      <div class="flex gap-2">
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
          {{ t('guests.importCsv') }}
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 transition-colors">
          {{ t('guests.addGuest') }}
        </button>
      </div>
    </div>

    <!-- Add Guest Form -->
    <div v-if="showAddForm" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-4 mb-4">
      <h3 class="font-display font-semibold text-charcoal-900 mb-3">{{ t('guests.addGuestTitle') }}</h3>
      <form @submit.prevent="addGuest" class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('guests.nameRequired') }}</label>
          <input v-model="addForm.name" type="text" required :placeholder="t('guests.guestNamePlaceholder')"
            class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
        </div>
        <div class="flex-1">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('common.email') }}</label>
          <input v-model="addForm.email" type="email" :placeholder="t('guests.emailPlaceholder')"
            class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
        </div>
        <button type="submit" :disabled="addLoading"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
          {{ addLoading ? t('guests.adding') : t('guests.add') }}
        </button>
        <button type="button" @click="showAddForm = false"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 transition-colors">
          {{ t('common.cancel') }}
        </button>
      </form>
      <div v-if="addError" class="mt-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <p class="text-sm text-red-700">{{ addError }}</p>
        <NuxtLink v-if="addError.includes(String(guestLimit))" to="/pricing"
          class="ml-4 px-3 py-1 bg-champagne-500 text-white rounded-full text-xs font-medium hover:bg-champagne-600 transition-colors whitespace-nowrap">
          {{ t('guests.upgradePlan') }}
        </NuxtLink>
      </div>
    </div>

    <!-- CSV Import -->
    <div v-if="showImport" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-4 mb-4">
      <h3 class="font-display font-semibold text-charcoal-900 mb-3">{{ t('guests.importFromCsv') }}</h3>
      <p class="text-sm text-charcoal-500 mb-2">{{ t('guests.csvHelp', { format1: 'name,email', format2: 'name' }) }}</p>
      <textarea v-model="csvText" rows="5" :placeholder="t('guests.csvPlaceholder')"
        class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm font-mono focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 mb-3" />
      <div class="flex items-center gap-3">
        <button @click="importCsv" :disabled="importLoading"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
          {{ importLoading ? t('guests.importing') : t('guests.import') }}
        </button>
        <button @click="showImport = false"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 transition-colors">
          {{ t('common.cancel') }}
        </button>
        <span v-if="importResult" class="text-sm text-green-600">
          {{ t('guests.importSuccess', { count: importResult.imported }) }}
        </span>
      </div>
      <div v-if="importError" class="mt-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <p class="text-sm text-red-700">{{ importError }}</p>
        <NuxtLink v-if="importError.includes(String(guestLimit))" to="/pricing"
          class="ml-4 px-3 py-1 bg-champagne-500 text-white rounded-full text-xs font-medium hover:bg-champagne-600 transition-colors whitespace-nowrap">
          {{ t('guests.upgradePlan') }}
        </NuxtLink>
      </div>
    </div>

    <!-- Loading -->
    <UiLoadingSpinner v-if="status === 'pending'" />

    <!-- Empty state -->
    <div v-else-if="!guests?.length" class="text-center py-12 bg-white rounded-2xl shadow-sm border border-charcoal-200">
      <p class="text-charcoal-500 mb-2">{{ t('guests.noGuests') }}</p>
      <p class="text-sm text-charcoal-400">{{ t('guests.noGuestsHelp') }}</p>
    </div>

    <!-- Guest table -->
    <div v-else class="bg-white rounded-2xl shadow-sm border border-charcoal-200 overflow-hidden">
      <table class="w-full">
        <thead class="bg-ivory-100 border-b border-charcoal-200">
          <tr>
            <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderName') }}</th>
            <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderEmail') }}</th>
            <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderRsvp') }}</th>
            <th class="text-right px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="guest in guests" :key="guest.id" class="border-b border-charcoal-200 hover:bg-ivory-100/50 transition-colors">
            <td class="px-6 py-4 text-sm font-medium text-charcoal-900">{{ guest.name }}</td>
            <td class="px-6 py-4 text-sm text-charcoal-500">{{ guest.email || t('guests.noEmail') }}</td>
            <td class="px-6 py-4">
              <span :class="['px-2 py-1 rounded-full text-xs font-medium', statusBadgeClass(guest.rsvpStatus)]">
                {{ guest.rsvpStatus }}
              </span>
            </td>
            <td class="px-6 py-4 text-right space-x-3 whitespace-nowrap">
              <button @click="copyPersonalLink(guest)"
                class="text-sm text-charcoal-700 hover:text-charcoal-900 font-medium">
                {{ copiedGuestId === guest.id ? t('common.copied') : t('guests.copyLink') }}
              </button>
              <button @click="deleteGuest(guest.id)"
                class="text-sm text-red-600 hover:text-red-800 font-medium">
                {{ t('common.remove') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

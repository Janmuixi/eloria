<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

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

const tabs = [
  { label: 'Overview', to: `/dashboard/events/${eventId}` },
  { label: 'Guests', to: `/dashboard/events/${eventId}/guests` },
  { label: 'Settings', to: `/dashboard/events/${eventId}/settings` },
]
</script>

<template>
  <div>
    <NuxtLink to="/dashboard" class="text-sm text-gray-500 hover:text-gray-700 mb-4 block">
      &larr; Back to Events
    </NuxtLink>

    <!-- Tabs -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="flex gap-6">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="pb-3 text-sm font-medium border-b-2 transition-colors"
          :class="$route.path === tab.to
            ? 'border-primary-600 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
        >
          {{ tab.label }}
        </NuxtLink>
      </nav>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!evt" class="text-center py-12">
      <p class="text-gray-500">Event not found.</p>
    </div>

    <div v-else>
      <h1 class="text-2xl font-bold mb-6">Event Settings</h1>

      <!-- Invitation URL -->
      <div v-if="evt.paymentStatus === 'paid'" class="bg-white rounded-lg shadow p-6 mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">Public Invitation Link</label>
        <div class="flex gap-2">
          <input
            type="text"
            :value="fullInvitationUrl"
            readonly
            class="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600"
          />
          <button @click="copyLink"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <!-- Settings Form -->
      <form @submit.prevent="saveSettings" class="bg-white rounded-lg shadow p-6">
        <div v-if="saveError" class="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{{ saveError }}</div>
        <div v-if="saveSuccess" class="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">Settings saved successfully!</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
            <input v-model="form.title" type="text" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Partner 1 Name</label>
            <input v-model="form.coupleName1" type="text" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Partner 2 Name</label>
            <input v-model="form.coupleName2" type="text" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input v-model="form.date" type="date" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Venue</label>
            <input v-model="form.venue" type="text" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Venue Address</label>
            <input v-model="form.venueAddress" type="text" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Map URL</label>
            <input v-model="form.venueMapUrl" type="url" placeholder="https://maps.google.com/..."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="form.description" rows="3" placeholder="Optional description or notes"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>

        <div class="flex items-center gap-3 mt-6 pt-4 border-t">
          <button type="submit" :disabled="saving"
            class="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
          <NuxtLink to="/dashboard/events/new"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Change Template
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const eventId = route.params.id as string

const { data: guests, refresh: refreshGuests, status } = await useFetch(`/api/events/${eventId}/guests`)

const tabs = [
  { label: 'Overview', to: `/dashboard/events/${eventId}` },
  { label: 'Guests', to: `/dashboard/events/${eventId}/guests` },
  { label: 'Settings', to: `/dashboard/events/${eventId}/settings` },
]

// Add guest form
const showAddForm = ref(false)
const addForm = reactive({ name: '', email: '' })
const addLoading = ref(false)

async function addGuest() {
  if (!addForm.name.trim()) return
  addLoading.value = true
  try {
    await $fetch(`/api/events/${eventId}/guests`, {
      method: 'POST',
      body: { name: addForm.name, email: addForm.email || undefined },
    })
    addForm.name = ''
    addForm.email = ''
    showAddForm.value = false
    await refreshGuests()
  } catch (e) {
    console.error('Failed to add guest:', e)
  } finally {
    addLoading.value = false
  }
}

// Delete guest
async function deleteGuest(guestId: number) {
  if (!confirm('Remove this guest?')) return
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

async function importCsv() {
  if (!csvText.value.trim()) return
  importLoading.value = true
  importResult.value = null
  try {
    const result = await $fetch(`/api/events/${eventId}/guests/import`, {
      method: 'POST',
      body: { csv: csvText.value },
    })
    importResult.value = result
    csvText.value = ''
    await refreshGuests()
  } catch (e) {
    console.error('Failed to import CSV:', e)
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
</script>

<template>
  <div>
    <NuxtLink to="/dashboard" class="text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline mb-4 block">
      &larr; Back to Events
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
          Guest List
          <span v-if="guests" class="text-base font-normal text-charcoal-500">({{ guests.length }})</span>
        </h1>
      </div>
      <div class="flex gap-2">
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
          Import CSV
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 transition-colors">
          Add Guest
        </button>
      </div>
    </div>

    <!-- Add Guest Form -->
    <div v-if="showAddForm" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-4 mb-4">
      <h3 class="font-display font-semibold text-charcoal-900 mb-3">Add Guest</h3>
      <form @submit.prevent="addGuest" class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">Name *</label>
          <input v-model="addForm.name" type="text" required placeholder="Guest name"
            class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
        </div>
        <div class="flex-1">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">Email</label>
          <input v-model="addForm.email" type="email" placeholder="guest@email.com"
            class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
        </div>
        <button type="submit" :disabled="addLoading"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
          {{ addLoading ? 'Adding...' : 'Add' }}
        </button>
        <button type="button" @click="showAddForm = false"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 transition-colors">
          Cancel
        </button>
      </form>
    </div>

    <!-- CSV Import -->
    <div v-if="showImport" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-4 mb-4">
      <h3 class="font-display font-semibold text-charcoal-900 mb-3">Import from CSV</h3>
      <p class="text-sm text-charcoal-500 mb-2">Paste CSV data below. Each line: <code>name,email</code> or just <code>name</code></p>
      <textarea v-model="csvText" rows="5" placeholder="John Doe,john@email.com&#10;Jane Smith"
        class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm font-mono focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 mb-3" />
      <div class="flex items-center gap-3">
        <button @click="importCsv" :disabled="importLoading"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
          {{ importLoading ? 'Importing...' : 'Import' }}
        </button>
        <button @click="showImport = false"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 transition-colors">
          Cancel
        </button>
        <span v-if="importResult" class="text-sm text-green-600">
          Successfully imported {{ importResult.imported }} guests!
        </span>
      </div>
    </div>

    <!-- Loading -->
    <UiLoadingSpinner v-if="status === 'pending'" />

    <!-- Empty state -->
    <div v-else-if="!guests?.length" class="text-center py-12 bg-white rounded-2xl shadow-sm border border-charcoal-200">
      <p class="text-charcoal-500 mb-2">No guests added yet.</p>
      <p class="text-sm text-charcoal-400">Add guests individually or import from CSV.</p>
    </div>

    <!-- Guest table -->
    <div v-else class="bg-white rounded-2xl shadow-sm border border-charcoal-200 overflow-hidden">
      <table class="w-full">
        <thead class="bg-ivory-100 border-b border-charcoal-200">
          <tr>
            <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">Name</th>
            <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">Email</th>
            <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">RSVP Status</th>
            <th class="text-right px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="guest in guests" :key="guest.id" class="border-b border-charcoal-200 hover:bg-ivory-100/50 transition-colors">
            <td class="px-6 py-4 text-sm font-medium text-charcoal-900">{{ guest.name }}</td>
            <td class="px-6 py-4 text-sm text-charcoal-500">{{ guest.email || '—' }}</td>
            <td class="px-6 py-4">
              <span :class="['px-2 py-1 rounded-full text-xs font-medium', statusBadgeClass(guest.rsvpStatus)]">
                {{ guest.rsvpStatus }}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <button @click="deleteGuest(guest.id)"
                class="text-sm text-red-600 hover:text-red-800 font-medium">
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

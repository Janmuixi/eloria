<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const eventId = route.params.id as string

const { data: guests, refresh: refreshGuests, status } = await useFetch(`/api/events/${eventId}/guests`)

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
    default: return 'bg-gray-100 text-gray-600'
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <NuxtLink :to="`/dashboard/events/${eventId}`" class="text-sm text-gray-500 hover:text-gray-700 mb-1 block">
          &larr; Back to Event
        </NuxtLink>
        <h1 class="text-2xl font-bold">
          Guest List
          <span v-if="guests" class="text-base font-normal text-gray-500">({{ guests.length }})</span>
        </h1>
      </div>
      <div class="flex gap-2">
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
          Import CSV
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          Add Guest
        </button>
      </div>
    </div>

    <!-- Add Guest Form -->
    <div v-if="showAddForm" class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="font-semibold mb-3">Add Guest</h3>
      <form @submit.prevent="addGuest" class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input v-model="addForm.name" type="text" required placeholder="Guest name"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <div class="flex-1">
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input v-model="addForm.email" type="email" placeholder="guest@email.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <button type="submit" :disabled="addLoading"
          class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ addLoading ? 'Adding...' : 'Add' }}
        </button>
        <button type="button" @click="showAddForm = false"
          class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </form>
    </div>

    <!-- CSV Import -->
    <div v-if="showImport" class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="font-semibold mb-3">Import from CSV</h3>
      <p class="text-sm text-gray-500 mb-2">Paste CSV data below. Each line: <code>name,email</code> or just <code>name</code></p>
      <textarea v-model="csvText" rows="5" placeholder="John Doe,john@email.com&#10;Jane Smith"
        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 mb-3" />
      <div class="flex items-center gap-3">
        <button @click="importCsv" :disabled="importLoading"
          class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ importLoading ? 'Importing...' : 'Import' }}
        </button>
        <button @click="showImport = false"
          class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <span v-if="importResult" class="text-sm text-green-600">
          Successfully imported {{ importResult.imported }} guests!
        </span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="status === 'pending'" class="text-gray-500">Loading guests...</div>

    <!-- Empty state -->
    <div v-else-if="!guests?.length" class="text-center py-12 bg-white rounded-lg shadow">
      <p class="text-gray-500 mb-2">No guests added yet.</p>
      <p class="text-sm text-gray-400">Add guests individually or import from CSV.</p>
    </div>

    <!-- Guest table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">RSVP Status</th>
            <th class="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="guest in guests" :key="guest.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ guest.name }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ guest.email || '—' }}</td>
            <td class="px-6 py-4">
              <span :class="['px-2 py-1 rounded text-xs font-medium', statusBadgeClass(guest.rsvpStatus)]">
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

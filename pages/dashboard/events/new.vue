<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const currentStep = ref(1)
const eventId = ref<number | null>(null)

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

const error = ref('')
const submitting = ref(false)

async function submitDetails() {
  error.value = ''
  submitting.value = true
  try {
    const data = await $fetch<{ id: number }>('/api/events', {
      method: 'POST',
      body: form,
    })
    eventId.value = data.id
    currentStep.value = 2
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to create event'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2 mb-8">
      <div v-for="step in 5" :key="step"
        :class="[
          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
          step === currentStep ? 'bg-primary-600 text-white' : step < currentStep ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
        ]">
        {{ step }}
      </div>
    </div>

    <!-- Step 1: Event Details -->
    <div v-if="currentStep === 1">
      <h1 class="text-2xl font-bold mb-6">Event Details</h1>
      <form @submit.prevent="submitDetails" class="space-y-4">
        <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>

        <div>
          <label class="block text-sm font-medium mb-1">Event Title (for your dashboard)</label>
          <input v-model="form.title" type="text" required placeholder="Our Wedding"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Partner 1 Name</label>
            <input v-model="form.coupleName1" type="text" required placeholder="Maria"
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Partner 2 Name</label>
            <input v-model="form.coupleName2" type="text" required placeholder="James"
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Wedding Date</label>
          <input v-model="form.date" type="date" required
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Venue Name</label>
          <input v-model="form.venue" type="text" required placeholder="The Grand Ballroom"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Venue Address</label>
          <input v-model="form.venueAddress" type="text" required placeholder="123 Wedding Lane, City"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Map Link (optional)</label>
          <input v-model="form.venueMapUrl" type="url" placeholder="https://maps.google.com/..."
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Additional Details (optional)</label>
          <textarea v-model="form.description" rows="3" placeholder="Any additional information for your guests..."
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <button type="submit" :disabled="submitting"
          class="w-full bg-primary-600 text-white rounded-lg py-2 font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ submitting ? 'Creating...' : 'Continue to Template Selection' }}
        </button>
      </form>
    </div>

    <!-- Placeholder for steps 2-5 -->
    <div v-else-if="currentStep === 2" class="text-center py-12">
      <p class="text-gray-500">Step 2: Template Selection (coming next)</p>
      <p class="text-sm text-gray-400 mt-2">Event ID: {{ eventId }}</p>
    </div>
    <div v-else-if="currentStep === 3" class="text-center py-12">
      <p class="text-gray-500">Step 3: Customize (coming soon)</p>
    </div>
    <div v-else-if="currentStep === 4" class="text-center py-12">
      <p class="text-gray-500">Step 4: Preview (coming soon)</p>
    </div>
    <div v-else-if="currentStep === 5" class="text-center py-12">
      <p class="text-gray-500">Step 5: Payment (coming soon)</p>
    </div>
  </div>
</template>

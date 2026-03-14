<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const eventId = route.params.id as string

const { data: evt, status } = await useFetch(`/api/events/${eventId}`)

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
    // fallback: select text
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const rsvpStats = computed(() => {
  const guests = evt.value?.guests || []
  return {
    total: guests.length,
    confirmed: guests.filter((g: any) => g.rsvpStatus === 'confirmed').length,
    declined: guests.filter((g: any) => g.rsvpStatus === 'declined').length,
    maybe: guests.filter((g: any) => g.rsvpStatus === 'maybe').length,
    pending: guests.filter((g: any) => g.rsvpStatus === 'pending').length,
  }
})

// Send Invitations
const sendingEmails = ref(false)
const emailResult = ref<{ sent: number; failed: number; message?: string } | null>(null)
const emailError = ref('')

async function sendInvitations() {
  sendingEmails.value = true
  emailResult.value = null
  emailError.value = ''

  try {
    const result = await $fetch(`/api/events/${eventId}/send-invitations`, {
      method: 'POST',
    })
    emailResult.value = result as { sent: number; failed: number; message?: string }
  } catch (e: any) {
    emailError.value = e.data?.statusMessage || 'Failed to send invitations'
  } finally {
    sendingEmails.value = false
  }
}

// PDF Export
const downloadingPdf = ref(false)

async function downloadPdf() {
  downloadingPdf.value = true
  try {
    const blob = await $fetch(`/api/events/${eventId}/pdf`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(blob as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${evt.value?.slug || 'invitation'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: any) {
    alert(e.data?.statusMessage || 'Failed to generate PDF')
  } finally {
    downloadingPdf.value = false
  }
}
</script>

<template>
  <div>
    <NuxtLink to="/dashboard" class="text-sm text-gray-500 hover:text-gray-700 mb-4 block">
      &larr; Back to Events
    </NuxtLink>

    <div v-if="status === 'pending'" class="text-gray-500">Loading event...</div>

    <div v-else-if="!evt" class="text-center py-12">
      <p class="text-gray-500">Event not found.</p>
    </div>

    <div v-else>
      <!-- Event Info Card -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-bold mb-1">{{ evt.title }}</h1>
            <p class="text-gray-600">{{ evt.coupleName1 }} &amp; {{ evt.coupleName2 }}</p>
            <p class="text-sm text-gray-500 mt-1">{{ formatDate(evt.date) }}</p>
            <p class="text-sm text-gray-500">{{ evt.venue }}, {{ evt.venueAddress }}</p>
          </div>
          <span :class="[
            'px-3 py-1 rounded-full text-xs font-medium',
            evt.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          ]">
            {{ evt.paymentStatus === 'paid' ? 'Active' : 'Pending Payment' }}
          </span>
        </div>

        <!-- Invitation Link -->
        <div v-if="evt.paymentStatus === 'paid'" class="mt-4 pt-4 border-t">
          <label class="block text-sm font-medium text-gray-700 mb-1">Public Invitation Link</label>
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
            <a :href="invitationUrl" target="_blank" rel="noopener noreferrer"
              class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
              View
            </a>
          </div>
        </div>
      </div>

      <!-- RSVP Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <p class="text-2xl font-bold text-gray-900">{{ rsvpStats.total }}</p>
          <p class="text-sm text-gray-500">Total Guests</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">{{ rsvpStats.confirmed }}</p>
          <p class="text-sm text-gray-500">Confirmed</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <p class="text-2xl font-bold text-red-600">{{ rsvpStats.declined }}</p>
          <p class="text-sm text-gray-500">Declined</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ rsvpStats.maybe }}</p>
          <p class="text-sm text-gray-500">Maybe</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <p class="text-2xl font-bold text-gray-400">{{ rsvpStats.pending }}</p>
          <p class="text-sm text-gray-500">Pending</p>
        </div>
      </div>

      <!-- Email & PDF Actions -->
      <div v-if="evt.paymentStatus === 'paid'" class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
        <div class="flex flex-wrap gap-3">
          <!-- Send Invitations -->
          <button
            v-if="evt.tier?.hasEmailDelivery"
            @click="sendInvitations"
            :disabled="sendingEmails"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {{ sendingEmails ? 'Sending...' : 'Send Invitations' }}
          </button>

          <!-- Download PDF -->
          <button
            v-if="evt.tier?.hasPdfExport"
            @click="downloadPdf"
            :disabled="downloadingPdf"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {{ downloadingPdf ? 'Generating...' : 'Download PDF' }}
          </button>
        </div>

        <!-- Email Result Feedback -->
        <div v-if="emailResult" class="mt-3 p-3 rounded-lg text-sm"
          :class="emailResult.failed ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'">
          <template v-if="emailResult.message">{{ emailResult.message }}</template>
          <template v-else>
            Sent {{ emailResult.sent }} invitation{{ emailResult.sent !== 1 ? 's' : '' }}<template v-if="emailResult.failed">, {{ emailResult.failed }} failed</template>.
          </template>
        </div>
        <div v-if="emailError" class="mt-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {{ emailError }}
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="flex gap-3">
        <NuxtLink :to="`/dashboard/events/${eventId}/guests`"
          class="flex-1 bg-white rounded-lg shadow p-4 text-center hover:bg-gray-50 transition-colors">
          <p class="font-medium text-gray-900">Manage Guests</p>
          <p class="text-sm text-gray-500 mt-1">Add, remove, and track guests</p>
        </NuxtLink>
        <a v-if="evt.paymentStatus === 'paid'"
          :href="invitationUrl" target="_blank" rel="noopener noreferrer"
          class="flex-1 bg-white rounded-lg shadow p-4 text-center hover:bg-gray-50 transition-colors">
          <p class="font-medium text-gray-900">View Invitation</p>
          <p class="text-sm text-gray-500 mt-1">See your public invitation page</p>
        </a>
      </div>
    </div>
  </div>
</template>

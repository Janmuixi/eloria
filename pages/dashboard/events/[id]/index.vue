<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, locale } = useI18n()
const route = useRoute()
const eventId = route.params.id as string

const { data: evt, status } = await useFetch(`/api/events/${eventId}`)

const isLocked = computed(() => evt.value?.paymentStatus === 'locked')

const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])

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
  return date.toLocaleDateString(locale.value, {
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
    emailError.value = e.data?.statusMessage || t('errors.failedToSendInvitations')
  } finally {
    sendingEmails.value = false
  }
}

// Delete Event
const showDeleteConfirm = ref(false)
const deleting = ref(false)

async function deleteEvent() {
  deleting.value = true
  try {
    await $fetch(`/api/events/${eventId}`, { method: 'DELETE' })
    navigateTo('/dashboard')
  } catch (e: any) {
    alert(e.data?.statusMessage || t('errors.failedToDeleteEvent'))
    deleting.value = false
    showDeleteConfirm.value = false
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
    alert(e.data?.statusMessage || t('errors.failedToGeneratePdf'))
  } finally {
    downloadingPdf.value = false
  }
}
</script>

<template>
  <div>
    <NuxtLink to="/dashboard" class="text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline mb-4 block">
      &larr; {{ $t('eventDetail.backToEvents') }}
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
      <p class="text-charcoal-500">{{ $t('eventDetail.eventNotFound') }}</p>
    </div>

    <div v-else>
      <!-- Locked Banner -->
      <div v-if="isLocked" class="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-start gap-4">
        <svg class="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <div class="flex-1">
          <p class="font-semibold text-amber-900">{{ $t('eventDetail.eventLocked') }}</p>
          <p class="text-sm text-amber-700 mt-1">{{ $t('eventDetail.eventLockedDescription') }}</p>
        </div>
        <NuxtLink
          to="/dashboard/account"
          class="flex-shrink-0 px-4 py-2 bg-amber-500 text-white rounded-full text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          {{ $t('eventDetail.reactivateSubscription') }}
        </NuxtLink>
      </div>

      <!-- Event Info Card -->
      <div class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-1">{{ evt.title }}</h1>
            <p class="text-charcoal-500">{{ evt.coupleName1 }} &amp; {{ evt.coupleName2 }}</p>
            <p class="text-sm text-charcoal-500 mt-1">{{ formatDate(evt.date) }}</p>
            <p class="text-sm text-charcoal-500">{{ evt.venue }}, {{ evt.venueAddress }}</p>
          </div>
          <span :class="[
            'rounded-full px-3 py-1 text-xs font-medium',
            evt.paymentStatus === 'paid' ? 'bg-champagne-500 text-white' :
            evt.paymentStatus === 'locked' ? 'bg-amber-100 text-amber-700' :
            'bg-charcoal-100 text-charcoal-500'
          ]">
            {{ evt.paymentStatus === 'paid' ? $t('common.active') :
               evt.paymentStatus === 'locked' ? $t('common.locked') :
               $t('common.pendingPayment') }}
          </span>
        </div>

        <!-- Invitation Link -->
        <div v-if="evt.paymentStatus === 'paid' && !isLocked" class="mt-4 pt-4 border-t border-charcoal-200">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventDetail.publicInvitationLink') }}</label>
          <div class="flex gap-2">
            <input
              type="text"
              :value="fullInvitationUrl"
              readonly
              class="flex-1 px-3 py-2 bg-ivory-100 border border-charcoal-200 rounded-lg text-sm text-charcoal-500"
            />
            <button @click="copyLink"
              class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
              {{ copied ? $t('common.copied') : $t('common.copy') }}
            </button>
            <a :href="invitationUrl" target="_blank" rel="noopener noreferrer"
              class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
              {{ $t('common.view') }}
            </a>
          </div>
        </div>
      </div>

      <!-- Invitation Preview -->
      <div v-if="evt.template?.htmlTemplate" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">{{ $t('eventDetail.invitationPreview') }}</h2>
        <div class="border border-champagne-400 rounded-2xl overflow-hidden max-w-xl mx-auto">
          <InvitationTemplatePreview
            :html-template="evt.template.htmlTemplate"
            :couple-name1="evt.coupleName1"
            :couple-name2="evt.coupleName2"
            :date="formatDate(evt.date)"
            :venue="evt.venue"
            :venue-address="evt.venueAddress"
            :wording="evt.customization ? JSON.parse(evt.customization).wording : ''"
          />
        </div>
      </div>

      <!-- RSVP Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-4 text-center">
          <p class="font-display font-bold text-2xl text-charcoal-900">{{ rsvpStats.total }}</p>
          <p class="text-charcoal-500 text-sm">{{ $t('eventDetail.totalGuests') }}</p>
        </div>
        <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-4 text-center">
          <p class="font-display font-bold text-2xl text-green-600">{{ rsvpStats.confirmed }}</p>
          <p class="text-charcoal-500 text-sm">{{ $t('eventDetail.confirmed') }}</p>
        </div>
        <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-4 text-center">
          <p class="font-display font-bold text-2xl text-red-600">{{ rsvpStats.declined }}</p>
          <p class="text-charcoal-500 text-sm">{{ $t('eventDetail.declined') }}</p>
        </div>
        <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-4 text-center">
          <p class="font-display font-bold text-2xl text-yellow-600">{{ rsvpStats.maybe }}</p>
          <p class="text-charcoal-500 text-sm">{{ $t('eventDetail.maybe') }}</p>
        </div>
        <div class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-4 text-center">
          <p class="font-display font-bold text-2xl text-charcoal-400">{{ rsvpStats.pending }}</p>
          <p class="text-charcoal-500 text-sm">{{ $t('eventDetail.pending') }}</p>
        </div>
      </div>

      <!-- Email & PDF Actions -->
      <div v-if="evt.paymentStatus === 'paid' && !isLocked" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">{{ $t('eventDetail.actions') }}</h2>
        <div class="flex flex-wrap gap-3">
          <!-- Send Invitations -->
          <button
            v-if="evt.tier?.hasEmailDelivery"
            @click="sendInvitations"
            :disabled="sendingEmails"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {{ sendingEmails ? $t('eventDetail.sending') : $t('eventDetail.sendInvitations') }}
          </button>

          <!-- Download PDF -->
          <button
            v-if="evt.tier?.hasPdfExport"
            @click="downloadPdf"
            :disabled="downloadingPdf"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-charcoal-200 text-charcoal-700 rounded-full text-sm font-medium hover:border-champagne-400 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {{ downloadingPdf ? $t('eventDetail.generating') : $t('eventDetail.downloadPdf') }}
          </button>
        </div>

        <!-- Email Result Feedback -->
        <div v-if="emailResult" class="mt-3 p-3 rounded-lg text-sm"
          :class="emailResult.failed ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'">
          <template v-if="emailResult.message">{{ emailResult.message }}</template>
          <template v-else>
            {{ $t('eventDetail.sentCount', { sent: emailResult.sent }, emailResult.sent) }}<template v-if="emailResult.failed">{{ $t('eventDetail.failedCount', { failed: emailResult.failed }) }}</template>.
          </template>
        </div>
        <div v-if="emailError" class="mt-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {{ emailError }}
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="border border-red-200 rounded-2xl shadow-sm p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-2">{{ $t('eventDetail.dangerZone') }}</h2>
        <p class="text-sm text-charcoal-500 mb-4">{{ $t('eventDetail.dangerZoneDescription') }}</p>
        <button
          v-if="!showDeleteConfirm"
          @click="showDeleteConfirm = true"
          class="px-4 py-2 border border-red-300 text-red-600 rounded-full text-sm font-medium hover:bg-red-50 transition-colors"
        >
          {{ $t('eventDetail.deleteEvent') }}
        </button>
        <div v-else class="flex items-center gap-3">
          <p class="text-sm text-red-600 font-medium">{{ $t('eventDetail.confirmDelete') }}</p>
          <button
            @click="deleteEvent"
            :disabled="deleting"
            class="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {{ deleting ? $t('eventDetail.deleting') : $t('eventDetail.deleteConfirm') }}
          </button>
          <button
            @click="showDeleteConfirm = false"
            class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-600 hover:border-champagne-400 transition-colors"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="flex gap-3">
        <NuxtLink :to="`/dashboard/events/${eventId}/guests`"
          class="flex-1 bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-6 text-center hover:border-champagne-400 hover:shadow-md transition-all duration-200">
          <p class="font-medium text-charcoal-900">{{ $t('eventDetail.manageGuests') }}</p>
          <p class="text-sm text-charcoal-500 mt-1">{{ $t('eventDetail.manageGuestsDescription') }}</p>
        </NuxtLink>
        <a v-if="evt.paymentStatus === 'paid' && !isLocked"
          :href="invitationUrl" target="_blank" rel="noopener noreferrer"
          class="flex-1 bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-6 text-center hover:border-champagne-400 hover:shadow-md transition-all duration-200">
          <p class="font-medium text-charcoal-900">{{ $t('eventDetail.viewInvitation') }}</p>
          <p class="text-sm text-charcoal-500 mt-1">{{ $t('eventDetail.viewInvitationDescription') }}</p>
        </a>
      </div>
    </div>
  </div>
</template>

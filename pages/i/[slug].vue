<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string
const guestToken = computed(() => route.query.g as string | undefined)
const isPrint = computed(() => route.query.print === 'true')

const { data: invitation, error } = await useFetch(`/api/invitations/${slug}`)

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
}

// RSVP form state
const { data: guestData, refresh: refreshGuest } = await useFetch(
  () => guestToken.value ? `/api/rsvp/${guestToken.value}` : '',
  { immediate: !!guestToken.value },
)

const rsvpForm = reactive({
  rsvpStatus: '' as string,
  plusOne: false,
  plusOneName: '',
})

const rsvpSubmitting = ref(false)
const rsvpSuccess = ref(false)
const rsvpError = ref('')

watch(guestData, (data) => {
  if (data) {
    rsvpForm.rsvpStatus = data.rsvpStatus !== 'pending' ? data.rsvpStatus : ''
    rsvpForm.plusOne = data.plusOne || false
    rsvpForm.plusOneName = data.plusOneName || ''
  }
}, { immediate: true })

async function submitRsvp() {
  if (!guestToken.value || !rsvpForm.rsvpStatus) return
  rsvpSubmitting.value = true
  rsvpError.value = ''

  try {
    await $fetch(`/api/rsvp/${guestToken.value}`, {
      method: 'POST',
      body: {
        rsvpStatus: rsvpForm.rsvpStatus,
        plusOne: rsvpForm.plusOne,
        plusOneName: rsvpForm.plusOneName,
      },
    })
    rsvpSuccess.value = true
    await refreshGuest()
  } catch (e: any) {
    rsvpError.value = e.data?.statusMessage || 'Something went wrong'
  } finally {
    rsvpSubmitting.value = false
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

useSeoMeta({
  title: () => invitation.value
    ? `${invitation.value.coupleName1} & ${invitation.value.coupleName2}'s Wedding`
    : 'Wedding Invitation',
  description: () => invitation.value
    ? `You're invited to ${invitation.value.coupleName1} & ${invitation.value.coupleName2}'s wedding on ${formatDate(invitation.value.date)}.`
    : '',
  ogTitle: () => invitation.value
    ? `${invitation.value.coupleName1} & ${invitation.value.coupleName2}'s Wedding`
    : 'Wedding Invitation',
  ogDescription: () => invitation.value
    ? `Join us on ${formatDate(invitation.value.date)} at ${invitation.value.venue}`
    : '',
  ogType: 'website',
})
</script>

<template>
  <div v-if="invitation" class="min-h-screen bg-[#faf8f5]">
    <div class="max-w-2xl mx-auto px-6 py-16">

      <!-- Hero -->
      <section class="text-center mb-16">
        <p class="text-sm uppercase tracking-[0.3em] text-champagne-500 mb-6">Together with their families</p>
        <h1 class="font-serif text-5xl md:text-6xl text-charcoal-900 leading-tight mb-4">
          {{ invitation.coupleName1 }}
        </h1>
        <p class="font-serif text-2xl text-champagne-500 my-2">&amp;</p>
        <h1 class="font-serif text-5xl md:text-6xl text-charcoal-900 leading-tight mb-8">
          {{ invitation.coupleName2 }}
        </h1>
        <div class="w-24 h-px bg-champagne-400 mx-auto mb-6" />
        <p class="font-serif text-xl text-charcoal-300">
          {{ formatDate(invitation.date) }}
        </p>
      </section>

      <!-- Wording / Customization -->
      <section v-if="invitation.customization?.wording" class="text-center mb-16">
        <p class="font-serif text-lg text-charcoal-500 leading-relaxed whitespace-pre-line">
          {{ invitation.customization.wording }}
        </p>
      </section>

      <!-- Description -->
      <section v-if="invitation.description" class="text-center mb-16">
        <div class="w-16 h-px bg-champagne-400 mx-auto mb-6" />
        <p class="text-charcoal-300 leading-relaxed whitespace-pre-line">{{ invitation.description }}</p>
      </section>

      <!-- Venue -->
      <section class="text-center mb-16">
        <h2 class="font-serif text-2xl text-charcoal-900 mb-4">Venue</h2>
        <p class="text-lg font-medium text-charcoal-700 mb-1">{{ invitation.venue }}</p>
        <p class="text-charcoal-300 mb-4">{{ invitation.venueAddress }}</p>
        <a
          v-if="invitation.venueMapUrl"
          :href="invitation.venueMapUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-champagne-600 hover:text-champagne-600 text-sm font-medium"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          View on Map
        </a>
      </section>

      <!-- RSVP Section -->
      <section v-if="!isPrint" class="mb-16">
        <div class="bg-white rounded-2xl shadow-sm border border-charcoal-100 p-8 text-center">
          <h2 class="font-serif text-2xl text-charcoal-900 mb-6">RSVP</h2>

          <!-- No token -->
          <div v-if="!guestToken">
            <p class="text-charcoal-300">Please use the personal link sent to you to RSVP.</p>
          </div>

          <!-- Success state -->
          <div v-else-if="rsvpSuccess">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-green-600 text-xl">&#10003;</span>
            </div>
            <p class="text-lg font-medium text-charcoal-900 mb-1">Thank you, {{ guestData?.name }}!</p>
            <p class="text-charcoal-300">
              <template v-if="rsvpForm.rsvpStatus === 'confirmed'">We can't wait to celebrate with you!</template>
              <template v-else-if="rsvpForm.rsvpStatus === 'declined'">We're sorry you can't make it.</template>
              <template v-else>We hope to see you there!</template>
            </p>
          </div>

          <!-- RSVP Form -->
          <div v-else-if="guestData">
            <p class="text-charcoal-500 mb-6">
              Dear <span class="font-medium">{{ guestData.name }}</span>, please let us know if you'll be joining us.
            </p>

            <div v-if="rsvpError" class="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{{ rsvpError }}</div>

            <div class="space-y-3 mb-6">
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'confirmed' ? 'border-green-300 bg-green-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="confirmed" class="text-green-600" />
                <span class="text-sm font-medium">Joyfully Accept</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'declined' ? 'border-red-300 bg-red-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="declined" class="text-red-600" />
                <span class="text-sm font-medium">Respectfully Decline</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'maybe' ? 'border-yellow-300 bg-yellow-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="maybe" class="text-yellow-600" />
                <span class="text-sm font-medium">Maybe</span>
              </label>
            </div>

            <!-- Plus one -->
            <div v-if="rsvpForm.rsvpStatus === 'confirmed'" class="mb-6 text-left">
              <label class="flex items-center gap-3 mb-3 cursor-pointer">
                <input type="checkbox" v-model="rsvpForm.plusOne" class="rounded text-champagne-600" />
                <span class="text-sm font-medium text-charcoal-500">I'll be bringing a plus one</span>
              </label>
              <input
                v-if="rsvpForm.plusOne"
                v-model="rsvpForm.plusOneName"
                type="text"
                placeholder="Plus one's name"
                class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500 focus:border-champagne-500"
              />
            </div>

            <button
              @click="submitRsvp"
              :disabled="!rsvpForm.rsvpStatus || rsvpSubmitting"
              class="w-full bg-champagne-600 text-white py-3 rounded-lg font-medium hover:bg-champagne-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ rsvpSubmitting ? 'Submitting...' : 'Submit RSVP' }}
            </button>
          </div>

          <!-- Loading -->
          <div v-else>
            <p class="text-charcoal-200">Loading...</p>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer v-if="!isPrint && !invitation.removeBranding" class="text-center pt-8 border-t border-charcoal-100">
        <p class="text-xs text-charcoal-200">Powered by <span class="font-medium">Eloria</span></p>
      </footer>
    </div>
  </div>
</template>

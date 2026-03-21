<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
const route = useRoute()
const eventId = route.params.id
const sessionId = route.query.session_id as string | undefined

const verifying = ref(true)
const verified = ref(false)
const error = ref('')

onMounted(async () => {
  if (!sessionId) {
    verifying.value = false
    verified.value = true
    return
  }

  try {
    const data = await $fetch<{ status: string }>('/api/payments/verify', {
      method: 'POST',
      body: { sessionId, eventId: parseInt(eventId as string) },
    })
    verified.value = data.status === 'paid'
    if (!verified.value) {
      error.value = 'Payment is still processing. Please check back shortly.'
    }
  } catch {
    error.value = 'Could not verify payment. Please check your event dashboard.'
  } finally {
    verifying.value = false
  }
})
</script>

<template>
  <div class="max-w-lg mx-auto text-center py-12">
    <!-- Loading state -->
    <template v-if="verifying">
      <div class="w-16 h-16 bg-charcoal-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
        <span class="text-charcoal-500 text-2xl">&#8987;</span>
      </div>
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">Verifying Payment...</h1>
      <p class="text-charcoal-500 mb-6">Please wait while we confirm your payment.</p>
    </template>

    <!-- Success state -->
    <template v-else-if="verified">
      <div class="w-16 h-16 bg-champagne-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span class="text-champagne-500 text-2xl">&#10003;</span>
      </div>
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">Payment Successful!</h1>
      <p class="text-charcoal-500 mb-6">Your invitation is now live. Share it with your guests!</p>
    </template>

    <!-- Error/pending state -->
    <template v-else>
      <div class="w-16 h-16 bg-champagne-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span class="text-champagne-600 text-2xl">&#9888;</span>
      </div>
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">Payment Processing</h1>
      <p class="text-charcoal-500 mb-6">{{ error }}</p>
    </template>

    <NuxtLink :to="`/dashboard/events/${eventId}`"
      class="bg-champagne-500 text-charcoal-900 px-6 py-2 rounded-full font-medium hover:bg-champagne-600 transition-colors">
      Go to Event Dashboard
    </NuxtLink>
  </div>
</template>

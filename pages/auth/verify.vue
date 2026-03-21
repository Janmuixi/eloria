<script setup lang="ts">
definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Verify Email - Eloria',
})

const route = useRoute()
const token = route.query.token as string | undefined

const verifying = ref(true)
const success = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  if (!token) {
    errorMessage.value = 'No verification token provided.'
    verifying.value = false
    return
  }

  try {
    await $fetch('/api/auth/verify', {
      method: 'POST',
      body: { token },
    })
    success.value = true
  } catch (e: any) {
    errorMessage.value = e.data?.statusMessage || 'Verification failed. The link may have expired.'
  } finally {
    verifying.value = false
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ivory-50 px-4">
    <div class="w-full max-w-md text-center">
      <!-- Loading -->
      <div v-if="verifying">
        <UiLoadingSpinner />
        <p class="text-charcoal-300 mt-4">Verifying your email...</p>
      </div>

      <!-- Success -->
      <div v-else-if="success" class="bg-white rounded-lg shadow p-8">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-green-600 text-2xl">&#10003;</span>
        </div>
        <h1 class="font-display text-2xl font-bold text-charcoal-900 mb-2">Email Verified!</h1>
        <p class="text-charcoal-300 mb-6">Your email has been verified successfully.</p>
        <NuxtLink to="/dashboard"
          class="inline-block bg-champagne-500 text-charcoal-900 px-6 py-2 rounded-full font-medium hover:bg-champagne-600">
          Go to Dashboard
        </NuxtLink>
      </div>

      <!-- Error -->
      <div v-else class="bg-white rounded-lg shadow p-8">
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-red-600 text-2xl">&#10007;</span>
        </div>
        <h1 class="font-display text-2xl font-bold text-charcoal-900 mb-2">Verification Failed</h1>
        <p class="text-charcoal-300 mb-6">{{ errorMessage }}</p>
        <NuxtLink to="/dashboard"
          class="inline-block bg-champagne-500 text-charcoal-900 px-6 py-2 rounded-full font-medium hover:bg-champagne-600">
          Go to Dashboard
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

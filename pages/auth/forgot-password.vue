<script setup lang="ts">
definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Reset Password - Eloria',
})

const email = ref('')
const error = ref('')
const success = ref(false)
const submitting = ref(false)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  
  try {
    await $fetch('/api/auth/request-reset', {
      method: 'POST',
      body: { email: email.value },
    })
    success.value = true
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to send reset link'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="font-display font-semibold text-2xl text-charcoal-900 text-center mb-6">Reset your password</h1>
    
    <div v-if="success" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200">
      <div class="text-center">
        <div class="text-green-600 mb-4">
          <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p class="text-charcoal-700 mb-4">If your email is registered, you will receive a password reset link.</p>
        <NuxtLink to="/auth/login" class="text-champagne-600 hover:text-champagne-500 underline">
          Back to sign in
        </NuxtLink>
      </div>
    </div>
    
    <form v-else @submit.prevent="onSubmit" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200 space-y-4">
      <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>
      
      <p class="text-charcoal-600 text-sm">
        Enter your email address and we'll send you a link to reset your password.
      </p>
      
      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">Email</label>
        <input v-model="email" type="email" required
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors"
          placeholder="you@example.com" />
      </div>
      
      <button type="submit" :disabled="submitting"
        class="w-full bg-champagne-500 text-white rounded-full py-2.5 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 disabled:opacity-50">
        {{ submitting ? 'Sending...' : 'Send reset link' }}
      </button>
      
      <p class="text-center text-sm text-charcoal-500">
        Remember your password? <NuxtLink to="/auth/login" class="text-champagne-600 hover:text-champagne-500 underline">Sign in</NuxtLink>
      </p>
    </form>
  </div>
</template>

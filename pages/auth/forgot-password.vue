<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()

useSeoMeta({
  title: t('seo.resetPassword'),
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
    error.value = e.data?.statusMessage || t('errors.failedToSendResetLink')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="font-display font-semibold text-2xl text-charcoal-900 text-center mb-6">{{ $t('auth.forgotPasswordTitle') }}</h1>

    <div v-if="success" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200">
      <div class="text-center">
        <div class="text-green-600 mb-4">
          <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p class="text-charcoal-700 mb-4">{{ $t('auth.resetLinkSent') }}</p>
        <NuxtLink to="/auth/login" class="text-champagne-600 hover:text-champagne-500 underline">
          {{ $t('auth.backToSignIn') }}
        </NuxtLink>
      </div>
    </div>

    <form v-else @submit.prevent="onSubmit" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200 space-y-4">
      <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>

      <p class="text-charcoal-600 text-sm">
        {{ $t('auth.forgotPasswordDescription') }}
      </p>

      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('common.email') }}</label>
        <input v-model="email" type="email" required
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors"
          placeholder="you@example.com" />
      </div>

      <button type="submit" :disabled="submitting"
        class="w-full bg-champagne-500 text-white rounded-full py-2.5 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 disabled:opacity-50">
        {{ submitting ? $t('auth.sendingResetLink') : $t('auth.sendResetLink') }}
      </button>

      <p class="text-center text-sm text-charcoal-500">
        {{ $t('auth.rememberPassword') }} <NuxtLink to="/auth/login" class="text-champagne-600 hover:text-champagne-500 underline">{{ $t('auth.loginButton') }}</NuxtLink>
      </p>
    </form>
  </div>
</template>

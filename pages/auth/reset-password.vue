<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()

useSeoMeta({
  title: t('seo.setNewPassword'),
})

const route = useRoute()
const token = computed(() => route.query.token as string)

const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const submitting = ref(false)
const validating = ref(true)
const validToken = ref(false)
const userEmail = ref('')

onMounted(async () => {
  if (!token.value) {
    error.value = t('errors.invalidResetLink')
    validating.value = false
    return
  }

  try {
    const result = await $fetch('/api/auth/reset-password', {
      method: 'GET',
      query: { token: token.value },
    })
    validToken.value = true
    userEmail.value = result.user.email
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.invalidResetLink')
  } finally {
    validating.value = false
  }
})

async function onSubmit() {
  error.value = ''

  if (newPassword.value.length < 8) {
    error.value = t('auth.passwordMinLength')
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = t('auth.passwordsDoNotMatch')
    return
  }

  submitting.value = true

  try {
    const result = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: token.value,
        newPassword: newPassword.value,
      },
    })

    success.value = true

    setTimeout(() => {
      navigateTo('/dashboard')
    }, 2000)
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToResetPassword')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="font-display font-semibold text-2xl text-charcoal-900 text-center mb-6">{{ $t('auth.resetPasswordTitle') }}</h1>

    <div v-if="validating" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200 text-center">
      <div class="text-charcoal-500">{{ $t('auth.verifyingResetLink') }}</div>
    </div>

    <div v-else-if="success" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200">
      <div class="text-center">
        <div class="text-green-600 mb-4">
          <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p class="text-charcoal-700 mb-4">{{ $t('auth.passwordResetSuccess') }}</p>
        <p class="text-charcoal-500 text-sm">{{ $t('auth.redirectingToDashboard') }}</p>
      </div>
    </div>

    <form v-else-if="validToken" @submit.prevent="onSubmit" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200 space-y-4">
      <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>

      <p class="text-charcoal-600 text-sm">
        {{ $t('auth.newPasswordFor') }} <strong>{{ userEmail }}</strong>
      </p>

      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('auth.newPassword') }}</label>
        <input v-model="newPassword" type="password" required minlength="8"
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors"
          :placeholder="$t('auth.newPasswordPlaceholder')" />
      </div>

      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('auth.confirmPassword') }}</label>
        <input v-model="confirmPassword" type="password" required
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors"
          :placeholder="$t('auth.confirmPasswordPlaceholder')" />
      </div>

      <button type="submit" :disabled="submitting"
        class="w-full bg-champagne-500 text-white rounded-full py-2.5 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 disabled:opacity-50">
        {{ submitting ? $t('auth.resettingPassword') : $t('auth.resetPasswordButton') }}
      </button>
    </form>

    <div v-else class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200">
      <div class="text-center">
        <div class="text-red-600 mb-4">
          <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p class="text-charcoal-700 mb-4">{{ error || $t('auth.invalidResetLink') }}</p>
        <NuxtLink to="/auth/forgot-password" class="text-champagne-600 hover:text-champagne-500 underline">
          {{ $t('auth.requestNewResetLink') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

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
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

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
        <div class="relative">
          <input v-model="newPassword" :type="showNewPassword ? 'text' : 'password'" required minlength="8"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 pr-11 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors"
            :placeholder="$t('auth.newPasswordPlaceholder')" />
          <button type="button" @click="showNewPassword = !showNewPassword"
            :aria-label="showNewPassword ? t('aria.hidePassword') : t('aria.showPassword')"
            :aria-pressed="showNewPassword"
            class="absolute inset-y-0 right-0 flex items-center px-3 text-charcoal-500 hover:text-charcoal-700">
            <svg v-if="!showNewPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          </button>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('auth.confirmPassword') }}</label>
        <div class="relative">
          <input v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" required
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 pr-11 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors"
            :placeholder="$t('auth.confirmPasswordPlaceholder')" />
          <button type="button" @click="showConfirmPassword = !showConfirmPassword"
            :aria-label="showConfirmPassword ? t('aria.hidePassword') : t('aria.showPassword')"
            :aria-pressed="showConfirmPassword"
            class="absolute inset-y-0 right-0 flex items-center px-3 text-charcoal-500 hover:text-charcoal-700">
            <svg v-if="!showConfirmPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          </button>
        </div>
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

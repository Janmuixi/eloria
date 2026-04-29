<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()

useSeoMeta({
  title: t('seo.createAccount'),
  robots: 'noindex, nofollow',
})

const { register } = useAuth()
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const submitting = ref(false)
const showPassword = ref(false)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await register(form.email, form.password, form.name)
    navigateTo('/dashboard')
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.registrationFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="font-display font-semibold text-2xl text-charcoal-900 text-center mb-6">{{ $t('auth.registerTitle') }}</h1>
    <form @submit.prevent="onSubmit" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200 space-y-4">
      <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>
      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('common.name') }}</label>
        <input v-model="form.name" type="text" required
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors" />
      </div>
      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('common.email') }}</label>
        <input v-model="form.email" type="email" required
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors" />
      </div>
      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('common.password') }}</label>
        <div class="relative">
          <input v-model="form.password" :type="showPassword ? 'text' : 'password'" required minlength="8"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 pr-11 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors" />
          <button type="button" @click="showPassword = !showPassword"
            :aria-label="showPassword ? t('aria.hidePassword') : t('aria.showPassword')"
            :aria-pressed="showPassword"
            class="absolute inset-y-0 right-0 flex items-center px-3 text-charcoal-500 hover:text-charcoal-700">
            <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        {{ submitting ? $t('auth.registerSubmitting') : $t('auth.registerButton') }}
      </button>
      <p class="text-center text-sm text-charcoal-500">
        {{ $t('auth.hasAccount') }} <NuxtLink to="/auth/login" class="text-champagne-600 hover:text-champagne-500 underline">{{ $t('auth.loginButton') }}</NuxtLink>
      </p>
    </form>
  </div>
</template>

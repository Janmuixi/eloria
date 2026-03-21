<script setup lang="ts">
definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Sign In - Eloria',
})

const { login } = useAuth()
const form = reactive({ email: '', password: '' })
const error = ref('')
const submitting = ref(false)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await login(form.email, form.password)
    navigateTo('/dashboard')
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Login failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="font-display font-semibold text-2xl text-charcoal-900 text-center mb-6">Sign in to Eloria</h1>
    <form @submit.prevent="onSubmit" class="bg-ivory-100 rounded-2xl p-8 shadow-sm border border-charcoal-200 space-y-4">
      <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>
      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">Email</label>
        <input v-model="form.email" type="email" required
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors" />
      </div>
      <div>
        <label class="block text-sm font-medium text-charcoal-700 mb-1">Password</label>
        <input v-model="form.password" type="password" required minlength="8"
          class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-500 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none transition-colors" />
      </div>
      <button type="submit" :disabled="submitting"
        class="w-full bg-champagne-500 text-white rounded-full py-2.5 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 disabled:opacity-50">
        {{ submitting ? 'Signing in...' : 'Sign in' }}
      </button>
      <p class="text-center text-sm text-charcoal-500">
        Don't have an account? <NuxtLink to="/auth/register" class="text-champagne-600 hover:text-champagne-500 underline">Create one</NuxtLink>
      </p>
    </form>
  </div>
</template>

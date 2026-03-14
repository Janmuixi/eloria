<script setup lang="ts">
definePageMeta({ layout: 'auth' })

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
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-md">
      <h1 class="text-3xl font-bold text-center mb-8">Sign in to Eloria</h1>
      <form @submit.prevent="onSubmit" class="bg-white rounded-lg shadow p-8 space-y-4">
        <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input v-model="form.email" type="email" required
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Password</label>
          <input v-model="form.password" type="password" required minlength="8"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <button type="submit" :disabled="submitting"
          class="w-full bg-primary-600 text-white rounded-lg py-2 font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ submitting ? 'Signing in...' : 'Sign in' }}
        </button>
        <p class="text-center text-sm text-gray-500">
          Don't have an account? <NuxtLink to="/auth/register" class="text-primary-600 hover:underline">Create one</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>

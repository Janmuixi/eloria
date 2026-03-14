<script setup lang="ts">
definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Create Account - Eloria',
})

const { register } = useAuth()
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const submitting = ref(false)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await register(form.email, form.password, form.name)
    navigateTo('/dashboard')
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Registration failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-md">
      <h1 class="text-3xl font-bold text-center mb-8">Create your Eloria account</h1>
      <form @submit.prevent="onSubmit" class="bg-white rounded-lg shadow p-8 space-y-4">
        <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm">{{ error }}</div>
        <div>
          <label class="block text-sm font-medium mb-1">Name</label>
          <input v-model="form.name" type="text" required
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
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
          {{ submitting ? 'Creating account...' : 'Create account' }}
        </button>
        <p class="text-center text-sm text-gray-500">
          Already have an account? <NuxtLink to="/auth/login" class="text-primary-600 hover:underline">Sign in</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>

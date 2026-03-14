<script setup lang="ts">
const { user, loading, fetchUser, logout } = useAuth()

onMounted(async () => {
  if (loading.value) {
    await fetchUser()
  }
})

const mobileOpen = ref(false)
</script>

<template>
  <header class="bg-white border-b border-gray-200">
    <nav class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <!-- Logo -->
      <NuxtLink to="/" class="text-xl font-bold text-primary-600">Eloria</NuxtLink>

      <!-- Desktop nav links -->
      <div class="hidden md:flex items-center gap-8">
        <NuxtLink to="/templates" class="text-gray-600 hover:text-gray-900 text-sm font-medium">Templates</NuxtLink>
        <NuxtLink to="/pricing" class="text-gray-600 hover:text-gray-900 text-sm font-medium">Pricing</NuxtLink>
      </div>

      <!-- Desktop auth buttons -->
      <div class="hidden md:flex items-center gap-4">
        <template v-if="!loading">
          <template v-if="user">
            <NuxtLink to="/dashboard" class="text-gray-600 hover:text-gray-900 text-sm font-medium">Dashboard</NuxtLink>
            <button
              @click="logout"
              class="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </template>
          <template v-else>
            <NuxtLink to="/auth/login" class="text-gray-600 hover:text-gray-900 text-sm font-medium">Sign in</NuxtLink>
            <NuxtLink
              to="/auth/register"
              class="bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Get Started
            </NuxtLink>
          </template>
        </template>
      </div>

      <!-- Mobile hamburger -->
      <button
        class="md:hidden text-gray-600 hover:text-gray-900"
        @click="mobileOpen = !mobileOpen"
        aria-label="Toggle menu"
      >
        <svg v-if="!mobileOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </nav>

    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="md:hidden border-t border-gray-100 px-6 py-4 space-y-3">
      <NuxtLink to="/templates" class="block text-gray-600 hover:text-gray-900 text-sm font-medium" @click="mobileOpen = false">Templates</NuxtLink>
      <NuxtLink to="/pricing" class="block text-gray-600 hover:text-gray-900 text-sm font-medium" @click="mobileOpen = false">Pricing</NuxtLink>
      <hr class="border-gray-100" />
      <template v-if="!loading">
        <template v-if="user">
          <NuxtLink to="/dashboard" class="block text-gray-600 hover:text-gray-900 text-sm font-medium" @click="mobileOpen = false">Dashboard</NuxtLink>
          <button @click="logout(); mobileOpen = false" class="block text-sm text-gray-500 hover:text-gray-700">Sign out</button>
        </template>
        <template v-else>
          <NuxtLink to="/auth/login" class="block text-gray-600 hover:text-gray-900 text-sm font-medium" @click="mobileOpen = false">Sign in</NuxtLink>
          <NuxtLink
            to="/auth/register"
            class="block text-center bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            @click="mobileOpen = false"
          >
            Get Started
          </NuxtLink>
        </template>
      </template>
    </div>
  </header>
</template>

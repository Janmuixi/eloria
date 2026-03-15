<template>
  <div class="min-h-screen bg-ivory-50">
    <!-- Mobile header -->
    <div class="lg:hidden bg-white border-b px-4 py-3 flex items-center justify-between">
      <NuxtLink to="/" class="text-xl font-bold text-primary-600">Eloria</NuxtLink>
      <button @click="sidebarOpen = true" class="p-2 text-gray-600 hover:text-gray-900">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>

    <!-- Mobile sidebar overlay -->
    <div v-if="sidebarOpen" class="fixed inset-0 z-40 lg:hidden">
      <div class="fixed inset-0 bg-black/50" @click="sidebarOpen = false" />
      <aside class="fixed inset-y-0 left-0 w-64 bg-white z-50">
        <div class="p-6 flex items-center justify-between">
          <NuxtLink to="/" class="text-2xl font-bold text-primary-900">Eloria</NuxtLink>
          <button @click="sidebarOpen = false" class="p-1 text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav class="px-4 space-y-1">
          <NuxtLink to="/dashboard" @click="sidebarOpen = false"
            class="flex items-center px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100"
            active-class="bg-primary-50 text-primary-700">
            My Events
          </NuxtLink>
          <NuxtLink to="/dashboard/events/new" @click="sidebarOpen = false"
            class="flex items-center px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100"
            active-class="bg-primary-50 text-primary-700">
            Create Event
          </NuxtLink>
        </nav>
      </aside>
    </div>

    <!-- Desktop sidebar -->
    <aside class="fixed inset-y-0 left-0 w-64 bg-white border-r hidden lg:block">
      <div class="p-6">
        <NuxtLink to="/" class="text-2xl font-bold text-primary-900">Eloria</NuxtLink>
      </div>
      <nav class="px-4 space-y-1">
        <NuxtLink to="/dashboard"
          class="flex items-center px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100"
          active-class="bg-primary-50 text-primary-700">
          My Events
        </NuxtLink>
        <NuxtLink to="/dashboard/events/new"
          class="flex items-center px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100"
          active-class="bg-primary-50 text-primary-700">
          Create Event
        </NuxtLink>
      </nav>
    </aside>

    <!-- Main -->
    <div class="lg:pl-64">
      <header class="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Dashboard</h2>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">{{ user?.name }}</span>
          <button @click="logout" class="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
        </div>
      </header>
      <div class="p-6">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { user, logout, fetchUser, loading } = useAuth()
const sidebarOpen = ref(false)

onMounted(async () => {
  if (loading.value) await fetchUser()
})
</script>

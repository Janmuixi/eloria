<template>
  <div class="min-h-screen bg-ivory-50">
    <!-- Mobile header -->
    <div class="lg:hidden bg-white border-b border-charcoal-200 px-4 py-3 flex items-center justify-between">
      <NuxtLinkLocale to="/" class="inline-flex items-center">
        <img src="/eloria-wordmark-charcoal.svg" alt="Eloria" class="h-12 w-auto" />
      </NuxtLinkLocale>
      <button @click="sidebarOpen = true" class="p-2 text-charcoal-700 hover:text-charcoal-900">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>

    <!-- Mobile sidebar overlay -->
    <div v-if="sidebarOpen" class="fixed inset-0 z-40 lg:hidden">
      <div class="fixed inset-0 bg-black/50" @click="sidebarOpen = false" />
      <aside class="fixed inset-y-0 left-0 w-64 bg-ivory-100 z-50">
        <div class="p-6 flex items-center justify-between">
          <NuxtLinkLocale to="/" class="inline-flex items-center">
            <img src="/eloria-wordmark-charcoal.svg" alt="Eloria" class="h-12 w-auto" />
          </NuxtLinkLocale>
          <button @click="sidebarOpen = false" class="p-1 text-charcoal-500 hover:text-charcoal-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav class="px-4 space-y-1">
          <NuxtLinkLocale to="/dashboard" @click="sidebarOpen = false"
            class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
            active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
            {{ t('dashboard.myEvents') }}
          </NuxtLinkLocale>
          <NuxtLinkLocale to="/dashboard/events/new" @click="sidebarOpen = false"
            class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
            active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
            {{ t('dashboard.createEvent') }}
          </NuxtLinkLocale>
          <NuxtLinkLocale to="/dashboard/account" @click="sidebarOpen = false"
            class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
            active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
            {{ t('nav.myAccount') }}
          </NuxtLinkLocale>
          <NuxtLinkLocale v-if="user?.isAdmin" to="/dashboard/admin" @click="sidebarOpen = false"
            class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
            active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
            Admin
          </NuxtLinkLocale>
        </nav>
      </aside>
    </div>

    <!-- Desktop sidebar -->
    <aside class="fixed inset-y-0 left-0 w-64 bg-ivory-100 border-r border-charcoal-200 hidden lg:block">
      <div class="p-6">
        <NuxtLinkLocale to="/" class="inline-flex items-center">
          <img src="/eloria-wordmark-charcoal.svg" alt="Eloria" class="h-12 w-auto" />
        </NuxtLinkLocale>
      </div>
      <nav class="px-4 space-y-1">
        <NuxtLinkLocale to="/dashboard"
          class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
          active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
          {{ t('dashboard.myEvents') }}
        </NuxtLinkLocale>
        <NuxtLinkLocale to="/dashboard/events/new"
          class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
          active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
          {{ t('dashboard.createEvent') }}
        </NuxtLinkLocale>
        <NuxtLinkLocale to="/dashboard/account"
          class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
          active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
          {{ t('nav.myAccount') }}
        </NuxtLinkLocale>
        <NuxtLinkLocale v-if="user?.isAdmin" to="/dashboard/admin"
          class="flex items-center px-3 py-2 rounded-lg text-sm text-charcoal-500 hover:text-charcoal-900 hover:bg-charcoal-100"
          active-class="bg-champagne-100 rounded-lg border-l-2 border-champagne-500 text-charcoal-900 font-medium">
          Admin
        </NuxtLinkLocale>
      </nav>
    </aside>

    <!-- Main -->
    <div class="lg:pl-64">
      <header class="bg-white border-b border-charcoal-200 px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-charcoal-900">{{ t('dashboard.title') }}</h2>
        <div class="flex items-center gap-4">
          <span class="text-sm text-charcoal-700">{{ user?.name }}</span>
          <button @click="logout" class="text-sm text-charcoal-500 hover:text-charcoal-700 hover:underline">{{ t('nav.signOut') }}</button>
        </div>
      </header>
      <div class="p-6">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { user, logout, fetchUser, loading } = useAuth()
const sidebarOpen = ref(false)

onMounted(async () => {
  if (loading.value) await fetchUser()
})
</script>

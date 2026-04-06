<script setup lang="ts">
const { t } = useI18n()
const { user, loading, fetchUser, logout } = useAuth()

onMounted(async () => {
  if (loading.value) {
    await fetchUser()
  }
})

const mobileOpen = ref(false)
</script>

<template>
  <header class="bg-white border-b border-charcoal-200">
    <nav class="max-w-7xl mx-auto px-6 py-4 flex items-center">
      <!-- Logo -->
      <div class="flex-1">
        <NuxtLink to="/" class="font-display font-semibold text-xl text-charcoal-900">Eloria</NuxtLink>
      </div>

      <!-- Desktop nav links (centered) -->
      <div class="hidden md:flex items-center gap-8">
        <NuxtLink to="/templates" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.templates') }}</NuxtLink>
        <NuxtLink to="/pricing" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.pricing') }}</NuxtLink>
      </div>

      <!-- Desktop auth buttons -->
      <div class="hidden md:flex flex-1 items-center justify-end gap-4">
        <template v-if="!loading">
          <template v-if="user">
            <NuxtLink to="/dashboard" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.dashboard') }}</NuxtLink>
            <button
              @click="logout"
              class="text-sm text-charcoal-500 hover:text-charcoal-700"
            >
              {{ $t('nav.signOut') }}
            </button>
          </template>
          <template v-else>
            <NuxtLink to="/auth/login" class="text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors">{{ $t('nav.signIn') }}</NuxtLink>
            <NuxtLink
              to="/auth/register"
              class="bg-champagne-500 text-white rounded-full px-5 py-2 font-medium hover:bg-champagne-600 transition-all duration-200 text-sm"
            >
              {{ $t('nav.getStarted') }}
            </NuxtLink>
          </template>
        </template>
      </div>

      <!-- Mobile hamburger -->
      <button
        class="md:hidden text-charcoal-700 hover:text-charcoal-900"
        @click="mobileOpen = !mobileOpen"
        :aria-label="t('aria.toggleMenu')"
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
    <div v-if="mobileOpen" class="md:hidden border-t border-charcoal-200 px-6 py-4 space-y-3">
      <NuxtLink to="/templates" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.templates') }}</NuxtLink>
      <NuxtLink to="/pricing" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.pricing') }}</NuxtLink>
      <hr class="border-charcoal-200" />
      <template v-if="!loading">
        <template v-if="user">
          <NuxtLink to="/dashboard" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.dashboard') }}</NuxtLink>
          <button @click="logout(); mobileOpen = false" class="block text-sm text-charcoal-500 hover:text-charcoal-700">{{ $t('nav.signOut') }}</button>
        </template>
        <template v-else>
          <NuxtLink to="/auth/login" class="block text-sm font-medium text-charcoal-700 hover:text-charcoal-900 hover:bg-champagne-100 rounded-full px-3 py-1 transition-colors" @click="mobileOpen = false">{{ $t('nav.signIn') }}</NuxtLink>
          <NuxtLink
            to="/auth/register"
            class="block text-center bg-champagne-500 text-white rounded-full px-5 py-2 font-medium hover:bg-champagne-600 transition-all duration-200 text-sm"
            @click="mobileOpen = false"
          >
            {{ $t('nav.getStarted') }}
          </NuxtLink>
        </template>
      </template>
    </div>
  </header>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { user } = useAuth()
const loggedIn = computed(() => user.value !== null)

const subscribing = ref(false)
async function startSubscription() {
  subscribing.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/subscriptions/create-checkout', { method: 'POST' })
    if (res.url) navigateTo(res.url, { external: true })
  } catch {
    navigateTo('/auth/login')
  } finally {
    subscribing.value = false
  }
}

useSeoMeta({
  title: t('pricing.seoTitle'),
  description: t('pricing.seoDescription'),
})

const { data: tiers } = await useFetch('/api/tiers')

function formatPrice(cents: number): string {
  if (cents === 0) return t('common.free')
  return `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} €`
}

function formatGuestLimit(limit: number | null): string {
  return limit ? t('pricing.guests', { count: limit }) : t('pricing.unlimitedGuests')
}

function isPremium(slug: string): boolean {
  return slug === 'premium'
}

function isPro(slug: string): boolean {
  return slug === 'pro'
}

interface Tier {
  id: number
  name: string
  slug: string
  price: number
  sortOrder: number
  guestLimit: number | null
  hasEmailDelivery: boolean | null
  hasPdfExport: boolean | null
  hasAiTextGeneration: boolean | null
  removeBranding: boolean | null
  hasMultipleVariants: boolean | null
  createdAt: string | null
}
</script>

<template>
  <div class="py-20">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center mb-16">
        <h1 class="font-display font-semibold text-4xl text-charcoal-900 mb-4">{{ $t('pricing.title') }}</h1>
        <p class="text-lg text-charcoal-500 max-w-2xl mx-auto">
          {{ $t('pricing.subtitle') }}
        </p>
      </div>

      <div v-if="tiers" class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        <div
          v-for="tier in (tiers as Tier[])"
          :key="tier.id"
          class="relative rounded-2xl p-8 flex flex-col shadow-sm"
          :class="isPro(tier.slug) ? 'bg-ivory-100 border-2 border-champagne-500 shadow-lg' : 'bg-ivory-100 border border-charcoal-200'"
        >
          <!-- Popular badge -->
          <div
            v-if="isPro(tier.slug)"
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-champagne-500 text-white rounded-full text-xs font-semibold px-3 py-1"
          >
            {{ $t('pricing.mostPopular') }}
          </div>

          <div class="mb-6">
            <h2 class="text-xl font-semibold text-charcoal-900">{{ tier.name }}</h2>
            <p class="text-sm text-charcoal-500 mt-1">
              {{ isPro(tier.slug) ? $t('pricing.audiencePlanners') : $t('pricing.audienceCouples') }}
            </p>
            <div class="mt-2">
              <span class="font-display font-bold text-4xl text-charcoal-900">{{ formatPrice(tier.price) }}</span>
              <span v-if="tier.price > 0" class="text-charcoal-500 text-sm ml-1">{{ isPro(tier.slug) ? $t('common.perMonth') : $t('common.oneTime') }}</span>
            </div>
          </div>

          <!-- Features -->
          <ul class="space-y-3 mb-8 flex-1">
            <li class="flex items-center gap-2 text-sm">
              <svg class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-charcoal-500">{{ isPro(tier.slug) ? $t('pricing.unlimitedEvents') : $t('pricing.oneEvent') }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-charcoal-500">{{ formatGuestLimit(tier.guestLimit) }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasEmailDelivery" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasEmailDelivery ? 'text-charcoal-500' : 'text-charcoal-300'">{{ $t('pricing.emailDelivery') }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasPdfExport" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasPdfExport ? 'text-charcoal-500' : 'text-charcoal-300'">{{ $t('pricing.pdfExport') }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasAiTextGeneration" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasAiTextGeneration ? 'text-charcoal-500' : 'text-charcoal-300'">{{ $t('pricing.aiTextGeneration') }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.removeBranding" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.removeBranding ? 'text-charcoal-500' : 'text-charcoal-300'">{{ $t('pricing.customBranding') }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasMultipleVariants" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasMultipleVariants ? 'text-charcoal-500' : 'text-charcoal-300'">{{ $t('pricing.multipleVariants') }}</span>
            </li>
          </ul>

          <button
            v-if="isPro(tier.slug) && loggedIn"
            @click="startSubscription"
            :disabled="subscribing"
            class="block w-full text-center font-medium py-2.5 transition-all duration-200 bg-champagne-500 text-white rounded-full hover:bg-champagne-600 hover:shadow-md disabled:opacity-60"
          >
            {{ subscribing ? $t('common.loading') : $t('pricing.subscribeNow') }}
          </button>
          <NuxtLink
            v-else
            to="/auth/register"
            class="block text-center font-medium py-2.5 transition-all duration-200"
            :class="isPro(tier.slug)
              ? 'bg-champagne-500 text-white rounded-full hover:bg-champagne-600 hover:shadow-md'
              : 'border border-charcoal-900 text-charcoal-900 rounded-full hover:bg-charcoal-100 hover:shadow-md'"
          >
            {{ $t('nav.getStarted') }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

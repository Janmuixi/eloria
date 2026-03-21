<script setup lang="ts">
useSeoMeta({
  title: 'Pricing - Eloria',
  description: 'Simple per-event pricing for your wedding invitations. Choose from Basic, Premium, or Pro plans.',
})

const { data: tiers } = await useFetch('/api/tiers')

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

function formatGuestLimit(limit: number | null): string {
  return limit ? `${limit} guests` : 'Unlimited guests'
}

function isPremium(slug: string): boolean {
  return slug === 'premium'
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
        <h1 class="font-display font-semibold text-4xl text-charcoal-900 mb-4">Simple, transparent pricing</h1>
        <p class="text-lg text-charcoal-500 max-w-2xl mx-auto">
          Choose the plan that fits your wedding. Start free and upgrade anytime.
        </p>
      </div>

      <div v-if="tiers" class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        <div
          v-for="tier in (tiers as Tier[])"
          :key="tier.id"
          class="relative rounded-2xl p-8 flex flex-col shadow-sm"
          :class="isPremium(tier.slug) ? 'bg-ivory-100 border-2 border-champagne-500 shadow-lg' : 'bg-ivory-100 border border-charcoal-200'"
        >
          <!-- Popular badge -->
          <div
            v-if="isPremium(tier.slug)"
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-champagne-500 text-white rounded-full text-xs font-semibold px-3 py-1"
          >
            Most Popular
          </div>

          <div class="mb-6">
            <h2 class="text-xl font-semibold text-charcoal-900">{{ tier.name }}</h2>
            <div class="mt-2">
              <span class="font-display font-bold text-4xl text-charcoal-900">{{ formatPrice(tier.price) }}</span>
              <span v-if="tier.price > 0" class="text-charcoal-500 text-sm ml-1">one-time</span>
            </div>
          </div>

          <!-- Features -->
          <ul class="space-y-3 mb-8 flex-1">
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
              <span :class="tier.hasEmailDelivery ? 'text-charcoal-500' : 'text-charcoal-300'">Email delivery</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasPdfExport" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasPdfExport ? 'text-charcoal-500' : 'text-charcoal-300'">PDF export</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasAiTextGeneration" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasAiTextGeneration ? 'text-charcoal-500' : 'text-charcoal-300'">AI text generation</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.removeBranding" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.removeBranding ? 'text-charcoal-500' : 'text-charcoal-300'">Custom branding</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg v-if="tier.hasMultipleVariants" class="w-5 h-5 text-champagne-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-charcoal-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span :class="tier.hasMultipleVariants ? 'text-charcoal-500' : 'text-charcoal-300'">Multiple variants</span>
            </li>
          </ul>

          <NuxtLink
            to="/auth/register"
            class="block text-center font-medium py-2.5 transition-all duration-200"
            :class="isPremium(tier.slug)
              ? 'bg-champagne-500 text-white rounded-full hover:bg-champagne-600 hover:shadow-md'
              : 'border border-charcoal-900 text-charcoal-900 rounded-full hover:bg-charcoal-100 hover:shadow-md'"
          >
            Get Started
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

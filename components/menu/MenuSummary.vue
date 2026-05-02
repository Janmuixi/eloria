<!-- components/menu/MenuSummary.vue -->
<script setup lang="ts">
import { ALLERGEN_KEYS } from '~/shared/menu'

defineProps<{
  summary: {
    courses: Array<{ id: number; name: string; options: Array<{ id: number; name: string; count: number }>; unpickedConfirmedGuests: number }>
    allergies: { keys: Record<string, number>; other: Array<{ text: string; count: number }> }
  }
  eventId: number | string
}>()

const localePath = useLocalePath()

function maxCount(opts: Array<{ count: number }>) {
  return Math.max(1, ...opts.map(o => o.count))
}
</script>

<template>
  <div class="space-y-6">
    <div v-for="course in summary.courses" :key="course.id" class="bg-white rounded-2xl border border-charcoal-100 p-5">
      <h3 class="font-medium text-charcoal-900 mb-4">{{ course.name }}</h3>
      <div class="space-y-2">
        <div v-for="o in course.options" :key="o.id" class="flex items-center gap-3">
          <NuxtLink :to="localePath(`/dashboard/events/${eventId}/guests?menuOption=${o.id}`)"
            class="text-sm w-40 truncate hover:underline">{{ o.name }}</NuxtLink>
          <div class="flex-1 h-2 bg-ivory-100 rounded-full overflow-hidden">
            <div class="h-full bg-champagne-500" :style="{ width: `${(o.count / maxCount(course.options)) * 100}%` }" />
          </div>
          <span class="text-sm text-charcoal-500 w-8 text-right">{{ o.count }}</span>
        </div>
        <div v-if="course.unpickedConfirmedGuests > 0" class="text-sm text-charcoal-300 pt-2">
          {{ $t('menu.summary.noChoiceYet') }}: {{ course.unpickedConfirmedGuests }}
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-charcoal-100 p-5">
      <h3 class="font-medium text-charcoal-900 mb-4">{{ $t('menu.summary.allergies.title') }}</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <NuxtLink v-for="k in ALLERGEN_KEYS" :key="k"
          :to="localePath(`/dashboard/events/${eventId}/guests?allergy=${k}`)"
          class="flex items-center justify-between px-3 py-2 border border-charcoal-100 rounded-lg text-sm hover:bg-ivory-50">
          <span>{{ $t(`allergies.${k}`) }}</span>
          <span class="text-charcoal-300">{{ summary.allergies.keys[k] ?? 0 }}</span>
        </NuxtLink>
      </div>
      <div v-if="summary.allergies.other.length > 0" class="mt-4 space-y-1 text-sm">
        <div v-for="(o, i) in summary.allergies.other" :key="i" class="flex justify-between">
          <span class="italic">"{{ o.text }}"</span>
          <span class="text-charcoal-300">{{ o.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

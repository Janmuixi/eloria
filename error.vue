<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ error: { statusCode: number; statusMessage?: string } }>()

const heading = computed(() =>
  props.error.statusCode === 404 ? t('errors.pageNotFoundTitle') : t('errors.somethingWentWrong'),
)
const description = computed(() =>
  props.error.statusCode === 404 ? t('errors.pageNotFoundDescription') : (props.error.statusMessage || ''),
)

useHead({
  title: `${props.error.statusCode} — Eloria`,
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ivory-50 px-6">
    <div class="text-center">
      <p class="font-display font-bold text-6xl text-charcoal-900">{{ error.statusCode }}</p>
      <h1 class="font-display font-semibold text-2xl text-charcoal-900 mt-4">{{ heading }}</h1>
      <p v-if="description" class="text-charcoal-500 mt-2 max-w-md mx-auto">{{ description }}</p>
      <button
        @click="handleError"
        class="mt-8 bg-champagne-500 text-white rounded-full px-6 py-2.5 font-medium hover:bg-champagne-600 transition-all"
      >
        {{ $t('errors.goHome') }}
      </button>
    </div>
  </div>
</template>

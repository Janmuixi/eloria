<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; statusMessage: string } }>()

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ivory-50">
    <div class="text-center">
      <h1 class="text-6xl font-bold font-display text-charcoal-900">{{ error.statusCode }}</h1>
      <p class="text-xl text-charcoal-500 mt-4">{{ error.statusMessage || 'Something went wrong' }}</p>
      <button @click="handleError"
        class="mt-6 bg-champagne-500 text-charcoal-900 px-6 py-2 rounded-full hover:bg-champagne-600">
        Go Home
      </button>
    </div>
  </div>
</template>

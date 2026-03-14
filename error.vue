<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; statusMessage: string } }>()

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <h1 class="text-6xl font-bold text-gray-300">{{ error.statusCode }}</h1>
      <p class="text-xl text-gray-600 mt-4">{{ error.statusMessage || 'Something went wrong' }}</p>
      <button @click="handleError"
        class="mt-6 bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700">
        Go Home
      </button>
    </div>
  </div>
</template>

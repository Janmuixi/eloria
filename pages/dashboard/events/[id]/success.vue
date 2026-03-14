<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
const route = useRoute()
const eventId = route.params.id
</script>

<template>
  <div class="max-w-lg mx-auto text-center py-12">
    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <span class="text-green-600 text-2xl">&#10003;</span>
    </div>
    <h1 class="text-2xl font-bold mb-2">Payment Successful!</h1>
    <p class="text-gray-600 mb-6">Your invitation is now live. Share it with your guests!</p>
    <NuxtLink :to="`/dashboard/events/${eventId}`"
      class="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700">
      Go to Event Dashboard
    </NuxtLink>
  </div>
</template>

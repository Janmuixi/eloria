<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { data: events, status } = await useFetch('/api/events')
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">My Events</h1>
      <NuxtLink to="/dashboard/events/new"
        class="bg-champagne-500 text-white rounded-full px-5 py-2 font-medium hover:bg-champagne-600 transition-all duration-200">
        Create New Event
      </NuxtLink>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!events?.length" class="text-center py-12">
      <p class="text-charcoal-500 mb-4">You haven't created any events yet.</p>
      <NuxtLink to="/dashboard/events/new"
        class="bg-champagne-500 text-white rounded-full px-5 py-2 font-medium hover:bg-champagne-600 transition-all duration-200">
        Create Your First Event
      </NuxtLink>
    </div>

    <div v-else class="grid gap-4">
      <div v-for="evt in events" :key="evt.id"
        class="bg-ivory-100 border border-charcoal-200 rounded-2xl shadow-sm p-6 hover:border-champagne-400 hover:shadow-md transition-all duration-200 flex items-center justify-between">
        <div>
          <h3 class="font-display font-semibold text-lg text-charcoal-900">{{ evt.title }}</h3>
          <p class="text-sm text-charcoal-500">{{ evt.coupleName1 }} &amp; {{ evt.coupleName2 }} &middot; {{ evt.date }}</p>
        </div>
        <div class="flex items-center gap-3">
          <span :class="[
            'rounded-full px-3 py-1 text-xs font-medium',
            evt.paymentStatus === 'paid' ? 'bg-champagne-500 text-white' : 'bg-charcoal-100 text-charcoal-500'
          ]">
            {{ evt.paymentStatus === 'paid' ? 'Active' : 'Pending Payment' }}
          </span>
          <NuxtLink :to="`/dashboard/events/${evt.id}`"
            class="text-charcoal-700 hover:text-charcoal-900 font-medium hover:underline">
            Manage
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

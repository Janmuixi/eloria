<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { data: events, status } = await useFetch('/api/events')
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">My Events</h1>
      <NuxtLink to="/dashboard/events/new"
        class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
        Create New Event
      </NuxtLink>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!events?.length" class="text-center py-12">
      <p class="text-gray-500 mb-4">You haven't created any events yet.</p>
      <NuxtLink to="/dashboard/events/new"
        class="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700">
        Create Your First Event
      </NuxtLink>
    </div>

    <div v-else class="grid gap-4">
      <div v-for="evt in events" :key="evt.id"
        class="bg-white rounded-lg shadow p-6 flex items-center justify-between">
        <div>
          <h3 class="font-semibold">{{ evt.title }}</h3>
          <p class="text-sm text-gray-500">{{ evt.coupleName1 }} &amp; {{ evt.coupleName2 }} &middot; {{ evt.date }}</p>
        </div>
        <div class="flex items-center gap-3">
          <span :class="[
            'px-2 py-1 rounded text-xs font-medium',
            evt.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          ]">
            {{ evt.paymentStatus === 'paid' ? 'Active' : 'Pending Payment' }}
          </span>
          <NuxtLink :to="`/dashboard/events/${evt.id}`"
            class="text-primary-600 hover:underline text-sm font-medium">
            Manage
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Row = {
  id: number; email: string; name: string; emailVerified: boolean | null;
  googleId: string | null; stripeCustomerId: string | null; createdAt: string | null;
  eventCount: number;
  activeSubscription: { id: number; status: string; price: number; currentPeriodEnd: string | null; canceledAt: string | null } | null;
}

const PAGE_SIZE = 50
const offset = ref(0)
const qInput = ref('')
const qApplied = ref('')

let debounce: ReturnType<typeof setTimeout> | null = null
watch(qInput, (v) => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    qApplied.value = v
    offset.value = 0
  }, 300)
})

const url = computed(() => {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset.value))
  if (qApplied.value) params.set('q', qApplied.value)
  return `/api/admin/users?${params.toString()}`
})

const { data, status, refresh } = await useFetch<{ rows: Row[]; total: number; limit: number; offset: number }>(url)
watch(url, () => refresh())

const showingFrom = computed(() => (data.value ? offset.value + 1 : 0))
const showingTo = computed(() => Math.min(offset.value + PAGE_SIZE, data.value?.total ?? 0))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Users</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <div class="mb-4">
      <input v-model="qInput" type="search" placeholder="Search email or name"
        class="w-full md:w-80 px-4 py-2 border border-charcoal-200 rounded-full text-sm focus:outline-none focus:border-champagne-400" />
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.rows.length" class="text-center py-12 text-charcoal-500">No users.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Email</th>
            <th class="text-left px-4 py-2">Name</th>
            <th class="text-left px-4 py-2">Verified</th>
            <th class="text-left px-4 py-2">Events</th>
            <th class="text-left px-4 py-2">Active sub</th>
            <th class="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.rows" :key="row.id" class="border-t border-charcoal-100 hover:bg-ivory-50">
            <td class="px-4 py-2 text-charcoal-500">{{ row.id }}</td>
            <td class="px-4 py-2">
              <NuxtLinkLocale :to="`/dashboard/admin/users/${row.id}`" class="text-charcoal-900 hover:underline">
                {{ row.email }}
              </NuxtLinkLocale>
            </td>
            <td class="px-4 py-2 text-charcoal-700">{{ row.name }}</td>
            <td class="px-4 py-2">{{ row.emailVerified ? '✓' : '—' }}</td>
            <td class="px-4 py-2">{{ row.eventCount }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ row.activeSubscription?.status ?? '—' }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ row.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && data.total > 0" class="flex items-center justify-between mt-4 text-sm text-charcoal-500">
      <span>Showing {{ showingFrom }}–{{ showingTo }} of {{ data.total }}</span>
      <div class="flex gap-2">
        <button :disabled="offset === 0" @click="offset = Math.max(0, offset - PAGE_SIZE)"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Prev</button>
        <button :disabled="offset + PAGE_SIZE >= data.total" @click="offset = offset + PAGE_SIZE"
          class="px-3 py-1 border border-charcoal-200 rounded-full disabled:opacity-50">Next</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type Tpl = {
  id: number; name: string; slug: string; category: string;
  colorScheme: string; fontPairings: string; tags: string;
  createdAt: string | null;
  minimumTier: { id: number; slug: string; name: string };
}

const { data, status } = await useFetch<Tpl[]>('/api/admin/templates')
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">Templates</h1>
      <NuxtLinkLocale to="/dashboard/admin" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to admin</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <div v-else-if="!data?.length" class="text-center py-12 text-charcoal-500">No templates.</div>

    <div v-else class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-ivory-50 text-charcoal-700 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2">ID</th>
            <th class="text-left px-4 py-2">Slug</th>
            <th class="text-left px-4 py-2">Name</th>
            <th class="text-left px-4 py-2">Category</th>
            <th class="text-left px-4 py-2">Min tier</th>
            <th class="text-left px-4 py-2">Tags</th>
            <th class="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in data" :key="t.id" class="border-t border-charcoal-100">
            <td class="px-4 py-2 text-charcoal-500">{{ t.id }}</td>
            <td class="px-4 py-2">{{ t.slug }}</td>
            <td class="px-4 py-2 text-charcoal-700">{{ t.name }}</td>
            <td class="px-4 py-2">{{ t.category }}</td>
            <td class="px-4 py-2">{{ t.minimumTier.slug }}</td>
            <td class="px-4 py-2 text-xs text-charcoal-500 break-all">{{ t.tags }}</td>
            <td class="px-4 py-2 text-charcoal-500 text-xs">{{ t.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

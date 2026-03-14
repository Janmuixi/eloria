<script setup lang="ts">
useSeoMeta({
  title: 'Wedding Invitation Templates - Eloria',
  description: 'Browse our collection of beautiful wedding invitation templates. Rustic, modern, elegant, and more.',
})

const categories = ['All', 'Rustic', 'Modern', 'Elegant', 'Minimal'] as const
const activeCategory = ref<string>('All')

const { data: templates, refresh } = await useFetch('/api/templates', {
  query: computed(() =>
    activeCategory.value === 'All' ? {} : { category: activeCategory.value }
  ),
})

function selectCategory(cat: string) {
  activeCategory.value = cat
}

interface Template {
  id: number
  name: string
  category: string
  previewImageUrl: string
  minimumTierId: number
  tier: { slug: string; name: string } | null
}

function isBasicTier(template: Template): boolean {
  return template.tier?.slug === 'basic'
}

const categoryColors: Record<string, string> = {
  Rustic: 'bg-amber-100 text-amber-800',
  Modern: 'bg-blue-100 text-blue-800',
  Elegant: 'bg-purple-100 text-purple-800',
  Minimal: 'bg-gray-100 text-gray-800',
}
</script>

<template>
  <div class="py-20">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center mb-12">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Invitation Templates</h1>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Browse our collection of professionally designed wedding invitation templates. Find the perfect match for your style.
        </p>
      </div>

      <!-- Category filters -->
      <div class="flex flex-wrap justify-center gap-2 mb-12">
        <button
          v-for="cat in categories"
          :key="cat"
          @click="selectCategory(cat)"
          class="px-4 py-2 text-sm font-medium rounded-full transition-colors"
          :class="activeCategory === cat
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Template grid -->
      <div
        v-if="templates && (templates as Template[]).length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <div
          v-for="template in (templates as Template[])"
          :key="template.id"
          class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
        >
          <!-- Preview -->
          <div class="aspect-[4/3] bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center">
            <img
              v-if="template.previewImageUrl && !template.previewImageUrl.startsWith('placeholder')"
              :src="template.previewImageUrl"
              :alt="template.name"
              class="w-full h-full object-cover"
            />
            <span v-else class="text-primary-300 text-sm font-medium">Preview</span>
          </div>

          <div class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full"
                :class="categoryColors[template.category] || 'bg-gray-100 text-gray-800'"
              >
                {{ template.category }}
              </span>
              <span
                v-if="!isBasicTier(template)"
                class="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700"
              >
                Premium
              </span>
            </div>
            <h3 class="font-semibold text-gray-900">{{ template.name }}</h3>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-20">
        <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 mb-2">Templates coming soon!</h2>
        <p class="text-gray-500">We're designing beautiful invitations for you. Check back soon.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Wedding Invitation Templates - Eloria',
  description: 'Browse our collection of beautiful wedding invitation templates. Rustic, modern, elegant, and more.',
})

const categories = ['All', 'rustic', 'modern', 'elegant', 'minimal', 'classic'] as const
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
  rustic: 'bg-amber-100 text-amber-800',
  modern: 'bg-blue-100 text-blue-800',
  elegant: 'bg-purple-100 text-purple-800',
  minimal: 'bg-charcoal-100 text-charcoal-700',
  classic: 'bg-purple-100 text-purple-800',
}

const categoryGradients: Record<string, string> = {
  rustic: 'from-amber-800 via-amber-600 to-yellow-700',
  modern: 'from-slate-700 via-slate-500 to-slate-400',
  elegant: 'from-purple-900 via-purple-700 to-purple-500',
  minimal: 'from-charcoal-300 via-charcoal-200 to-white',
  classic: 'from-yellow-900 via-yellow-700 to-yellow-500',
}

const brokenImages = ref<Set<number>>(new Set())

function onImageError(templateId: number) {
  brokenImages.value.add(templateId)
}
</script>

<template>
  <div class="py-20">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center mb-12">
        <h1 class="font-display font-semibold text-4xl text-charcoal-900 mb-4">Invitation Templates</h1>
        <p class="text-lg text-charcoal-500 max-w-2xl mx-auto">
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
            ? 'bg-champagne-500 text-white rounded-full'
            : 'bg-charcoal-100 text-charcoal-500 rounded-full hover:bg-charcoal-200'"
        >
          {{ cat === 'All' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1) }}
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
          class="bg-ivory-100 border border-charcoal-200 rounded-2xl overflow-hidden hover:border-champagne-400 hover:shadow-md transition-all duration-200"
        >
          <!-- Preview -->
          <div class="aspect-[4/3] relative overflow-hidden">
            <img
              v-if="template.previewImageUrl && !brokenImages.has(template.id)"
              :src="template.previewImageUrl"
              :alt="template.name"
              class="w-full h-full object-cover"
              @error="onImageError(template.id)"
            />
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br"
              :class="categoryGradients[template.category] || 'from-champagne-400 to-champagne-100'"
            >
              <span class="text-white/90 text-2xl font-serif italic drop-shadow">{{ template.name }}</span>
              <span class="text-white/60 text-xs mt-1 uppercase tracking-widest">{{ template.category }}</span>
            </div>
          </div>

          <div class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full"
                :class="categoryColors[template.category] || 'bg-charcoal-100 text-charcoal-700'"
              >
                {{ template.category }}
              </span>
              <span
                v-if="!isBasicTier(template)"
                class="text-xs font-medium px-2 py-0.5 rounded-full bg-champagne-100 text-champagne-600"
              >
                Premium
              </span>
            </div>
            <h3 class="font-display font-semibold text-charcoal-900">{{ template.name }}</h3>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-20">
        <div class="w-16 h-16 bg-champagne-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-champagne-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-charcoal-900 mb-2">Templates coming soon!</h2>
        <p class="text-charcoal-500">We're designing beautiful invitations for you. Check back soon.</p>
      </div>
    </div>
  </div>
</template>

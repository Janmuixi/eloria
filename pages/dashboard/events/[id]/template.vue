<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const eventId = route.params.id as string
const previewUrl = useTemplatePreviewUrl()

const { data: evt } = await useFetch(`/api/events/${eventId}`)

const styleDescription = ref('')
const recommendedTemplates = ref<any[]>([])
const allTemplates = ref<any[]>([])
const loadingTemplates = ref(false)
const templatesLoaded = ref(false)
const selectedTemplateId = ref<number | null>(null)
const saving = ref(false)
const error = ref('')

watch(evt, (data) => {
  if (data && selectedTemplateId.value === null) {
    selectedTemplateId.value = data.templateId ?? null
  }
}, { immediate: true })

const initialTemplateId = computed(() => evt.value?.templateId ?? null)
const isCurrentlyUpload = computed(() => evt.value?.invitationType === 'upload')
const hasChanged = computed(() => selectedTemplateId.value !== initialTemplateId.value)

async function loadTemplates() {
  if (!evt.value) return
  loadingTemplates.value = true
  error.value = ''
  try {
    const data = await $fetch<{ recommended: any[]; all: any[] }>('/api/ai/recommend-templates', {
      method: 'POST',
      body: {
        coupleName1: evt.value.coupleName1,
        coupleName2: evt.value.coupleName2,
        venue: evt.value.venue,
        date: evt.value.date,
        description: styleDescription.value || evt.value.description,
      },
    })
    recommendedTemplates.value = data.recommended
    allTemplates.value = data.all
    templatesLoaded.value = true
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToLoadTemplates')
  } finally {
    loadingTemplates.value = false
  }
}

function selectTemplate(id: number) {
  selectedTemplateId.value = id
}

async function saveTemplate() {
  if (!selectedTemplateId.value || !hasChanged.value) return
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/events/${eventId}`, {
      method: 'PUT',
      body: { templateId: selectedTemplateId.value },
    })
    navigateTo(localePath(`/dashboard/events/${eventId}`))
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToSaveTemplate')
    saving.value = false
  }
}

const categoryColors: Record<string, string> = {
  classic: 'bg-amber-100 text-amber-800',
  modern: 'bg-blue-100 text-blue-800',
  rustic: 'bg-champagne-100 text-champagne-800',
  romantic: 'bg-pink-100 text-pink-800',
  minimalist: 'bg-charcoal-100 text-charcoal-800',
  floral: 'bg-rose-100 text-rose-800',
  bohemian: 'bg-orange-100 text-orange-800',
}
function getCategoryClass(category: string) {
  return categoryColors[category?.toLowerCase()] || 'bg-charcoal-100 text-charcoal-800'
}

onMounted(() => {
  if (evt.value) loadTemplates()
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <NuxtLinkLocale :to="`/dashboard/events/${eventId}/settings`" class="text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline mb-4 block">
      {{ t('templateChange.backToSettings') }}
    </NuxtLinkLocale>

    <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">{{ t('templateChange.title') }}</h1>
    <p class="text-charcoal-500 mb-6">{{ t('templateChange.subtitle') }}</p>

    <div v-if="isCurrentlyUpload" class="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      {{ t('templateChange.replacingUploadWarning') }}
    </div>

    <div v-if="error" class="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
      {{ error }}
    </div>

    <!-- Style description + AI button -->
    <div class="flex gap-3 mb-6">
      <input v-model="styleDescription" type="text"
        :placeholder="t('templateSelection.stylePlaceholder')"
        class="flex-1 border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
      <button @click="loadTemplates" :disabled="loadingTemplates"
        class="bg-champagne-500 text-white px-4 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50 whitespace-nowrap">
        {{ loadingTemplates ? t('common.loading') : t('templateSelection.refreshRecommendations') }}
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loadingTemplates" class="text-center py-12">
      <div class="inline-block w-8 h-8 border-4 border-champagne-200 border-t-champagne-500 rounded-full animate-spin" />
      <p class="text-charcoal-500 mt-3">{{ t('templateSelection.loadingTemplates') }}</p>
    </div>

    <template v-else-if="templatesLoaded">
      <!-- Recommended templates -->
      <div v-if="recommendedTemplates.length > 0" class="mb-8">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-3">{{ t('templateSelection.recommendedForYou') }}</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <button v-for="tpl in recommendedTemplates" :key="'rec-' + tpl.id"
            @click="selectTemplate(tpl.id)"
            :class="[
              'relative rounded-2xl overflow-hidden text-left transition-all duration-200',
              selectedTemplateId === tpl.id ? 'border-2 border-champagne-500 ring-2 ring-champagne-500/20' : 'border border-charcoal-200 hover:border-champagne-400'
            ]">
            <span v-if="initialTemplateId === tpl.id"
              class="absolute top-2 right-2 z-10 text-xs px-2 py-0.5 rounded-full bg-charcoal-900 text-white">
              {{ t('templateChange.currentlySelected') }}
            </span>
            <div class="aspect-[3/4] bg-charcoal-100 overflow-hidden">
              <img v-if="tpl.slug" :src="previewUrl(tpl)" :alt="tpl.name" class="w-full h-full object-cover object-top" />
            </div>
            <div class="p-3">
              <p class="font-display font-semibold text-sm text-charcoal-900 truncate">{{ tpl.name }}</p>
              <span :class="['text-xs px-2 py-0.5 rounded-full text-charcoal-500', getCategoryClass(tpl.category)]">
                {{ tpl.category }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <!-- All templates -->
      <div>
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-3">{{ t('templateSelection.allTemplates') }}</h2>
        <div v-if="allTemplates.length === 0" class="text-center py-8 text-charcoal-500">
          {{ t('templateSelection.noTemplates') }}
        </div>
        <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <button v-for="tpl in allTemplates" :key="'all-' + tpl.id"
            @click="selectTemplate(tpl.id)"
            :class="[
              'relative rounded-2xl overflow-hidden text-left transition-all duration-200',
              selectedTemplateId === tpl.id ? 'border-2 border-champagne-500 ring-2 ring-champagne-500/20' : 'border border-charcoal-200 hover:border-champagne-400'
            ]">
            <span v-if="initialTemplateId === tpl.id"
              class="absolute top-2 right-2 z-10 text-xs px-2 py-0.5 rounded-full bg-charcoal-900 text-white">
              {{ t('templateChange.currentlySelected') }}
            </span>
            <div class="aspect-[3/4] bg-charcoal-100 overflow-hidden">
              <img v-if="tpl.slug" :src="previewUrl(tpl)" :alt="tpl.name" class="w-full h-full object-cover object-top" />
            </div>
            <div class="p-3">
              <p class="font-display font-semibold text-sm text-charcoal-900 truncate">{{ tpl.name }}</p>
              <span :class="['text-xs px-2 py-0.5 rounded-full text-charcoal-500', getCategoryClass(tpl.category)]">
                {{ tpl.category }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <!-- Save bar -->
      <div class="flex justify-end mt-8">
        <button @click="saveTemplate" :disabled="!selectedTemplateId || !hasChanged || saving"
          class="bg-champagne-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50">
          {{ saving ? t('templateSelection.saving') : t('templateChange.save') }}
        </button>
      </div>
    </template>
  </div>
</template>

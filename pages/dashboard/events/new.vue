<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const { t, locale } = useI18n()

// ─── Subscription check ────────────────────────────────────────────────────
const { data: subscriptionStatus } = await useFetch('/api/subscriptions/status')
const isSubscriber = computed(() => subscriptionStatus.value?.hasActiveSubscription === true)

// ─── Wizard state ──────────────────────────────────────────────────────────
const currentStep = ref(parseInt(route.query.step as string) || 1)
const eventId = ref<number | null>(parseInt(route.query.eventId as string) || null)

// ─── Step 1: Event Details ─────────────────────────────────────────────────
const form = reactive({
  title: '',
  coupleName1: '',
  coupleName2: '',
  date: '',
  venue: '',
  venueAddress: '',
  venueMapUrl: '',
  description: '',
})

const error = ref('')
const submitting = ref(false)

async function submitDetails() {
  error.value = ''
  submitting.value = true
  try {
    const data = await $fetch<{ id: number }>('/api/events', {
      method: 'POST',
      body: form,
    })
    eventId.value = data.id
    currentStep.value = 2
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToCreateEvent')
  } finally {
    submitting.value = false
  }
}

// ─── Step 2: Template Selection ────────────────────────────────────────────
const styleDescription = ref('')
const selectedTemplateId = ref<number | null>(null)
const recommendedTemplates = ref<any[]>([])
const allTemplates = ref<any[]>([])
const loadingTemplates = ref(false)
const templatesLoaded = ref(false)

async function loadTemplates() {
  loadingTemplates.value = true
  try {
    const data = await $fetch<{ recommended: any[]; all: any[] }>('/api/ai/recommend-templates', {
      method: 'POST',
      body: {
        coupleName1: form.coupleName1,
        coupleName2: form.coupleName2,
        venue: form.venue,
        date: form.date,
        description: styleDescription.value || form.description,
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

const selectedTemplate = computed(() => {
  return allTemplates.value.find(t => t.id === selectedTemplateId.value) || null
})

async function confirmTemplate() {
  if (!eventId.value || !selectedTemplateId.value) return
  submitting.value = true
  try {
    await $fetch(`/api/events/${eventId.value}`, {
      method: 'PUT',
      body: { templateId: selectedTemplateId.value },
    })
    currentStep.value = 3
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToSaveTemplate')
  } finally {
    submitting.value = false
  }
}

// Auto-load templates when entering step 2
watch(currentStep, (step) => {
  if (step === 2 && !templatesLoaded.value) {
    loadTemplates()
  }
})

// ─── Step 3: Customization ─────────────────────────────────────────────────
const wording = ref('')
const wordingTone = ref('formal')
const wordingVariations = ref<string[]>([])
const loadingWording = ref(false)

async function generateWording() {
  loadingWording.value = true
  try {
    const data = await $fetch<{ variations: string[] }>('/api/ai/generate-wording', {
      method: 'POST',
      body: {
        coupleName1: form.coupleName1,
        coupleName2: form.coupleName2,
        date: form.date,
        venue: form.venue,
        tone: wordingTone.value,
        locale: locale.value,
      },
    })
    wordingVariations.value = data.variations
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToGenerateWording')
  } finally {
    loadingWording.value = false
  }
}

function pickWording(text: string) {
  wording.value = text
  wordingVariations.value = []
}

async function saveCustomization() {
  if (!eventId.value) return
  submitting.value = true
  try {
    await $fetch(`/api/events/${eventId.value}`, {
      method: 'PUT',
      body: {
        customization: JSON.stringify({
          wording: wording.value,
          tone: wordingTone.value,
        }),
      },
    })
    currentStep.value = 4
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToSaveCustomization')
  } finally {
    submitting.value = false
  }
}

// ─── Step 4: Preview ───────────────────────────────────────────────────────
function confirmPreview() {
  if (isSubscriber.value && eventId.value) {
    navigateTo(`/dashboard/events/${eventId.value}`)
  } else {
    currentStep.value = 5
  }
}

// ─── Subscription upsell ───────────────────────────────────────────────────
const subscribing = ref(false)
async function startSubscription() {
  subscribing.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/subscriptions/create-checkout', {
      method: 'POST',
      body: eventId.value ? { eventId: eventId.value } : {},
    })
    if (res.url) navigateTo(res.url, { external: true })
  } catch {
    navigateTo('/auth/login')
  } finally {
    subscribing.value = false
  }
}

// ─── Step 5: Tier Selection & Payment ──────────────────────────────────────
const tiersList = ref<any[]>([])
const selectedTierSlug = ref<string | null>(null)
const loadingTiers = ref(false)
const processingPayment = ref(false)

async function loadTiers() {
  loadingTiers.value = true
  try {
    tiersList.value = await $fetch<any[]>('/api/tiers')
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToLoadTiers')
  } finally {
    loadingTiers.value = false
  }
}

watch(currentStep, (step) => {
  if (step === 5 && tiersList.value.length === 0) {
    loadTiers()
  }
})

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

async function payAndPublish() {
  if (!eventId.value || !selectedTierSlug.value) return
  processingPayment.value = true
  error.value = ''
  try {
    const data = await $fetch<{ url: string }>('/api/payments/create-checkout', {
      method: 'POST',
      body: {
        eventId: eventId.value,
        tierSlug: selectedTierSlug.value,
      },
    })
    if (data.url) {
      window.location.href = data.url
    }
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('errors.failedToStartPayment')
    processingPayment.value = false
  }
}

// ─── Template color helpers ────────────────────────────────────────────────
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

const stepLabels = computed(() => {
  const labels = [t('eventForm.stepDetails'), t('eventForm.stepTemplate'), t('eventForm.stepCustomize'), t('eventForm.stepPreview')]
  if (!isSubscriber.value) {
    labels.push(t('eventForm.stepPayment'))
  }
  return labels
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2 mb-8">
      <template v-for="(label, idx) in stepLabels" :key="idx">
        <div class="flex items-center gap-2">
          <div :class="[
            'w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors',
            idx + 1 <= currentStep ? 'bg-champagne-500 text-white font-display font-semibold' : 'bg-charcoal-200 text-charcoal-500 font-display'
          ]">
            {{ idx + 1 }}
          </div>
          <span :class="['text-xs hidden sm:inline', idx + 1 <= currentStep ? 'text-charcoal-900' : 'text-charcoal-500']">{{ label }}</span>
        </div>
        <div v-if="idx < stepLabels.length - 1" :class="['w-8 h-px', idx + 1 < currentStep ? 'bg-champagne-400' : 'bg-charcoal-200']" />
      </template>
    </div>

    <!-- Global error -->
    <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
      {{ error }}
      <button @click="error = ''" class="ml-2 underline text-sm text-red-600">{{ $t('common.dismiss') }}</button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 1: Event Details                                             -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-if="currentStep === 1" class="max-w-2xl mx-auto">
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-6">{{ $t('eventForm.title') }}</h1>
      <form @submit.prevent="submitDetails" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.eventTitle') }}</label>
          <input v-model="form.title" type="text" required :placeholder="$t('eventForm.eventTitlePlaceholder')"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.partner1Name') }}</label>
            <input v-model="form.coupleName1" type="text" required :placeholder="$t('eventForm.partner1Placeholder')"
              class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.partner2Name') }}</label>
            <input v-model="form.coupleName2" type="text" required :placeholder="$t('eventForm.partner2Placeholder')"
              class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.weddingDate') }}</label>
          <input v-model="form.date" type="date" required
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.venueName') }}</label>
          <input v-model="form.venue" type="text" required :placeholder="$t('eventForm.venuePlaceholder')"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.venueAddress') }}</label>
          <input v-model="form.venueAddress" type="text" required :placeholder="$t('eventForm.venueAddressPlaceholder')"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.mapLink') }}</label>
          <input v-model="form.venueMapUrl" type="url" :placeholder="$t('eventForm.mapLinkPlaceholder')"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('eventForm.additionalDetails') }}</label>
          <textarea v-model="form.description" rows="3" :placeholder="$t('eventForm.additionalDetailsPlaceholder')"
            class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        </div>

        <button type="submit" :disabled="submitting"
          class="w-full bg-champagne-500 text-white rounded-full py-2.5 font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50">
          {{ submitting ? $t('eventForm.creating') : $t('eventForm.continueToTemplate') }}
        </button>
      </form>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 2: Template Selection                                        -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 2">
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">{{ $t('templateSelection.title') }}</h1>
      <p class="text-charcoal-500 mb-6">{{ $t('templateSelection.subtitle') }}</p>

      <!-- Style description + AI button -->
      <div class="flex gap-3 mb-6">
        <input v-model="styleDescription" type="text"
          :placeholder="$t('templateSelection.stylePlaceholder')"
          class="flex-1 border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
        <button @click="loadTemplates" :disabled="loadingTemplates"
          class="bg-champagne-500 text-white px-4 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50 whitespace-nowrap">
          {{ loadingTemplates ? $t('common.loading') : $t('templateSelection.refreshRecommendations') }}
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="loadingTemplates" class="text-center py-12">
        <div class="inline-block w-8 h-8 border-4 border-champagne-200 border-t-champagne-500 rounded-full animate-spin" />
        <p class="text-charcoal-500 mt-3">{{ $t('templateSelection.loadingTemplates') }}</p>
      </div>

      <template v-else-if="templatesLoaded">
        <!-- Recommended templates -->
        <div v-if="recommendedTemplates.length > 0" class="mb-8">
          <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-3">{{ $t('templateSelection.recommendedForYou') }}</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button v-for="tpl in recommendedTemplates" :key="'rec-' + tpl.id"
              @click="selectTemplate(tpl.id)"
              :class="[
                'rounded-2xl overflow-hidden text-left transition-all duration-200',
                selectedTemplateId === tpl.id ? 'border-2 border-champagne-500 ring-2 ring-champagne-500/20' : 'border border-charcoal-200 hover:border-champagne-400'
              ]">
              <div class="aspect-[3/4] bg-charcoal-100 overflow-hidden">
                <img
                  v-if="tpl.previewImageUrl"
                  :src="tpl.previewImageUrl"
                  :alt="tpl.name"
                  class="w-full h-full object-cover object-top"
                />
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
          <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-3">{{ $t('templateSelection.allTemplates') }}</h2>
          <div v-if="allTemplates.length === 0" class="text-center py-8 text-charcoal-500">
            {{ $t('templateSelection.noTemplates') }}
          </div>
          <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button v-for="tpl in allTemplates" :key="'all-' + tpl.id"
              @click="selectTemplate(tpl.id)"
              :class="[
                'rounded-2xl overflow-hidden text-left transition-all duration-200',
                selectedTemplateId === tpl.id ? 'border-2 border-champagne-500 ring-2 ring-champagne-500/20' : 'border border-charcoal-200 hover:border-champagne-400'
              ]">
              <div class="aspect-[3/4] bg-charcoal-100 overflow-hidden">
                <img
                  v-if="tpl.previewImageUrl"
                  :src="tpl.previewImageUrl"
                  :alt="tpl.name"
                  class="w-full h-full object-cover object-top"
                />
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
      </template>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 1" class="text-charcoal-700 hover:text-charcoal-900 font-medium">
          &larr; {{ $t('common.back') }}
        </button>
        <button @click="confirmTemplate" :disabled="!selectedTemplateId || submitting"
          class="bg-champagne-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50">
          {{ submitting ? $t('templateSelection.saving') : $t('templateSelection.continueToCustomization') }}
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 3: Customization                                             -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 3">
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">{{ $t('customization.title') }}</h1>
      <p class="text-charcoal-500 mb-6">{{ $t('customization.subtitle') }}</p>

      <div class="grid md:grid-cols-2 gap-8">
        <!-- Left: Form -->
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ $t('customization.invitationWording') }}</label>
            <textarea v-model="wording" rows="5"
              :placeholder="$t('customization.wordingPlaceholder')"
              class="w-full border border-charcoal-200 rounded-lg px-4 py-2.5 text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none" />
          </div>

          <!-- AI Wording Generator -->
          <div class="border border-charcoal-200 rounded-lg p-4 bg-ivory-100">
            <p class="text-sm font-medium text-charcoal-700 mb-2">{{ $t('customization.generateWithAi') }}</p>
            <div class="flex gap-2 mb-3">
              <select v-model="wordingTone"
                class="border border-charcoal-200 rounded-lg px-4 py-2.5 text-sm text-charcoal-900 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 focus:outline-none">
                <option value="formal">{{ $t('customization.tones.formal') }}</option>
                <option value="casual">{{ $t('customization.tones.casual') }}</option>
                <option value="poetic">{{ $t('customization.tones.poetic') }}</option>
                <option value="funny">{{ $t('customization.tones.funny') }}</option>
              </select>
              <button @click="generateWording" :disabled="loadingWording"
                class="bg-champagne-500 text-white px-4 py-2.5 rounded-full text-sm font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50">
                {{ loadingWording ? $t('customization.generatingWording') : $t('customization.generateWording') }}
              </button>
            </div>

            <!-- Variations -->
            <div v-if="wordingVariations.length > 0" class="space-y-2">
              <p class="text-xs text-charcoal-500 mb-1">{{ $t('customization.clickToUse') }}</p>
              <button v-for="(variation, idx) in wordingVariations" :key="idx"
                @click="pickWording(variation)"
                class="block w-full text-left text-sm p-3 bg-white border border-charcoal-200 rounded-lg hover:border-champagne-400 hover:bg-champagne-100 transition-colors">
                {{ variation }}
              </button>
            </div>
          </div>
        </div>

        <!-- Right: Live Preview -->
        <div>
          <p class="text-sm font-medium mb-2 text-charcoal-500">{{ $t('customization.livePreview') }}</p>
          <div v-if="selectedTemplate?.htmlTemplate" class="border border-champagne-400 rounded-lg overflow-hidden shadow-sm">
            <InvitationTemplatePreview
              :html-template="selectedTemplate.htmlTemplate"
              :couple-name1="form.coupleName1"
              :couple-name2="form.coupleName2"
              :date="form.date"
              :venue="form.venue"
              :venue-address="form.venueAddress"
              :wording="wording"
            />
          </div>
          <div v-else class="border border-charcoal-200 rounded-lg p-8 bg-white text-center shadow-sm">
            <p class="text-charcoal-300 italic">{{ $t('customization.selectTemplateForPreview') }}</p>
          </div>
          <p v-if="selectedTemplate" class="text-xs text-charcoal-500 mt-2 text-center">
            {{ $t('customization.templateLabel', { name: selectedTemplate.name }) }}
          </p>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 2" class="text-charcoal-700 hover:text-charcoal-900 font-medium">
          &larr; {{ $t('common.back') }}
        </button>
        <button @click="saveCustomization" :disabled="submitting"
          class="bg-champagne-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50">
          {{ submitting ? $t('customization.saving') : $t('customization.continueToPreview') }}
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 4: Preview                                                   -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 4">
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">{{ $t('preview.title') }}</h1>
      <p class="text-charcoal-500 mb-6">{{ $t('preview.subtitle') }}</p>

      <div class="max-w-2xl mx-auto">
        <div v-if="selectedTemplate?.htmlTemplate" class="border border-champagne-400 rounded-2xl overflow-hidden shadow-lg">
          <InvitationTemplatePreview
            :html-template="selectedTemplate.htmlTemplate"
            :couple-name1="form.coupleName1"
            :couple-name2="form.coupleName2"
            :date="form.date"
            :venue="form.venue"
            :venue-address="form.venueAddress"
            :wording="wording"
          />
        </div>
        <div v-else class="border border-charcoal-200 rounded-2xl p-10 bg-white text-center shadow-lg">
          <p class="text-charcoal-300 italic">{{ $t('preview.noTemplate') }}</p>
        </div>

        <p v-if="selectedTemplate" class="text-sm text-charcoal-500 mt-4 text-center">
          {{ $t('preview.usingTemplate', { name: selectedTemplate.name, category: selectedTemplate.category }) }}
        </p>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 3" class="text-charcoal-700 hover:text-charcoal-900 font-medium">
          &larr; {{ $t('preview.backToCustomize') }}
        </button>
        <button @click="confirmPreview"
          class="bg-champagne-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200">
          {{ $t('preview.looksGood') }}
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 5: Tier Selection & Payment                                  -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 5">
      <h1 class="font-display font-bold text-2xl text-charcoal-900 mb-2">{{ $t('payment.title') }}</h1>
      <p class="text-charcoal-500 mb-6">{{ $t('payment.subtitle') }}</p>

      <!-- Pro subscription upsell banner -->
      <div class="max-w-2xl mb-8 rounded-2xl bg-champagne-50 border border-champagne-300 p-6 flex items-start gap-4">
        <div class="shrink-0 w-10 h-10 bg-champagne-500 rounded-full flex items-center justify-center text-white">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="font-display font-semibold text-charcoal-900 mb-1">{{ $t('payment.proUpsellTitle') }}</h3>
          <p class="text-sm text-charcoal-500 mb-3">{{ $t('payment.proUpsellDescription') }}</p>
          <button
            @click="startSubscription"
            :disabled="subscribing"
            class="bg-champagne-500 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-60"
          >
            {{ subscribing ? $t('common.loading') : $t('payment.proUpsellCta') }}
          </button>
        </div>
      </div>

      <p class="text-sm text-charcoal-500 mb-4 max-w-2xl font-medium">{{ $t('payment.orChooseSingleEvent') }}</p>

      <!-- Loading state -->
      <div v-if="loadingTiers" class="text-center py-12">
        <div class="inline-block w-8 h-8 border-4 border-champagne-200 border-t-champagne-500 rounded-full animate-spin" />
        <p class="text-charcoal-500 mt-3">{{ $t('payment.loadingPlans') }}</p>
      </div>

      <div v-else class="grid md:grid-cols-2 gap-6 max-w-2xl">
        <button v-for="tier in tiersList" :key="tier.id"
          @click="selectedTierSlug = tier.slug"
          :class="[
            'rounded-2xl p-6 text-left transition-all duration-200 hover:shadow-md',
            selectedTierSlug === tier.slug ? 'border-2 border-champagne-500 ring-2 ring-champagne-500/20 bg-champagne-50' : 'border border-charcoal-200 bg-white'
          ]">
          <h3 class="font-display font-semibold text-lg text-charcoal-900 mb-1">{{ tier.name }}</h3>
          <p class="font-display font-bold text-2xl text-charcoal-900 mb-4">{{ formatPrice(tier.price) }}</p>
          <ul class="space-y-2 text-sm text-charcoal-600">
            <li class="flex items-center gap-2">
              <span :class="tier.guestLimit ? 'text-charcoal-400' : 'text-champagne-500'">
                {{ tier.guestLimit ? $t('payment.upToGuests', { count: tier.guestLimit }) : $t('payment.unlimitedGuests') }}
              </span>
            </li>
            <li v-if="tier.hasEmailDelivery" class="flex items-center gap-2">
              <span class="text-champagne-500">&#10003;</span> {{ $t('payment.emailDelivery') }}
            </li>
            <li v-if="tier.hasPdfExport" class="flex items-center gap-2">
              <span class="text-champagne-500">&#10003;</span> {{ $t('payment.pdfExport') }}
            </li>
            <li v-if="tier.hasAiTextGeneration" class="flex items-center gap-2">
              <span class="text-champagne-500">&#10003;</span> {{ $t('payment.aiTextGeneration') }}
            </li>
            <li v-if="tier.removeBranding" class="flex items-center gap-2">
              <span class="text-champagne-500">&#10003;</span> {{ $t('payment.removeBranding') }}
            </li>
            <li v-if="tier.hasMultipleVariants" class="flex items-center gap-2">
              <span class="text-champagne-500">&#10003;</span> {{ $t('payment.multipleVariants') }}
            </li>
          </ul>
        </button>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 4" class="text-charcoal-700 hover:text-charcoal-900 font-medium">
          &larr; {{ $t('common.back') }}
        </button>
        <button @click="payAndPublish" :disabled="!selectedTierSlug || processingPayment"
          class="bg-champagne-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-champagne-600 transition-all duration-200 disabled:opacity-50">
          {{ processingPayment ? $t('payment.redirecting') : $t('payment.payAndPublish') }}
        </button>
      </div>
    </div>
  </div>
</template>

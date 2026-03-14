<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()

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
    error.value = e.data?.statusMessage || 'Failed to create event'
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
    error.value = e.data?.statusMessage || 'Failed to load templates'
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
    error.value = e.data?.statusMessage || 'Failed to save template'
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
      },
    })
    wordingVariations.value = data.variations
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to generate wording'
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
    error.value = e.data?.statusMessage || 'Failed to save customization'
  } finally {
    submitting.value = false
  }
}

// ─── Step 4: Preview ───────────────────────────────────────────────────────
function confirmPreview() {
  currentStep.value = 5
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
    error.value = e.data?.statusMessage || 'Failed to load tiers'
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
    error.value = e.data?.statusMessage || 'Failed to start payment. Stripe may not be configured.'
    processingPayment.value = false
  }
}

// ─── Template color helpers ────────────────────────────────────────────────
const categoryColors: Record<string, string> = {
  classic: 'bg-amber-100 text-amber-800',
  modern: 'bg-blue-100 text-blue-800',
  rustic: 'bg-green-100 text-green-800',
  romantic: 'bg-pink-100 text-pink-800',
  minimalist: 'bg-gray-100 text-gray-800',
  floral: 'bg-rose-100 text-rose-800',
  bohemian: 'bg-orange-100 text-orange-800',
}

function getCategoryClass(category: string) {
  return categoryColors[category?.toLowerCase()] || 'bg-gray-100 text-gray-800'
}

const stepLabels = ['Details', 'Template', 'Customize', 'Preview', 'Payment']
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2 mb-8">
      <template v-for="(label, idx) in stepLabels" :key="idx">
        <div class="flex items-center gap-2">
          <div :class="[
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
            idx + 1 === currentStep ? 'bg-primary-600 text-white' : idx + 1 < currentStep ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
          ]">
            {{ idx + 1 }}
          </div>
          <span class="text-xs text-gray-500 hidden sm:inline">{{ label }}</span>
        </div>
        <div v-if="idx < stepLabels.length - 1" class="w-8 h-px bg-gray-300" />
      </template>
    </div>

    <!-- Global error -->
    <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">
      {{ error }}
      <button @click="error = ''" class="ml-2 underline text-sm">dismiss</button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 1: Event Details                                             -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-if="currentStep === 1" class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">Event Details</h1>
      <form @submit.prevent="submitDetails" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Event Title (for your dashboard)</label>
          <input v-model="form.title" type="text" required placeholder="Our Wedding"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Partner 1 Name</label>
            <input v-model="form.coupleName1" type="text" required placeholder="Maria"
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Partner 2 Name</label>
            <input v-model="form.coupleName2" type="text" required placeholder="James"
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Wedding Date</label>
          <input v-model="form.date" type="date" required
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Venue Name</label>
          <input v-model="form.venue" type="text" required placeholder="The Grand Ballroom"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Venue Address</label>
          <input v-model="form.venueAddress" type="text" required placeholder="123 Wedding Lane, City"
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Map Link (optional)</label>
          <input v-model="form.venueMapUrl" type="url" placeholder="https://maps.google.com/..."
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Additional Details (optional)</label>
          <textarea v-model="form.description" rows="3" placeholder="Any additional information for your guests..."
            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <button type="submit" :disabled="submitting"
          class="w-full bg-primary-600 text-white rounded-lg py-2 font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ submitting ? 'Creating...' : 'Continue to Template Selection' }}
        </button>
      </form>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 2: Template Selection                                        -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 2">
      <h1 class="text-2xl font-bold mb-2">Choose a Template</h1>
      <p class="text-gray-500 mb-6">Select a design for your wedding invitation</p>

      <!-- Style description + AI button -->
      <div class="flex gap-3 mb-6">
        <input v-model="styleDescription" type="text"
          placeholder="Describe your wedding style (e.g., rustic barn wedding, autumn colors)"
          class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        <button @click="loadTemplates" :disabled="loadingTemplates"
          class="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap">
          {{ loadingTemplates ? 'Loading...' : 'Get AI Recommendations' }}
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="loadingTemplates" class="text-center py-12">
        <div class="inline-block w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p class="text-gray-500 mt-3">Finding the perfect templates...</p>
      </div>

      <template v-else-if="templatesLoaded">
        <!-- Recommended templates -->
        <div v-if="recommendedTemplates.length > 0" class="mb-8">
          <h2 class="text-lg font-semibold mb-3">Recommended for You</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button v-for="tpl in recommendedTemplates" :key="'rec-' + tpl.id"
              @click="selectTemplate(tpl.id)"
              :class="[
                'border-2 rounded-lg overflow-hidden text-left transition-all hover:shadow-md',
                selectedTemplateId === tpl.id ? 'border-primary-600 ring-2 ring-primary-200' : 'border-gray-200'
              ]">
              <div class="aspect-[3/4] bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
                <div class="text-center">
                  <p class="text-xs uppercase tracking-wider text-gray-400 mb-1">Preview</p>
                  <p class="text-sm font-serif text-gray-700">{{ tpl.name }}</p>
                </div>
              </div>
              <div class="p-3">
                <p class="font-medium text-sm truncate">{{ tpl.name }}</p>
                <span :class="['text-xs px-2 py-0.5 rounded-full', getCategoryClass(tpl.category)]">
                  {{ tpl.category }}
                </span>
              </div>
            </button>
          </div>
        </div>

        <!-- All templates -->
        <div>
          <h2 class="text-lg font-semibold mb-3">All Templates</h2>
          <div v-if="allTemplates.length === 0" class="text-center py-8 text-gray-500">
            No templates available yet. Seed the database to add templates.
          </div>
          <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button v-for="tpl in allTemplates" :key="'all-' + tpl.id"
              @click="selectTemplate(tpl.id)"
              :class="[
                'border-2 rounded-lg overflow-hidden text-left transition-all hover:shadow-md',
                selectedTemplateId === tpl.id ? 'border-primary-600 ring-2 ring-primary-200' : 'border-gray-200'
              ]">
              <div class="aspect-[3/4] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
                <div class="text-center">
                  <p class="text-xs uppercase tracking-wider text-gray-400 mb-1">Preview</p>
                  <p class="text-sm font-serif text-gray-700">{{ tpl.name }}</p>
                </div>
              </div>
              <div class="p-3">
                <p class="font-medium text-sm truncate">{{ tpl.name }}</p>
                <span :class="['text-xs px-2 py-0.5 rounded-full', getCategoryClass(tpl.category)]">
                  {{ tpl.category }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </template>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 1" class="text-gray-600 hover:text-gray-800 font-medium">
          &larr; Back
        </button>
        <button @click="confirmTemplate" :disabled="!selectedTemplateId || submitting"
          class="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ submitting ? 'Saving...' : 'Continue to Customization' }}
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 3: Customization                                             -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 3">
      <h1 class="text-2xl font-bold mb-2">Customize Your Invitation</h1>
      <p class="text-gray-500 mb-6">Personalize the wording and style</p>

      <div class="grid md:grid-cols-2 gap-8">
        <!-- Left: Form -->
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Invitation Wording</label>
            <textarea v-model="wording" rows="5"
              placeholder="Write your invitation text or use AI to generate it..."
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>

          <!-- AI Wording Generator -->
          <div class="border rounded-lg p-4 bg-gray-50">
            <p class="text-sm font-medium mb-2">Generate with AI</p>
            <div class="flex gap-2 mb-3">
              <select v-model="wordingTone"
                class="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="poetic">Poetic</option>
                <option value="funny">Funny</option>
              </select>
              <button @click="generateWording" :disabled="loadingWording"
                class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                {{ loadingWording ? 'Generating...' : 'Generate Wording' }}
              </button>
            </div>

            <!-- Variations -->
            <div v-if="wordingVariations.length > 0" class="space-y-2">
              <p class="text-xs text-gray-500 mb-1">Click to use:</p>
              <button v-for="(variation, idx) in wordingVariations" :key="idx"
                @click="pickWording(variation)"
                class="block w-full text-left text-sm p-3 bg-white border rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors">
                {{ variation }}
              </button>
            </div>
          </div>
        </div>

        <!-- Right: Live Preview -->
        <div>
          <p class="text-sm font-medium mb-2 text-gray-500">Live Preview</p>
          <div class="border rounded-lg p-8 bg-white text-center shadow-sm">
            <p class="text-sm uppercase tracking-wider text-gray-400 mb-2">Together with their families</p>
            <h2 class="text-3xl font-serif text-gray-800">{{ form.coupleName1 }} &amp; {{ form.coupleName2 }}</h2>
            <div class="w-16 h-px bg-gray-300 mx-auto my-4" />
            <p v-if="wording" class="text-gray-600 leading-relaxed">{{ wording }}</p>
            <p v-else class="text-gray-300 italic">Your invitation wording will appear here</p>
            <div class="mt-6 space-y-1">
              <p class="font-medium text-gray-700">{{ form.date }}</p>
              <p class="text-gray-500">{{ form.venue }}</p>
              <p class="text-sm text-gray-400">{{ form.venueAddress }}</p>
            </div>
          </div>
          <p v-if="selectedTemplate" class="text-xs text-gray-400 mt-2 text-center">
            Template: {{ selectedTemplate.name }}
          </p>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 2" class="text-gray-600 hover:text-gray-800 font-medium">
          &larr; Back
        </button>
        <button @click="saveCustomization" :disabled="submitting"
          class="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ submitting ? 'Saving...' : 'Continue to Preview' }}
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 4: Preview                                                   -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 4">
      <h1 class="text-2xl font-bold mb-2">Preview Your Invitation</h1>
      <p class="text-gray-500 mb-6">Review how your invitation will look to guests</p>

      <div class="max-w-2xl mx-auto">
        <div class="border rounded-xl p-10 bg-white text-center shadow-lg">
          <p class="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">Together with their families</p>
          <h2 class="text-4xl font-serif text-gray-800 mb-2">{{ form.coupleName1 }}</h2>
          <p class="text-xl text-gray-400 font-serif">&amp;</p>
          <h2 class="text-4xl font-serif text-gray-800 mt-2">{{ form.coupleName2 }}</h2>
          <div class="w-24 h-px bg-gray-300 mx-auto my-6" />
          <p v-if="wording" class="text-gray-600 leading-relaxed max-w-md mx-auto mb-6">{{ wording }}</p>
          <div class="space-y-2">
            <p class="text-lg font-medium text-gray-700">{{ form.date }}</p>
            <p class="text-gray-600">{{ form.venue }}</p>
            <p class="text-sm text-gray-400">{{ form.venueAddress }}</p>
            <a v-if="form.venueMapUrl" :href="form.venueMapUrl" target="_blank"
              class="text-sm text-primary-600 hover:underline inline-block mt-1">
              View on Map
            </a>
          </div>
          <p v-if="form.description" class="text-sm text-gray-500 mt-6 border-t pt-4">{{ form.description }}</p>
        </div>

        <p v-if="selectedTemplate" class="text-sm text-gray-400 mt-4 text-center">
          Using template: {{ selectedTemplate.name }} ({{ selectedTemplate.category }})
        </p>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 3" class="text-gray-600 hover:text-gray-800 font-medium">
          &larr; Back to Customize
        </button>
        <button @click="confirmPreview"
          class="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700">
          Looks Good, Continue
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Step 5: Tier Selection & Payment                                  -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div v-else-if="currentStep === 5">
      <h1 class="text-2xl font-bold mb-2">Choose Your Plan</h1>
      <p class="text-gray-500 mb-6">Select a tier and publish your invitation</p>

      <!-- Loading state -->
      <div v-if="loadingTiers" class="text-center py-12">
        <div class="inline-block w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p class="text-gray-500 mt-3">Loading plans...</p>
      </div>

      <div v-else class="grid md:grid-cols-3 gap-6">
        <button v-for="tier in tiersList" :key="tier.id"
          @click="selectedTierSlug = tier.slug"
          :class="[
            'border-2 rounded-xl p-6 text-left transition-all hover:shadow-md',
            selectedTierSlug === tier.slug ? 'border-primary-600 ring-2 ring-primary-200 bg-primary-50' : 'border-gray-200 bg-white'
          ]">
          <h3 class="text-lg font-bold mb-1">{{ tier.name }}</h3>
          <p class="text-2xl font-bold text-primary-600 mb-4">{{ formatPrice(tier.price) }}</p>
          <ul class="space-y-2 text-sm text-gray-600">
            <li class="flex items-center gap-2">
              <span :class="tier.guestLimit ? 'text-gray-400' : 'text-green-500'">
                {{ tier.guestLimit ? `Up to ${tier.guestLimit} guests` : 'Unlimited guests' }}
              </span>
            </li>
            <li v-if="tier.hasEmailDelivery" class="flex items-center gap-2">
              <span class="text-green-500">&#10003;</span> Email delivery
            </li>
            <li v-if="tier.hasPdfExport" class="flex items-center gap-2">
              <span class="text-green-500">&#10003;</span> PDF export
            </li>
            <li v-if="tier.hasAiTextGeneration" class="flex items-center gap-2">
              <span class="text-green-500">&#10003;</span> AI text generation
            </li>
            <li v-if="tier.removeBranding" class="flex items-center gap-2">
              <span class="text-green-500">&#10003;</span> Remove branding
            </li>
            <li v-if="tier.hasMultipleVariants" class="flex items-center gap-2">
              <span class="text-green-500">&#10003;</span> Multiple variants
            </li>
          </ul>
        </button>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8">
        <button @click="currentStep = 4" class="text-gray-600 hover:text-gray-800 font-medium">
          &larr; Back
        </button>
        <button @click="payAndPublish" :disabled="!selectedTierSlug || processingPayment"
          class="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ processingPayment ? 'Redirecting to payment...' : 'Pay &amp; Publish' }}
        </button>
      </div>
    </div>
  </div>
</template>

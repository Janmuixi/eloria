<script setup lang="ts">
import type { Allergies } from '~/shared/menu'

definePageMeta({ layout: 'blank' })

const { t } = useI18n()
const route = useRoute()
const slug = route.params.slug as string
const guestToken = computed(() => route.query.g as string | undefined)
const isPrint = computed(() => route.query.print === 'true')

const renderedUrl = `/api/invitations/${slug}/rendered.html`

useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { data: invitation, error } = await useFetch(`/api/invitations/${slug}`)

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: t('errors.invitationNotFound') })
}

const isUpload = computed(() => invitation.value?.invitationType === 'upload')

if (isPrint.value && !isUpload.value) {
  await navigateTo(renderedUrl, { external: true })
}

const { data: guestData, refresh: refreshGuest } = await useFetch(
  () => guestToken.value ? `/api/rsvp/${guestToken.value}` : '',
  { immediate: !!guestToken.value },
)

type CompanionState = {
  position: number
  attending: boolean
  name: string
  menuChoices: Record<number, number | null>
  allergies: Allergies | null
}

const rsvpForm = reactive({
  rsvpStatus: '' as string,
})

const menuChoices = ref<Record<number, number | null>>({})
const allergies = ref<Allergies | null>(null)
const companionsState = ref<CompanionState[]>([])

const rsvpSubmitting = ref(false)
const rsvpError = ref('')

watch(guestData, (data) => {
  if (!data) return
  rsvpForm.rsvpStatus = data.rsvpStatus !== 'pending' ? data.rsvpStatus : ''
  if (data.menu) {
    for (const c of data.menu.courses) {
      if (!(c.id in menuChoices.value)) menuChoices.value[c.id] = data.choices?.[c.id] ?? null
    }
  }
  if (data.allergiesEnabled) {
    allergies.value = data.allergies ?? null
  }
  // Build companion state — exactly companionsAllowed entries 1..N
  const incoming: CompanionState[] = (data.companions ?? []).map((c: any) => ({
    position: c.position,
    attending: c.attending ?? false,
    name: c.name ?? '',
    menuChoices: { ...(c.menuChoices ?? {}) },
    allergies: data.allergiesEnabled ? (c.allergies ?? null) : null,
  }))
  companionsState.value = incoming
}, { immediate: true })

const canSubmit = computed(() => {
  if (!rsvpForm.rsvpStatus) return false
  if (rsvpForm.rsvpStatus !== 'confirmed') return true
  const m = guestData.value?.menu
  if (m) {
    for (const c of m.courses) {
      if (!menuChoices.value[c.id]) return false
    }
  }
  for (const comp of companionsState.value) {
    if (!comp.attending) continue
    if (!comp.name.trim()) return false
    if (m) {
      for (const c of m.courses) {
        if (!comp.menuChoices[c.id]) return false
      }
    }
  }
  return true
})

async function submitRsvp() {
  if (!guestToken.value || !canSubmit.value) return
  rsvpSubmitting.value = true
  rsvpError.value = ''

  try {
    await $fetch(`/api/rsvp/${guestToken.value}`, {
      method: 'POST',
      body: {
        rsvpStatus: rsvpForm.rsvpStatus,
        menuChoices: menuChoices.value,
        allergies: allergies.value,
        companions: companionsState.value.map(c => ({
          position: c.position,
          attending: c.attending,
          name: c.name.trim() || null,
          menuChoices: c.menuChoices,
          allergies: c.allergies,
        })),
      },
    })
    await refreshGuest()
  } catch (e: any) {
    rsvpError.value = e.data?.statusMessage || t('errors.somethingWentWrong')
  } finally {
    rsvpSubmitting.value = false
  }
}

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeHeight = ref(1200)

function handleMessage(ev: MessageEvent) {
  if (ev.data?.type !== 'invitation-height') return
  // The iframe may post before Vue has bound iframeRef; once it's bound,
  // require source to match so we ignore stray cross-frame messages.
  if (iframeRef.value && ev.source !== iframeRef.value.contentWindow) return
  const h = Number(ev.data.height)
  if (Number.isFinite(h) && h > 0) iframeHeight.value = h
}

if (import.meta.client) {
  window.addEventListener('message', handleMessage)
}

const rsvpSectionRef = ref<HTMLElement | null>(null)
const rsvpInView = ref(false)
let rsvpObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!rsvpSectionRef.value) return
  rsvpObserver = new IntersectionObserver(
    (entries) => {
      rsvpInView.value = entries[0]?.isIntersecting ?? false
    },
    { threshold: 0.1 },
  )
  rsvpObserver.observe(rsvpSectionRef.value)
})

function scrollToRsvp() {
  rsvpSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage)
  rsvpObserver?.disconnect()
})
</script>

<template>
  <div v-if="invitation" class="min-h-screen bg-[#faf8f5]">
    <InvitationCustomImageView v-if="isUpload" :slug="slug" />
    <iframe
      v-else
      ref="iframeRef"
      :src="renderedUrl"
      :style="{ height: iframeHeight + 'px' }"
      class="w-full border-0 block bg-white"
      title="Wedding invitation"
    />

    <div v-if="!isPrint" class="max-w-2xl mx-auto px-6 py-10">
      <section ref="rsvpSectionRef" class="mb-10">
        <div class="bg-white rounded-2xl shadow-sm border border-charcoal-100 p-8 text-center">
          <h2 class="font-serif text-2xl text-charcoal-900 mb-6">{{ $t('rsvp.title') }}</h2>

          <div v-if="!guestToken">
            <p class="text-charcoal-300">{{ $t('rsvp.usePersonalLink') }}</p>
          </div>

          <div v-else-if="guestData?.rsvpStatus && guestData.rsvpStatus !== 'pending'">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-green-600 text-xl">&#10003;</span>
            </div>
            <p class="text-lg font-medium text-charcoal-900 mb-1">{{ $t('rsvp.thankYou', { name: guestData?.name }) }}</p>
            <p class="text-charcoal-300">
              <template v-if="guestData.rsvpStatus === 'confirmed'">{{ $t('rsvp.cantWait') }}</template>
              <template v-else-if="guestData.rsvpStatus === 'declined'">{{ $t('rsvp.sorryMissYou') }}</template>
              <template v-else>{{ $t('rsvp.hopeToSee') }}</template>
            </p>
          </div>

          <div v-else-if="guestData">
            <p class="text-charcoal-500 mb-6">
              {{ $t('rsvp.dearGuest', { name: guestData.name }) }}
            </p>

            <div v-if="rsvpError" class="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{{ rsvpError }}</div>

            <div class="space-y-3 mb-6">
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'confirmed' ? 'border-green-300 bg-green-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="confirmed" class="text-green-600" />
                <span class="text-sm font-medium">{{ $t('rsvp.accept') }}</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'declined' ? 'border-red-300 bg-red-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="declined" class="text-red-600" />
                <span class="text-sm font-medium">{{ $t('rsvp.decline') }}</span>
              </label>
            </div>

            <div v-if="rsvpForm.rsvpStatus === 'confirmed'" class="mb-6 text-left">

              <!-- Self menu -->
              <div v-if="guestData?.menu" class="mt-2 space-y-6">
                <fieldset v-for="course in guestData.menu.courses" :key="course.id" class="text-left">
                  <legend class="block text-sm font-medium text-charcoal-500 mb-2">{{ course.name }}</legend>
                  <label v-for="o in course.options" :key="o.id"
                    class="flex items-center gap-3 p-2 rounded border cursor-pointer mb-1"
                    :class="menuChoices[course.id] === o.id ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                    <input type="radio" :name="`course-${course.id}`" :value="o.id" v-model="menuChoices[course.id]" />
                    <span>{{ o.name }}</span>
                  </label>
                </fieldset>
              </div>

              <!-- Self allergies -->
              <div v-if="guestData?.allergiesEnabled" class="mt-6">
                <label class="block text-sm font-medium text-charcoal-500 mb-2">{{ $t('rsvp.allergies.title') }}</label>
                <MenuAllergyPicker v-model="allergies" />
              </div>

              <!-- Companions -->
              <div v-if="companionsState.length" class="mt-8 space-y-6">
                <section v-for="comp in companionsState" :key="comp.position"
                  class="border border-charcoal-100 rounded-xl p-4 bg-ivory-50/40">
                  <h3 class="font-medium text-charcoal-700 mb-3">{{ $t('rsvp.companion.label', { n: comp.position }) }}</h3>

                  <label class="flex items-center gap-3 mb-3 cursor-pointer">
                    <input type="checkbox" v-model="comp.attending" class="rounded text-champagne-600" />
                    <span class="text-sm font-medium text-charcoal-500">
                      {{ $t('rsvp.companion.attendingQuestion', { label: comp.name.trim() || $t('rsvp.companion.label', { n: comp.position }) }) }}
                    </span>
                  </label>

                  <div v-if="comp.attending" class="space-y-4">
                    <input
                      v-model="comp.name"
                      type="text"
                      :placeholder="$t('rsvp.companion.namePlaceholder')"
                      class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500 focus:border-champagne-500"
                    />

                    <div v-if="guestData?.menu" class="space-y-4">
                      <fieldset v-for="course in guestData.menu.courses" :key="`c${comp.position}-${course.id}`">
                        <legend class="block text-sm font-medium text-charcoal-500 mb-2">
                          {{ $t('rsvp.companion.menuTitle', { n: comp.position }) }} — {{ course.name }}
                        </legend>
                        <label v-for="o in course.options" :key="o.id"
                          class="flex items-center gap-3 p-2 rounded border cursor-pointer mb-1"
                          :class="comp.menuChoices[course.id] === o.id ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                          <input type="radio" :name="`c${comp.position}-course-${course.id}`" :value="o.id" v-model="comp.menuChoices[course.id]" />
                          <span>{{ o.name }}</span>
                        </label>
                      </fieldset>
                    </div>

                    <div v-if="guestData?.allergiesEnabled">
                      <label class="block text-sm font-medium text-charcoal-500 mb-2">
                        {{ $t('rsvp.companion.allergiesTitle', { n: comp.position }) }}
                      </label>
                      <MenuAllergyPicker v-model="comp.allergies" />
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <button
              @click="submitRsvp"
              :disabled="!canSubmit || rsvpSubmitting"
              class="w-full bg-champagne-600 text-white py-3 rounded-lg font-medium hover:bg-champagne-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ rsvpSubmitting ? $t('rsvp.submitting') : $t('rsvp.submit') }}
            </button>
          </div>

          <div v-else>
            <p class="text-charcoal-200">{{ $t('common.loading') }}</p>
          </div>
        </div>
      </section>

      <footer v-if="!invitation.removeBranding" class="text-center pt-8 border-t border-charcoal-100">
        <p class="text-xs text-charcoal-200">{{ $t('rsvp.poweredBy') }}</p>
      </footer>
    </div>

    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <button
        v-if="!isPrint && !rsvpInView"
        @click="scrollToRsvp"
        :aria-label="$t('aria.scrollToRsvp')"
        class="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-champagne-600 text-white shadow-lg flex items-center justify-center hover:bg-champagne-700 hover:shadow-xl transition-colors animate-bounce"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
    </Transition>
  </div>
</template>

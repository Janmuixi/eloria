<script setup lang="ts">
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

const rsvpForm = reactive({
  rsvpStatus: '' as string,
  plusOne: false,
  plusOneName: '',
})

const rsvpSubmitting = ref(false)
const rsvpError = ref('')

watch(guestData, (data) => {
  if (data) {
    rsvpForm.rsvpStatus = data.rsvpStatus !== 'pending' ? data.rsvpStatus : ''
    rsvpForm.plusOne = data.plusOne || false
    rsvpForm.plusOneName = data.plusOneName || ''
  }
}, { immediate: true })

async function submitRsvp() {
  if (!guestToken.value || !rsvpForm.rsvpStatus) return
  rsvpSubmitting.value = true
  rsvpError.value = ''

  try {
    await $fetch(`/api/rsvp/${guestToken.value}`, {
      method: 'POST',
      body: {
        rsvpStatus: rsvpForm.rsvpStatus,
        plusOne: rsvpForm.plusOne,
        plusOneName: rsvpForm.plusOneName,
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
  if (ev.source !== iframeRef.value?.contentWindow) return
  if (ev.data?.type !== 'invitation-height') return
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
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="rsvpForm.rsvpStatus === 'maybe' ? 'border-yellow-300 bg-yellow-50' : 'border-charcoal-100 hover:bg-ivory-50'">
                <input type="radio" v-model="rsvpForm.rsvpStatus" value="maybe" class="text-yellow-600" />
                <span class="text-sm font-medium">{{ $t('rsvp.maybe') }}</span>
              </label>
            </div>

            <div v-if="rsvpForm.rsvpStatus === 'confirmed'" class="mb-6 text-left">
              <label class="flex items-center gap-3 mb-3 cursor-pointer">
                <input type="checkbox" v-model="rsvpForm.plusOne" class="rounded text-champagne-600" />
                <span class="text-sm font-medium text-charcoal-500">{{ $t('rsvp.plusOne') }}</span>
              </label>
              <input
                v-if="rsvpForm.plusOne"
                v-model="rsvpForm.plusOneName"
                type="text"
                :placeholder="$t('rsvp.plusOneName')"
                class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500 focus:border-champagne-500"
              />
            </div>

            <button
              @click="submitRsvp"
              :disabled="!rsvpForm.rsvpStatus || rsvpSubmitting"
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

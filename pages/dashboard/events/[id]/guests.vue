<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const eventId = route.params.id as string

const { data: guests, refresh: refreshGuests, status } = await useFetch(`/api/events/${eventId}/guests`)
const { data: evt } = await useFetch(`/api/events/${eventId}`)
const { data: menu } = await useFetch<{ courses: Array<{ id: number; name: string; options: Array<{ id: number; name: string }> }> }>(
  `/api/events/${eventId}/menu`,
)

const allergiesEnabled = computed(() => evt.value?.allergiesEnabled === true)

const guestLimit = computed(() => evt.value?.tier?.guestLimit ?? null)
const seatCountLabel = computed(() => {
  const guestRows = guests.value ?? []
  const seats = guestRows.reduce((acc: number, g: any) => acc + 1 + (g.companionsAllowed ?? 0), 0)
  if (guestLimit.value != null) {
    return t('guests.seatCount', { current: seats, limit: guestLimit.value })
  }
  return t('guests.seatCountUnlimited', { current: seats })
})

const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('menu.tab.label'), to: `/dashboard/events/${eventId}/menu` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])

// Add guest form
const showAddForm = ref(false)
const addForm = reactive({ name: '', email: '' })
const addLoading = ref(false)
const addError = ref('')

const stepperBusy = ref<Record<number, boolean>>({})
const stepperError = ref('')

async function changeCompanions(g: any, delta: 1 | -1) {
  const newN = (g.companionsAllowed ?? 0) + delta
  if (newN < 0 || newN > 5) return

  // Confirm dialog when decrementing a slot that has data
  if (delta === -1) {
    const droppedPos = g.companionsAllowed
    const dropped = (g.companions ?? []).find((c: any) => c.position === droppedPos)
    const hasData = !!dropped && (
      (dropped.name && dropped.name.trim().length > 0) ||
      dropped.attending ||
      (dropped.allergies && (dropped.allergies.keys?.length || dropped.allergies.other)) ||
      (dropped.menuChoices && Object.keys(dropped.menuChoices).length > 0)
    )
    if (hasData) {
      const msg = dropped?.name
        ? t('guests.confirmRemoveCompanion', { n: droppedPos, name: dropped.name })
        : t('guests.confirmRemoveCompanionUnnamed', { n: droppedPos })
      if (!confirm(msg)) return
    }
  }

  stepperBusy.value[g.id] = true
  stepperError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/guests/${g.id}`, {
      method: 'PATCH',
      body: { companionsAllowed: newN },
    })
    await refreshGuests()
  } catch (e: any) {
    if (e?.response?.status === 403) {
      stepperError.value = t('guests.seatLimitReached', { limit: guestLimit.value })
    } else {
      stepperError.value = t('errors.somethingWentWrong')
    }
  } finally {
    stepperBusy.value[g.id] = false
  }
}

async function addGuest() {
  if (!addForm.name.trim()) return
  addLoading.value = true
  addError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/guests`, {
      method: 'POST',
      body: { name: addForm.name, email: addForm.email || undefined },
    })
    addForm.name = ''
    addForm.email = ''
    showAddForm.value = false
    await refreshGuests()
  } catch (e: any) {
    if (e?.response?.status === 403) {
      addError.value = t('guests.seatLimitReached', { limit: guestLimit.value })
    } else {
      addError.value = t('errors.somethingWentWrong')
    }
  } finally {
    addLoading.value = false
  }
}

// Delete guest
async function deleteGuest(guestId: number) {
  if (!confirm(t('guests.confirmRemove'))) return
  try {
    await $fetch(`/api/events/${eventId}/guests/${guestId}`, { method: 'DELETE' })
    await refreshGuests()
  } catch (e) {
    console.error('Failed to delete guest:', e)
  }
}

// CSV import
const showImport = ref(false)
const csvText = ref('')
const importLoading = ref(false)
const importResult = ref<{ imported: number } | null>(null)

const importError = ref('')

async function importCsv() {
  if (!csvText.value.trim()) return
  importLoading.value = true
  importResult.value = null
  importError.value = ''
  try {
    const result = await $fetch(`/api/events/${eventId}/guests/import`, {
      method: 'POST',
      body: { csv: csvText.value },
    })
    importResult.value = result
    csvText.value = ''
    await refreshGuests()
  } catch (e: any) {
    if (e?.response?.status === 403) {
      const seatsUsed = (guests.value ?? []).reduce((acc: number, g: any) => acc + 1 + (g.companionsAllowed ?? 0), 0)
      const remaining = guestLimit.value != null ? guestLimit.value - seatsUsed : 0
      importError.value = t('guests.importSeatLimitExceeded', { limit: guestLimit.value, remaining: Math.max(0, remaining) })
    } else {
      importError.value = t('errors.somethingWentWrong')
    }
  } finally {
    importLoading.value = false
  }
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-green-100 text-green-700'
    case 'declined': return 'bg-red-100 text-red-700'
    default: return 'bg-charcoal-100 text-charcoal-500'
  }
}

const copiedGuestId = ref<number | null>(null)

function personalLink(token: string): string {
  if (!evt.value?.slug) return ''
  const origin = import.meta.client ? window.location.origin : ''
  return `${origin}/i/${evt.value.slug}?g=${token}`
}

async function copyPersonalLink(guest: { id: number; token: string }) {
  const url = personalLink(guest.token)
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    copiedGuestId.value = guest.id
    setTimeout(() => {
      if (copiedGuestId.value === guest.id) copiedGuestId.value = null
    }, 2000)
  } catch {
    /* clipboard rejected; ignore */
  }
}

// Expandable per-guest detail
const expandedId = ref<number | null>(null)

function optionName(courseId: number, optionId: number | undefined) {
  if (!optionId) return null
  const course = (menu.value?.courses ?? []).find((c: any) => c.id === courseId)
  const opt = course?.options.find((o: any) => o.id === optionId)
  return opt?.name ?? null
}

function formatAllergies(a: { keys: string[]; other: string }) {
  const labels = a.keys.map(k => t(`allergies.${k}`))
  if (a.other) labels.push(`"${a.other}"`)
  return labels.join(', ')
}

// Filter via query params
const filteredGuests = computed(() => {
  const list = (guests.value ?? []) as any[]
  const opt = route.query.menuOption ? Number(route.query.menuOption) : null
  const allergy = (route.query.allergy as string) || null
  return list.filter((g: any) => {
    if (opt) {
      const selfPick = Object.values(g.menuChoices ?? {}).includes(opt)
      const compPick = (g.companions ?? []).some((c: any) =>
        Object.values(c.menuChoices ?? {}).includes(opt),
      )
      if (!selfPick && !compPick) return false
    }
    if (allergy) {
      const selfHas = (g.allergies?.keys ?? []).includes(allergy)
      const compHas = (g.companions ?? []).some((c: any) =>
        (c.allergies?.keys ?? []).includes(allergy),
      )
      if (!selfHas && !compHas) return false
    }
    return true
  })
})

const isFiltered = computed(() => !!(route.query.menuOption || route.query.allergy))

// Send invitations
type PendingSend =
  | { kind: 'bulk' }
  | { kind: 'resend'; guestId: number; name: string; email: string; sentAt: string | null }

const pendingSend = ref<PendingSend | null>(null)
const sendLoading = ref(false)

type SendResult =
  | { type: 'success'; sent: number; failed: number }
  | { type: 'error'; message: string }
const lastSendResult = ref<SendResult | null>(null)

const hasEmailDelivery = computed(() => evt.value?.tier?.hasEmailDelivery === true)

const unsentCount = computed(() => {
  return (guests.value ?? []).filter((g: any) => g.email && !g.emailSentAt).length
})

const confirmBodyText = computed(() => {
  const p = pendingSend.value
  if (!p) return ''
  if (p.kind === 'bulk') {
    return t('guests.invitations.confirmBody', { count: unsentCount.value })
  }
  return t('guests.invitations.resendBody', {
    name: p.name,
    email: p.email,
    date: formatSentDate(p.sentAt),
  })
})

const confirmTitleText = computed(() => {
  const p = pendingSend.value
  if (!p) return ''
  return p.kind === 'bulk'
    ? t('guests.invitations.confirmTitle')
    : t('guests.invitations.resendTitle')
})

const confirmCtaText = computed(() => {
  const p = pendingSend.value
  if (!p) return ''
  return p.kind === 'bulk'
    ? t('guests.invitations.confirmCta')
    : t('guests.invitations.resendCta')
})

function openBulkConfirm() {
  if (unsentCount.value === 0) return
  pendingSend.value = { kind: 'bulk' }
}

function cancelSend() {
  if (sendLoading.value) return
  pendingSend.value = null
}

function openResendConfirm(g: { id: number; name: string; email: string | null; emailSentAt: string | null }) {
  if (!g.email) return
  pendingSend.value = {
    kind: 'resend',
    guestId: g.id,
    name: g.name,
    email: g.email,
    sentAt: g.emailSentAt,
  }
}

async function confirmSend() {
  const p = pendingSend.value
  if (!p) return
  sendLoading.value = true
  try {
    const body = p.kind === 'resend' ? { guestIds: [p.guestId] } : {}
    const result = await $fetch<{ sent: number; failed: number }>(
      `/api/events/${eventId}/send-invitations`,
      { method: 'POST', body },
    )
    lastSendResult.value = { type: 'success', sent: result.sent, failed: result.failed }
    pendingSend.value = null
    await refreshGuests()
  } catch (e: any) {
    const status = e?.response?.status
    let message: string
    if (status === 403) {
      message = t('guests.invitations.tierBanner')
    } else if (status === 400) {
      message = t('guests.invitations.noTemplateBanner')
    } else {
      message = t('guests.invitations.errorBanner')
    }
    lastSendResult.value = { type: 'error', message }
    pendingSend.value = null
  } finally {
    sendLoading.value = false
  }
}

function dismissResult() {
  lastSendResult.value = null
}

function formatSentDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}
</script>

<template>
  <div>
    <NuxtLinkLocale to="/dashboard" class="text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline mb-4 block">
      &larr; {{ t('eventDetail.backToEvents') }}
    </NuxtLinkLocale>

    <!-- Tabs -->
    <div class="border-b border-charcoal-200 mb-6">
      <nav class="flex gap-6">
        <NuxtLinkLocale
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="pb-3 text-sm border-b-2 transition-colors"
          :class="$route.path === tab.to
            ? 'border-champagne-500 text-charcoal-900 font-medium'
            : 'border-transparent text-charcoal-500 hover:text-charcoal-700'"
        >
          {{ tab.label }}
        </NuxtLinkLocale>
      </nav>
    </div>

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="font-display font-semibold text-2xl text-charcoal-900">
          {{ t('guests.guestList') }}
          <span v-if="guests" class="text-base font-normal text-charcoal-500">({{ seatCountLabel }})</span>
        </h1>
      </div>
      <div class="flex gap-2">
        <button v-if="hasEmailDelivery"
          type="button"
          @click="openBulkConfirm"
          :disabled="unsentCount === 0"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
          {{ unsentCount > 0
            ? t('guests.invitations.sendButton', { count: unsentCount })
            : t('guests.invitations.sendButtonAllInvited') }}
        </button>
        <button @click="showImport = !showImport"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm font-medium text-charcoal-700 hover:border-champagne-400 hover:shadow-sm transition-all duration-200">
          {{ t('guests.importCsv') }}
        </button>
        <button @click="showAddForm = !showAddForm"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 transition-colors">
          {{ t('guests.addGuest') }}
        </button>
      </div>
    </div>

    <!-- Add Guest Form -->
    <div v-if="showAddForm" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-4 mb-4">
      <h3 class="font-display font-semibold text-charcoal-900 mb-3">{{ t('guests.addGuestTitle') }}</h3>
      <form @submit.prevent="addGuest" class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('guests.nameRequired') }}</label>
          <input v-model="addForm.name" type="text" required :placeholder="t('guests.guestNamePlaceholder')"
            class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
        </div>
        <div class="flex-1">
          <label class="block text-sm font-medium text-charcoal-700 mb-1">{{ t('common.email') }}</label>
          <input v-model="addForm.email" type="email" :placeholder="t('guests.emailPlaceholder')"
            class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20" />
        </div>
        <button type="submit" :disabled="addLoading"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
          {{ addLoading ? t('guests.adding') : t('guests.add') }}
        </button>
        <button type="button" @click="showAddForm = false"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 transition-colors">
          {{ t('common.cancel') }}
        </button>
      </form>
      <div v-if="addError" class="mt-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <p class="text-sm text-red-700">{{ addError }}</p>
        <NuxtLinkLocale v-if="addError.includes(String(guestLimit))" to="/pricing"
          class="ml-4 px-3 py-1 bg-champagne-500 text-white rounded-full text-xs font-medium hover:bg-champagne-600 transition-colors whitespace-nowrap">
          {{ t('guests.upgradePlan') }}
        </NuxtLinkLocale>
      </div>
    </div>

    <!-- CSV Import -->
    <div v-if="showImport" class="bg-white rounded-2xl shadow-sm border border-charcoal-200 p-4 mb-4">
      <h3 class="font-display font-semibold text-charcoal-900 mb-3">{{ t('guests.importFromCsv') }}</h3>
      <p class="text-sm text-charcoal-500 mb-2">{{ t('guests.csvHelp', { format1: 'name,email', format2: 'name' }) }}</p>
      <textarea v-model="csvText" rows="5" :placeholder="t('guests.csvPlaceholder')"
        class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm font-mono focus:border-champagne-500 focus:ring-2 focus:ring-champagne-500/20 mb-3" />
      <div class="flex items-center gap-3">
        <button @click="importCsv" :disabled="importLoading"
          class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
          {{ importLoading ? t('guests.importing') : t('guests.import') }}
        </button>
        <button @click="showImport = false"
          class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 transition-colors">
          {{ t('common.cancel') }}
        </button>
        <span v-if="importResult" class="text-sm text-green-600">
          {{ t('guests.importSuccess', { count: importResult.imported }) }}
        </span>
      </div>
      <div v-if="importError" class="mt-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <p class="text-sm text-red-700">{{ importError }}</p>
        <NuxtLinkLocale v-if="importError.includes(String(guestLimit))" to="/pricing"
          class="ml-4 px-3 py-1 bg-champagne-500 text-white rounded-full text-xs font-medium hover:bg-champagne-600 transition-colors whitespace-nowrap">
          {{ t('guests.upgradePlan') }}
        </NuxtLinkLocale>
      </div>
    </div>

    <!-- Send invitations result banner -->
    <div v-if="lastSendResult" class="mb-3">
      <div v-if="lastSendResult.type === 'success' && lastSendResult.failed === 0"
        class="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <p class="text-sm text-green-700">
          {{ t('guests.invitations.successBanner', { sent: lastSendResult.sent }) }}
        </p>
        <button type="button" @click="dismissResult"
          class="text-sm text-green-700 hover:text-green-900 ml-4">
          {{ t('guests.invitations.dismiss') }}
        </button>
      </div>
      <div v-else-if="lastSendResult.type === 'success'"
        class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <p class="text-sm text-amber-800">
          {{ t('guests.invitations.partialBanner', { sent: lastSendResult.sent, failed: lastSendResult.failed }) }}
        </p>
        <button type="button" @click="dismissResult"
          class="text-sm text-amber-800 hover:text-amber-900 ml-4">
          {{ t('guests.invitations.dismiss') }}
        </button>
      </div>
      <div v-else
        class="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <p class="text-sm text-red-700">{{ lastSendResult.message }}</p>
        <button type="button" @click="dismissResult"
          class="text-sm text-red-700 hover:text-red-900 ml-4">
          {{ t('guests.invitations.dismiss') }}
        </button>
      </div>
    </div>

    <!-- Stepper error -->
    <div v-if="stepperError" class="mb-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <p class="text-sm text-red-700">{{ stepperError }}</p>
      <NuxtLinkLocale v-if="stepperError.includes(String(guestLimit))" to="/pricing"
        class="ml-4 px-3 py-1 bg-champagne-500 text-white rounded-full text-xs font-medium hover:bg-champagne-600 transition-colors whitespace-nowrap">
        {{ t('guests.upgradePlan') }}
      </NuxtLinkLocale>
    </div>

    <!-- Loading -->
    <UiLoadingSpinner v-if="status === 'pending'" />

    <!-- Empty state -->
    <div v-else-if="!guests?.length" class="text-center py-12 bg-white rounded-2xl shadow-sm border border-charcoal-200">
      <p class="text-charcoal-500 mb-2">{{ t('guests.noGuests') }}</p>
      <p class="text-sm text-charcoal-400">{{ t('guests.noGuestsHelp') }}</p>
    </div>

    <template v-else>
      <!-- Filter active pill -->
      <div v-if="isFiltered" class="flex items-center gap-2 mb-4">
        <span class="px-3 py-1 bg-champagne-100 text-champagne-700 rounded-full text-xs font-medium">
          {{ t('guests.filterActive') }}
        </span>
        <NuxtLinkLocale :to="`/dashboard/events/${eventId}/guests`"
          class="text-xs text-charcoal-500 hover:text-charcoal-800 underline">
          {{ t('guests.clearFilter') }}
        </NuxtLinkLocale>
      </div>

      <!-- Guest table -->
      <div class="bg-white rounded-2xl shadow-sm border border-charcoal-200 overflow-hidden">
        <table class="w-full">
          <thead class="bg-ivory-100 border-b border-charcoal-200">
            <tr>
              <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderName') }}</th>
              <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderEmail') }}</th>
              <th class="text-center px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.companions') }}</th>
              <th class="text-left px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderRsvp') }}</th>
              <th class="text-right px-6 py-3 text-sm font-medium text-charcoal-700 uppercase tracking-wider">{{ t('guests.tableHeaderActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in filteredGuests" :key="g.id">
              <tr class="border-b border-charcoal-200 hover:bg-ivory-100/50 transition-colors">
                <td class="px-6 py-4 text-sm font-medium text-charcoal-900">
                  <div>{{ g.name }}</div>
                  <template v-if="(g.companionsAllowed ?? 0) > 0">
                    <div class="text-xs text-charcoal-500 font-normal mt-0.5">
                      {{ t('guests.companions') }}: {{ (g.companions ?? []).filter((c: any) => c.attending).length }}/{{ g.companionsAllowed }}
                    </div>
                  </template>
                  <button type="button" @click="expandedId = expandedId === g.id ? null : g.id"
                    class="text-sm text-charcoal-300 hover:text-charcoal-700 mt-1">
                    {{ expandedId === g.id ? '▴' : '▾' }} {{ t('guests.details') }}
                  </button>
                  <div v-if="expandedId === g.id" class="mt-3 pl-4 border-l-2 border-charcoal-100 space-y-3 text-sm">
                    <div>
                      <div class="font-medium text-charcoal-700 mb-1">{{ g.name }}</div>
                      <div v-for="course in menu?.courses ?? []" :key="course.id">
                        <span class="text-charcoal-300">{{ course.name }}:</span>
                        <span class="ml-1">{{ optionName(course.id, g.menuChoices?.[course.id]) ?? '—' }}</span>
                      </div>
                      <div v-if="allergiesEnabled && g.allergies">
                        <span class="text-charcoal-300">{{ t('rsvp.allergies.title') }}:</span>
                        <span class="ml-1">{{ formatAllergies(g.allergies) }}</span>
                      </div>
                    </div>

                    <div v-for="pos in g.companionsAllowed ?? 0" :key="`comp-${pos}`">
                      <template v-if="(g.companions ?? []).find((c: any) => c.position === pos) as any">
                        <div class="font-medium text-charcoal-700 mb-1">
                          <template v-if="((g.companions ?? []).find((c: any) => c.position === pos))?.name">
                            {{ t('guests.companionWithName', { n: pos, name: (g.companions ?? []).find((c: any) => c.position === pos).name }) }}
                          </template>
                          <template v-else>
                            {{ t('guests.companionPending', { n: pos }) }}
                          </template>
                        </div>
                        <template v-if="((g.companions ?? []).find((c: any) => c.position === pos))?.attending">
                          <div v-for="course in menu?.courses ?? []" :key="`c${pos}-${course.id}`">
                            <span class="text-charcoal-300">{{ course.name }}:</span>
                            <span class="ml-1">{{ optionName(course.id, ((g.companions ?? []).find((c: any) => c.position === pos)).menuChoices?.[course.id]) ?? '—' }}</span>
                          </div>
                          <div v-if="allergiesEnabled && ((g.companions ?? []).find((c: any) => c.position === pos))?.allergies">
                            <span class="text-charcoal-300">{{ t('rsvp.allergies.title') }}:</span>
                            <span class="ml-1">{{ formatAllergies(((g.companions ?? []).find((c: any) => c.position === pos)).allergies) }}</span>
                          </div>
                        </template>
                      </template>
                      <template v-else>
                        <div class="font-medium text-charcoal-300">{{ t('guests.companionPending', { n: pos }) }}</div>
                      </template>
                    </div>
                    <div v-if="hasEmailDelivery && (!g.email || g.emailSentAt)" class="pt-2 border-t border-charcoal-100">
                      <template v-if="g.email && g.emailSentAt">
                        <div class="flex items-center justify-between">
                          <span class="text-xs text-charcoal-500">
                            {{ t('guests.invitations.resendRowLabel', { date: formatSentDate(g.emailSentAt) }) }}
                          </span>
                          <button type="button" @click="openResendConfirm(g)"
                            class="text-sm text-charcoal-700 hover:text-charcoal-900 font-medium">
                            {{ t('guests.invitations.resendRowAction') }}
                          </button>
                        </div>
                      </template>
                      <template v-else-if="!g.email">
                        <span class="text-xs text-charcoal-400">
                          {{ t('guests.invitations.noEmailRowLabel') }}
                        </span>
                      </template>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-sm text-charcoal-500">{{ g.email || t('guests.noEmail') }}</td>
                <td class="px-6 py-4 text-center whitespace-nowrap">
                  <div class="inline-flex items-center gap-2">
                    <button type="button" @click="changeCompanions(g, -1)"
                      :disabled="(g.companionsAllowed ?? 0) === 0 || stepperBusy[g.id]"
                      class="w-7 h-7 rounded-full border border-charcoal-200 text-charcoal-700 hover:border-champagne-400 hover:bg-ivory-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none">
                      −
                    </button>
                    <span class="w-6 text-center text-sm font-medium text-charcoal-900 tabular-nums">
                      {{ g.companionsAllowed ?? 0 }}
                    </span>
                    <button type="button" @click="changeCompanions(g, 1)"
                      :disabled="(g.companionsAllowed ?? 0) >= 5 || stepperBusy[g.id]"
                      class="w-7 h-7 rounded-full border border-charcoal-200 text-charcoal-700 hover:border-champagne-400 hover:bg-ivory-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none">
                      +
                    </button>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span :class="['px-2 py-1 rounded-full text-xs font-medium', statusBadgeClass(g.rsvpStatus)]">
                    {{ g.rsvpStatus }}
                  </span>
                </td>
                <td class="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                  <button @click="copyPersonalLink(g)"
                    class="text-sm text-charcoal-700 hover:text-charcoal-900 font-medium">
                    {{ copiedGuestId === g.id ? t('common.copied') : t('guests.copyLink') }}
                  </button>
                  <button @click="deleteGuest(g.id)"
                    class="text-sm text-red-600 hover:text-red-800 font-medium">
                    {{ t('common.remove') }}
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Send invitations confirmation modal -->
    <div v-if="pendingSend"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="cancelSend">
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 class="font-display font-semibold text-lg text-charcoal-900 mb-2">
          {{ confirmTitleText }}
        </h3>
        <p class="text-sm text-charcoal-700 mb-6">{{ confirmBodyText }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" @click="cancelSend" :disabled="sendLoading"
            class="px-4 py-2 border border-charcoal-200 rounded-full text-sm text-charcoal-600 hover:border-champagne-400 disabled:opacity-50 transition-colors">
            {{ t('guests.invitations.cancelCta') }}
          </button>
          <button type="button" @click="confirmSend" :disabled="sendLoading"
            class="px-4 py-2 bg-champagne-500 text-white rounded-full text-sm font-medium hover:bg-champagne-600 disabled:opacity-50 transition-colors">
            {{ sendLoading ? t('guests.invitations.sending') : confirmCtaText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MenuTreeInput } from '~/shared/menu'
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const eventId = route.params.id as string

const tabs = computed(() => [
  { label: t('eventDetail.tabOverview'), to: `/dashboard/events/${eventId}` },
  { label: t('eventDetail.tabGuests'), to: `/dashboard/events/${eventId}/guests` },
  { label: t('menu.tab.label'), to: `/dashboard/events/${eventId}/menu` },
  { label: t('eventDetail.tabSettings'), to: `/dashboard/events/${eventId}/settings` },
])

const { data: menu, refresh: refreshMenu } = await useFetch<{ courses: any[] }>(`/api/events/${eventId}/menu`)
const { data: summary, refresh: refreshSummary } = await useFetch<any>(`/api/events/${eventId}/menu/summary`)
const { data: evt, refresh: refreshEvent } = await useFetch<any>(`/api/events/${eventId}`)
const allergiesEnabled = ref<boolean>(evt.value?.allergiesEnabled === true)
watch(evt, (v) => { if (v) allergiesEnabled.value = v.allergiesEnabled === true })

const allergiesSaving = ref(false)
const allergiesError = ref('')
async function toggleAllergies(next: boolean) {
  allergiesSaving.value = true
  allergiesError.value = ''
  const previous = allergiesEnabled.value
  allergiesEnabled.value = next
  try {
    await $fetch(`/api/events/${eventId}`, { method: 'PUT', body: { allergiesEnabled: next } })
    await refreshEvent()
  } catch (e: any) {
    allergiesEnabled.value = previous
    allergiesError.value = e.data?.statusMessage || t('menu.allergies.saveError')
  } finally {
    allergiesSaving.value = false
  }
}

const draft = ref<MenuTreeInput>({ courses: [] })
function syncDraftFromMenu() {
  draft.value = { courses: (menu.value?.courses ?? []).map(c => ({
    id: c.id, name: c.name, sortOrder: c.sortOrder,
    options: c.options.map((o: any) => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
  })) }
}
syncDraftFromMenu()
watch(menu, syncDraftFromMenu)

const dirty = ref(false)
watch(draft, () => { dirty.value = true }, { deep: true })

const saving = ref(false)
const saveError = ref('')

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/menu`, { method: 'PUT', body: draft.value })
    await Promise.all([refreshMenu(), refreshSummary()])
    dirty.value = false
  } catch (e: any) {
    saveError.value = e.data?.statusMessage || t('errors.somethingWentWrong')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <NuxtLinkLocale to="/dashboard" class="text-sm text-charcoal-500 hover:text-charcoal-900 hover:underline mb-4 block">
      &larr; {{ $t('eventDetail.backToEvents') }}
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

    <div class="max-w-4xl space-y-8">
      <section class="border border-charcoal-100 rounded-lg p-4">
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="mt-1 rounded text-champagne-600"
            :checked="allergiesEnabled"
            :disabled="allergiesSaving"
            @change="toggleAllergies(($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="font-medium text-charcoal-900">{{ $t('menu.allergies.toggleLabel') }}</span>
            <span class="block text-sm text-charcoal-300">{{ $t('menu.allergies.toggleHint') }}</span>
          </span>
        </label>
        <p v-if="allergiesSaving" class="text-xs text-charcoal-300 mt-2">{{ $t('menu.allergies.saving') }}</p>
        <p v-if="allergiesError" class="text-xs text-red-600 mt-2">{{ allergiesError }}</p>
      </section>

      <section>
        <h2 class="text-xl font-serif text-charcoal-900 mb-4">{{ $t('menu.builder.title') }}</h2>
        <MenuBuilder v-model="draft" />
        <div class="flex items-center gap-3 mt-4">
          <button type="button" :disabled="!dirty || saving" @click="save"
            class="px-5 py-2 bg-champagne-600 text-white rounded-lg disabled:opacity-50">
            {{ saving ? $t('common.saving') : $t('common.save') }}
          </button>
          <span v-if="dirty" class="text-sm text-charcoal-300">{{ $t('common.unsavedChanges') }}</span>
          <span v-if="saveError" class="text-sm text-red-600">{{ saveError }}</span>
        </div>
      </section>

      <section v-if="summary && summary.courses.length > 0">
        <h2 class="text-xl font-serif text-charcoal-900 mb-4">{{ $t('menu.summary.title') }}</h2>
        <MenuSummary :summary="summary" :event-id="eventId" />
      </section>
    </div>
  </div>
</template>

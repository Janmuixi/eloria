<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ eventId: number; existingPath: string | null }>()
const emit = defineEmits<{
  (e: 'uploaded', path: string): void
  (e: 'cancel'): void
}>()

const dragActive = ref(false)
const uploading = ref(false)
const error = ref('')
const previewUrl = ref<string | null>(props.existingPath ? `/api/events/${props.eventId}/custom-image?cb=${Date.now()}` : null)
const fileInput = ref<HTMLInputElement | null>(null)

async function handleFile(file: File) {
  error.value = ''
  if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
    error.value = t('eventWizard.customImage.errorHeic'); return
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = t('eventWizard.customImage.errorWrongType'); return
  }
  if (file.size > 10 * 1024 * 1024) {
    error.value = t('eventWizard.customImage.errorTooLarge'); return
  }
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await $fetch<{ customImagePath: string }>(`/api/events/${props.eventId}/custom-image`, {
      method: 'PUT', body: form,
    })
    previewUrl.value = URL.createObjectURL(file)
    emit('uploaded', res.customImagePath)
  } catch (e: any) {
    error.value = e.data?.statusMessage || t('eventWizard.customImage.errorGeneric')
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault(); dragActive.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) handleFile(f)
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) handleFile(f)
}

function clearAndReupload() {
  previewUrl.value = null
  fileInput.value?.click()
}
</script>

<template>
  <div>
    <!-- Hidden file input lives outside both v-if branches so the ref remains
         mounted even when the preview is visible, making clearAndReupload()
         always able to trigger a new file-picker dialog. -->
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onPick" />

    <button class="text-sm text-charcoal-700 hover:underline mb-4" @click="emit('cancel')">
      {{ t('eventWizard.customImage.backToTemplates') }}
    </button>

    <h2 class="font-display font-semibold text-xl text-charcoal-900 mb-1">
      {{ t('eventWizard.customImage.uploadHeading') }}
    </h2>
    <p class="text-sm text-charcoal-500 mb-6">{{ t('eventWizard.customImage.uploadHint') }}</p>

    <div v-if="!previewUrl">
      <div
        class="block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors"
        :class="dragActive ? 'border-champagne-500 bg-champagne-50' : 'border-charcoal-300 bg-white'"
        @click="fileInput?.click()"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop="onDrop"
      >
        <p class="text-charcoal-500">{{ t('eventWizard.customImage.dropzoneLabel') }}</p>
        <p v-if="uploading" class="text-charcoal-400 mt-2 text-sm">{{ t('eventWizard.customImage.uploading') }}</p>
      </div>
    </div>

    <div v-else class="space-y-4">
      <img :src="previewUrl" class="max-w-md mx-auto rounded-md shadow-sm" alt="" />
      <div class="flex gap-3 justify-center">
        <button class="px-4 py-2 rounded-full border border-charcoal-300 hover:bg-charcoal-50" @click="clearAndReupload">
          {{ t('eventWizard.customImage.replace') }}
        </button>
        <button class="px-5 py-2 rounded-full bg-champagne-500 text-white hover:bg-champagne-600" @click="emit('uploaded', '')">
          {{ t('eventWizard.customImage.continue') }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-red-600 text-sm mt-3">{{ error }}</p>
  </div>
</template>

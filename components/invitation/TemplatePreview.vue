<script setup lang="ts">
import { substituteTemplate } from '~/server/utils/template-substitute'

const { t } = useI18n()
const props = defineProps<{
  htmlTemplate: string
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  wording?: string
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)

const renderedHtml = computed(() => substituteTemplate(props.htmlTemplate, {
  coupleName1: props.coupleName1 || t('templatePreview.partner1'),
  coupleName2: props.coupleName2 || t('templatePreview.partner2'),
  date: props.date || t('templatePreview.weddingDate'),
  venue: props.venue || t('templatePreview.venue'),
  venueAddress: props.venueAddress || t('templatePreview.address'),
  wording: props.wording || t('templatePreview.wordingPlaceholder'),
}))

function resizeIframe() {
  if (!iframeRef.value) return
  const doc = iframeRef.value.contentDocument
  if (!doc?.body) return
  const height = doc.documentElement.scrollHeight || doc.body.scrollHeight
  if (height > 0) {
    iframeRef.value.style.height = `${height}px`
  }
}

function updateIframe() {
  if (!iframeRef.value) return
  const doc = iframeRef.value.contentDocument
  if (!doc) return
  doc.open()
  doc.write(renderedHtml.value)
  doc.close()
  // Resize after content renders
  nextTick(() => {
    resizeIframe()
    // Also resize after images/fonts load
    if (doc.defaultView) {
      doc.defaultView.addEventListener('load', resizeIframe)
    }
  })
}

watch(renderedHtml, () => {
  nextTick(updateIframe)
})

onMounted(() => {
  nextTick(updateIframe)
})
</script>

<template>
  <iframe
    ref="iframeRef"
    class="w-full border-0 rounded-lg"
    style="height: 600px; pointer-events: none;"
    sandbox="allow-same-origin"
    :title="t('templatePreview.iframeTitle')"
  />
</template>

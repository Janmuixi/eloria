<script setup lang="ts">
import { substituteTemplate } from '~/server/utils/template-substitute'

const { t, te } = useI18n()
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

const renderedHtml = computed(() => substituteTemplate(
  props.htmlTemplate,
  {
    coupleName1: props.coupleName1 || t('templatePreview.partner1'),
    coupleName2: props.coupleName2 || t('templatePreview.partner2'),
    date: props.date || t('templatePreview.weddingDate'),
    venue: props.venue || t('templatePreview.venue'),
    venueAddress: props.venueAddress || t('templatePreview.address'),
    wording: props.wording || t('templatePreview.wordingPlaceholder'),
  },
  (path: string) => (te(path) ? t(path) : undefined),
))

// Cap the wording at this many lines (at the template's natural line-height).
// If wording would render taller, font-size is stepped down until it fits.
const MAX_WORDING_LINES = 6

function fitWording() {
  if (!iframeRef.value) return
  const doc = iframeRef.value.contentDocument
  const win = iframeRef.value.contentWindow
  if (!doc?.body || !win) return

  const wording = doc.querySelector<HTMLElement>('.wording')
  if (!wording) return

  // Reset any previous adjustment so we measure the template's natural size.
  wording.style.removeProperty('font-size')

  const cs = win.getComputedStyle(wording)
  const origFontSize = parseFloat(cs.fontSize)
  if (!Number.isFinite(origFontSize) || origFontSize <= 0) return

  const parsedLineHeight = parseFloat(cs.lineHeight)
  const lineHeightPx = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
    ? parsedLineHeight
    : origFontSize * 1.4
  const maxHeight = lineHeightPx * MAX_WORDING_LINES
  const minFontSize = Math.max(8, origFontSize * 0.55)

  let fontSize = origFontSize
  let safety = 60
  while (wording.scrollHeight > maxHeight && fontSize > minFontSize && safety-- > 0) {
    fontSize -= 0.5
    wording.style.fontSize = `${fontSize}px`
  }
}

function resizeIframe() {
  if (!iframeRef.value) return
  const doc = iframeRef.value.contentDocument
  if (!doc?.body) return
  fitWording()
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
    // Re-fit once webfonts have settled — metrics differ between fallback
    // and the loaded font, so the first measurement can be off.
    const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    if (fonts?.ready) {
      fonts.ready.then(() => resizeIframe()).catch(() => {})
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

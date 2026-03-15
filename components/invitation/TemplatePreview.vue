<script setup lang="ts">
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

const renderedHtml = computed(() => {
  let html = props.htmlTemplate
  html = html.replace(/\{\{coupleName1\}\}/g, props.coupleName1 || 'Partner 1')
  html = html.replace(/\{\{coupleName2\}\}/g, props.coupleName2 || 'Partner 2')
  html = html.replace(/\{\{date\}\}/g, props.date || 'Wedding Date')
  html = html.replace(/\{\{venue\}\}/g, props.venue || 'Venue')
  html = html.replace(/\{\{venueAddress\}\}/g, props.venueAddress || 'Address')
  html = html.replace(/\{\{wording\}\}/g, props.wording || 'Your invitation wording will appear here.')
  return html
})

function updateIframe() {
  if (!iframeRef.value) return
  const doc = iframeRef.value.contentDocument
  if (!doc) return
  doc.open()
  doc.write(renderedHtml.value)
  doc.close()
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
    style="min-height: 600px; pointer-events: none;"
    sandbox="allow-same-origin"
    title="Invitation preview"
  />
</template>

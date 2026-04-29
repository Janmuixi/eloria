<script setup lang="ts">
const i18nHead = useLocaleHead({ dir: true, lang: true, seo: true })
const requestURL = useRequestURL()
const origin = requestURL.origin

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  link: i18nHead.value.link,
  meta: i18nHead.value.meta,
}))

useSeoMeta({
  ogSiteName: 'Eloria',
  ogImage: `${origin}/eloria-wordmark-charcoal.svg`,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <div class="min-h-screen bg-ivory-50 font-sans">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

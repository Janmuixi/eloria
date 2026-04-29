<script setup lang="ts">
const { locale } = useI18n()
const requestURL = useRequestURL()
const origin = requestURL.origin
const canonicalUrl = `${origin}${requestURL.pathname}`

useHead({
  htmlAttrs: { lang: () => locale.value },
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

useSeoMeta({
  ogSiteName: 'Eloria',
  ogLocale: () => (locale.value === 'es' ? 'es_ES' : 'en_US'),
  ogUrl: canonicalUrl,
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

<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: t('howItWorks.seoTitle'),
  description: t('howItWorks.seoDescription'),
  ogTitle: t('howItWorks.seoTitle'),
  ogDescription: t('howItWorks.seoDescription'),
  ogType: 'website',
  twitterTitle: t('howItWorks.seoTitle'),
  twitterDescription: t('howItWorks.seoDescription'),
})

const steps = [
  { n: 1, image: '/images/how-it-works/step-1-details.jpg',   width: 1265, height: 1002 },
  { n: 2, image: '/images/how-it-works/step-2-templates.jpg', width: 1265, height: 1951 },
  { n: 3, image: '/images/how-it-works/step-3-customize.jpg', width: 1265, height: 876 },
  { n: 4, image: '/images/how-it-works/step-4-preview.jpg',   width: 1265, height: 1160 },
  { n: 5, image: '/images/how-it-works/step-5-publish.jpg',   width: 1265, height: 1113 },
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-20 md:py-28">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <h1 class="font-display font-bold text-4xl md:text-6xl text-charcoal-900">
          {{ $t('howItWorks.heroTitle') }}
        </h1>
        <p class="text-lg text-charcoal-500 max-w-xl mx-auto mt-6">
          {{ $t('howItWorks.heroSubtitle') }}
        </p>
        <NuxtLinkLocale
          to="/auth/register"
          class="bg-champagne-500 text-white rounded-full px-8 py-3 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 mt-8 inline-block"
        >
          {{ $t('howItWorks.heroCta') }}
        </NuxtLinkLocale>
      </div>
    </section>

    <!-- Divider -->
    <div class="max-w-5xl mx-auto border-t border-champagne-400/20"></div>

    <!-- Step sections (editorial zigzag) -->
    <section
      v-for="step in steps"
      :key="step.n"
      class="py-16 md:py-24"
    >
      <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <!-- Image column -->
        <div :class="step.n % 2 === 0 ? 'md:order-2' : ''">
          <div class="rounded-2xl border border-charcoal-100 shadow-lg overflow-hidden bg-white">
            <img
              :src="step.image"
              :alt="$t(`howItWorks.steps.${step.n}.alt`)"
              :width="step.width"
              :height="step.height"
              :loading="step.n === 1 ? 'eager' : 'lazy'"
              decoding="async"
              class="w-full h-auto block"
            />
          </div>
        </div>

        <!-- Copy column -->
        <div :class="step.n % 2 === 0 ? 'md:order-1' : ''">
          <span class="text-xs uppercase tracking-widest text-champagne-600 font-medium">
            {{ $t('howItWorks.stepEyebrow', { n: step.n }) }}
          </span>
          <h2 class="font-display font-semibold text-3xl md:text-4xl text-charcoal-900 mt-2 mb-4">
            {{ $t(`howItWorks.steps.${step.n}.title`) }}
          </h2>
          <p class="text-charcoal-500 text-lg leading-relaxed">
            {{ $t(`howItWorks.steps.${step.n}.body`) }}
          </p>
        </div>
      </div>
    </section>

    <!-- Closing CTA band -->
    <section class="bg-charcoal-900 py-20 md:py-28">
      <div class="max-w-6xl mx-auto px-6 text-center">
        <h2 class="font-display font-semibold text-3xl text-ivory-50 mb-4">
          {{ $t('howItWorks.closingTitle') }}
        </h2>
        <p class="text-charcoal-300 mb-8 max-w-xl mx-auto">
          {{ $t('howItWorks.closingSubtitle') }}
        </p>
        <NuxtLinkLocale
          to="/auth/register"
          class="bg-champagne-500 text-white rounded-full px-8 py-3 font-medium hover:bg-champagne-600 hover:shadow-md transition-all duration-200 inline-block"
        >
          {{ $t('howItWorks.closingCta') }}
        </NuxtLinkLocale>
      </div>
    </section>
  </div>
</template>

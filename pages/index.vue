<script setup lang="ts">
useHead({
  title: 'Eloria - Beautiful Wedding Invitations',
  meta: [
    { name: 'description', content: 'Create stunning, personalized wedding invitations with AI-powered design, RSVP tracking, and easy sharing. Start for free.' },
    { property: 'og:title', content: 'Eloria - Beautiful Wedding Invitations' },
    { property: 'og:description', content: 'Create stunning, personalized wedding invitations with AI-powered design, RSVP tracking, and easy sharing.' },
  ],
})

const features = [
  {
    title: 'AI-Powered Design',
    description: 'AI recommends the perfect template for your style, making it effortless to find a design you love.',
    icon: 'sparkles',
  },
  {
    title: 'Send Everywhere',
    description: 'Share your invitation via link, email, or printable PDF. Reach every guest the way that works best.',
    icon: 'share',
  },
  {
    title: 'Track RSVPs',
    description: 'Know who\'s coming with real-time RSVP tracking. No more guessing or follow-up calls.',
    icon: 'chart',
  },
]

const steps = [
  { number: 1, title: 'Describe your style', description: 'Tell us about your wedding theme and preferences.' },
  { number: 2, title: 'Customize your invitation', description: 'Personalize every detail — colors, fonts, wording, and layout.' },
  { number: 3, title: 'Share with guests', description: 'Send your invitation by link, email, or download a PDF.' },
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="bg-primary-50 py-20 md:py-28">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight">
          Create Beautiful Wedding Invitations
        </h1>
        <p class="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
          Design stunning, personalized invitations in minutes. Share them anywhere, track RSVPs in real time, and make your big day unforgettable.
        </p>
        <div class="mt-10">
          <NuxtLink
            to="/auth/register"
            class="inline-block bg-primary-600 text-white text-lg font-semibold px-8 py-3 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            Get Started
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section class="py-20">
      <div class="max-w-6xl mx-auto px-6">
        <h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Everything you need</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="bg-white border border-gray-100 rounded-xl p-8 text-center shadow-sm"
          >
            <!-- Icon -->
            <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg v-if="feature.icon === 'sparkles'" class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <svg v-else-if="feature.icon === 'share'" class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <svg v-else class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ feature.title }}</h3>
            <p class="text-gray-500 text-sm leading-relaxed">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="bg-gray-50 py-20">
      <div class="max-w-4xl mx-auto px-6">
        <h2 class="text-3xl font-bold text-center text-gray-900 mb-12">How it works</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div v-for="step in steps" :key="step.number" class="text-center">
            <div class="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
              {{ step.number }}
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ step.title }}</h3>
            <p class="text-gray-500 text-sm leading-relaxed">{{ step.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Summary -->
    <section class="py-20">
      <div class="max-w-3xl mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
        <p class="text-gray-600 mb-8">Start free with our Basic plan. Upgrade anytime for more features, higher guest limits, and premium templates.</p>
        <NuxtLink
          to="/pricing"
          class="inline-block border-2 border-primary-600 text-primary-600 font-semibold px-6 py-2.5 rounded-lg hover:bg-primary-50 transition-colors"
        >
          View Pricing
        </NuxtLink>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="bg-primary-600 py-16">
      <div class="max-w-3xl mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold text-white mb-4">Ready to create your perfect invitation?</h2>
        <p class="text-primary-100 mb-8">Join thousands of couples who chose Eloria for their special day.</p>
        <NuxtLink
          to="/auth/register"
          class="inline-block bg-white text-primary-600 font-semibold px-8 py-3 rounded-lg hover:bg-primary-50 transition-colors shadow-sm"
        >
          Get Started Free
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Eloria - Beautiful Wedding Invitations',
  description: 'Create stunning wedding invitations with AI-powered design. Send via link, email, or print. Track RSVPs in real-time.',
  ogTitle: 'Eloria - Beautiful Wedding Invitations',
  ogDescription: 'Create stunning wedding invitations with AI-powered design.',
  ogType: 'website',
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
    <section class="py-28 md:py-36">
      <div class="max-w-6xl mx-auto px-6 text-center">
        <h1 class="font-display font-bold text-5xl md:text-6xl lg:text-7xl text-charcoal-900 tracking-tight">
          Your Wedding, Beautifully Invited
        </h1>
        <p class="text-lg text-charcoal-500 max-w-xl mx-auto mt-6">
          Design stunning, personalized invitations in minutes. Share them anywhere, track RSVPs in real time.
        </p>
        <NuxtLink
          to="/auth/register"
          class="bg-champagne-500 text-charcoal-900 rounded-full px-8 py-3 font-medium hover:bg-champagne-600 transition-all duration-200 hover:scale-[1.02] mt-8 inline-block"
        >
          Create Your Invitation
        </NuxtLink>
      </div>
    </section>

    <!-- Divider -->
    <div class="max-w-5xl mx-auto border-t border-champagne-400/30"></div>

    <!-- Features -->
    <section class="py-20 md:py-28">
      <div class="max-w-6xl mx-auto px-6">
        <h2 class="font-display font-semibold text-3xl text-charcoal-900 text-center mb-16">Everything you need</h2>
        <div class="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="text-center"
          >
            <!-- Icon -->
            <div class="w-14 h-14 bg-champagne-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg v-if="feature.icon === 'sparkles'" class="w-6 h-6 text-champagne-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <svg v-else-if="feature.icon === 'share'" class="w-6 h-6 text-champagne-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <svg v-else class="w-6 h-6 text-champagne-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 class="font-display font-semibold text-lg text-charcoal-900 mb-2">{{ feature.title }}</h3>
            <p class="text-charcoal-500 text-sm">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Divider -->
    <div class="max-w-5xl mx-auto border-t border-champagne-400/30"></div>

    <!-- How It Works -->
    <section class="py-20 md:py-28">
      <div class="max-w-6xl mx-auto px-6">
        <h2 class="font-display font-semibold text-3xl text-charcoal-900 text-center mb-16">How it works</h2>
        <div class="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div v-for="step in steps" :key="step.number" class="text-center">
            <div class="font-display font-bold text-3xl text-champagne-500 mb-3">
              {{ step.number }}
            </div>
            <h3 class="font-display font-semibold text-lg text-charcoal-900 mb-2">{{ step.title }}</h3>
            <p class="text-charcoal-500 text-sm">{{ step.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Divider -->
    <div class="max-w-5xl mx-auto border-t border-champagne-400/30"></div>

    <!-- Pricing Teaser -->
    <section class="py-20 md:py-28 text-center">
      <div class="max-w-6xl mx-auto px-6">
        <h2 class="font-display font-semibold text-3xl text-charcoal-900 mb-4">Simple, transparent pricing</h2>
        <p class="text-charcoal-500 mb-8 max-w-xl mx-auto">Start free with our Basic plan. Upgrade anytime for more features, higher guest limits, and premium templates.</p>
        <NuxtLink
          to="/pricing"
          class="text-champagne-600 font-medium hover:text-champagne-500 underline"
        >
          View Pricing
        </NuxtLink>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="bg-charcoal-900 py-20 md:py-28">
      <div class="max-w-6xl mx-auto px-6 text-center">
        <h2 class="font-display font-bold text-3xl text-ivory-50 mb-4">Ready to create your perfect invitation?</h2>
        <p class="text-charcoal-300 mb-8">Join thousands of couples who chose Eloria for their special day.</p>
        <NuxtLink
          to="/auth/register"
          class="bg-champagne-500 text-charcoal-900 rounded-full px-8 py-3 font-medium hover:bg-champagne-600 transition-all duration-200 inline-block"
        >
          Get Started Free
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

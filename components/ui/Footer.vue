<template>
  <footer class="bg-ivory-100 border-t border-charcoal-200 py-8">
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="text-charcoal-500 text-sm">
        <span class="font-display font-semibold text-charcoal-900">Eloria</span>
        &copy; {{ new Date().getFullYear() }} All rights reserved.
      </div>
      <div class="flex items-center gap-6">
        <NuxtLink to="/templates" class="text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors">Templates</NuxtLink>
        <NuxtLink to="/pricing" class="text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors">Pricing</NuxtLink>
        <a href="#" class="text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors">Contact</a>
      </div>
    </div>
  </footer>
</template>

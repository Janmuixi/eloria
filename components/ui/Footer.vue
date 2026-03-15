<template>
  <footer class="bg-ivory-100 border-t border-ivory-300 py-8">
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="text-gray-500 text-sm">
        <span class="font-semibold text-gray-700">Eloria</span>
        &copy; {{ new Date().getFullYear() }} All rights reserved.
      </div>
      <div class="flex items-center gap-6">
        <NuxtLink to="/templates" class="text-sm text-gray-500 hover:text-gray-700">Templates</NuxtLink>
        <NuxtLink to="/pricing" class="text-sm text-gray-500 hover:text-gray-700">Pricing</NuxtLink>
        <a href="#" class="text-sm text-gray-500 hover:text-gray-700">Contact</a>
      </div>
    </div>
  </footer>
</template>

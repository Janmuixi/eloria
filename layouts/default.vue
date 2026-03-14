<template>
  <div class="min-h-screen flex flex-col">
    <UiNavbar />
    <main class="flex-1">
      <slot />
    </main>
    <UiFooter />
  </div>
</template>

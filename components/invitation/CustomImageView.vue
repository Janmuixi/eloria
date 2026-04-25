<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const imageUrl = `/api/invitations/${props.slug}/custom-image`
</script>

<template>
  <div class="flex justify-center px-4 py-8">
    <img
      :src="imageUrl"
      alt=""
      class="max-w-full md:max-w-[600px] w-full h-auto rounded-md shadow-sm"
    />
  </div>
</template>

<!-- components/menu/AllergyPicker.vue -->
<script setup lang="ts">
import { ALLERGEN_KEYS, type AllergenKey, type Allergies, ALLERGY_OTHER_MAX_LENGTH } from '~/shared/menu'

const props = defineProps<{ modelValue: Allergies | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Allergies | null): void }>()

const keys = computed<AllergenKey[]>({
  get: () => props.modelValue?.keys ?? [],
  set: (v) => commit({ keys: v, other: props.modelValue?.other ?? '' }),
})
const other = computed<string>({
  get: () => props.modelValue?.other ?? '',
  set: (v) => commit({ keys: props.modelValue?.keys ?? [], other: v }),
})

function commit(next: Allergies) {
  if (next.keys.length === 0 && next.other.trim() === '') emit('update:modelValue', null)
  else emit('update:modelValue', { keys: next.keys, other: next.other.slice(0, ALLERGY_OTHER_MAX_LENGTH) })
}

function toggleKey(k: AllergenKey) {
  const cur = keys.value
  keys.value = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]
}
</script>

<template>
  <fieldset class="space-y-3">
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <label v-for="k in ALLERGEN_KEYS" :key="k"
        class="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm"
        :class="keys.includes(k) ? 'border-champagne-400 bg-champagne-50' : 'border-charcoal-100 hover:bg-ivory-50'">
        <input type="checkbox" :checked="keys.includes(k)" @change="toggleKey(k)" class="rounded text-champagne-600" />
        <span>{{ $t(`allergies.${k}`) }}</span>
      </label>
    </div>
    <input v-model="other" type="text" :maxlength="ALLERGY_OTHER_MAX_LENGTH"
      :placeholder="$t('allergies.otherPlaceholder')"
      class="w-full px-3 py-2 border border-charcoal-200 rounded-lg text-sm focus:ring-2 focus:ring-champagne-500" />
  </fieldset>
</template>

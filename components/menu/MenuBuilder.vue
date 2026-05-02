<!-- components/menu/MenuBuilder.vue -->
<script setup lang="ts">
import type { MenuTreeInput, MenuCourseInput, MenuOptionInput } from '~/shared/menu'

const props = defineProps<{ modelValue: MenuTreeInput }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: MenuTreeInput): void }>()

const courses = computed<MenuCourseInput[]>({
  get: () => props.modelValue.courses,
  set: (v) => emit('update:modelValue', { courses: v }),
})

function addCourse() {
  courses.value = [...courses.value, { name: '', sortOrder: courses.value.length, options: [{ name: '', sortOrder: 0 }] }]
}
function removeCourse(idx: number) {
  courses.value = courses.value.filter((_, i) => i !== idx)
}
function moveCourse(idx: number, dir: -1 | 1) {
  const next = [...courses.value]
  const j = idx + dir
  if (j < 0 || j >= next.length) return
  ;[next[idx], next[j]] = [next[j], next[idx]]
  courses.value = next
}
function addOption(ci: number) {
  const next = [...courses.value]
  next[ci] = { ...next[ci], options: [...next[ci].options, { name: '', sortOrder: next[ci].options.length }] }
  courses.value = next
}
function removeOption(ci: number, oi: number) {
  const next = [...courses.value]
  next[ci] = { ...next[ci], options: next[ci].options.filter((_, i) => i !== oi) }
  courses.value = next
}
function updateCourseName(ci: number, value: string) {
  const next = [...courses.value]
  next[ci] = { ...next[ci], name: value }
  courses.value = next
}
function updateOptionName(ci: number, oi: number, value: string) {
  const next = [...courses.value]
  const opts = [...next[ci].options]
  opts[oi] = { ...opts[oi], name: value }
  next[ci] = { ...next[ci], options: opts }
  courses.value = next
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="courses.length === 0" class="rounded-2xl border border-dashed border-charcoal-200 p-8 text-center">
      <p class="text-charcoal-300 mb-4">{{ $t('menu.builder.empty') }}</p>
      <button type="button" @click="addCourse"
        class="px-4 py-2 bg-champagne-600 text-white rounded-lg hover:bg-champagne-700">
        {{ $t('menu.builder.addCourse') }}
      </button>
    </div>

    <div v-for="(c, ci) in courses" :key="ci"
      class="rounded-2xl border border-charcoal-100 p-5 bg-white">
      <div class="flex items-start gap-3 mb-4">
        <input type="text" :value="c.name" @input="updateCourseName(ci, ($event.target as HTMLInputElement).value)"
          :placeholder="$t('menu.builder.coursePlaceholder')"
          class="flex-1 px-3 py-2 border border-charcoal-200 rounded-lg font-medium" />
        <button type="button" @click="moveCourse(ci, -1)" :disabled="ci === 0" class="px-2 disabled:opacity-30" aria-label="Move up">↑</button>
        <button type="button" @click="moveCourse(ci, 1)" :disabled="ci === courses.length - 1" class="px-2 disabled:opacity-30" aria-label="Move down">↓</button>
        <button type="button" @click="removeCourse(ci)" class="px-2 text-red-500" :aria-label="$t('common.remove')">×</button>
      </div>
      <div class="space-y-2 ml-4">
        <div v-for="(o, oi) in c.options" :key="oi" class="flex items-center gap-2">
          <input type="text" :value="o.name" @input="updateOptionName(ci, oi, ($event.target as HTMLInputElement).value)"
            :placeholder="$t('menu.builder.optionPlaceholder')"
            class="flex-1 px-3 py-2 border border-charcoal-200 rounded-lg text-sm" />
          <button type="button" @click="removeOption(ci, oi)" :disabled="c.options.length === 1"
            class="px-2 text-red-500 disabled:opacity-30" :aria-label="$t('common.remove')">×</button>
        </div>
        <button type="button" @click="addOption(ci)"
          class="text-sm text-champagne-700 hover:underline">+ {{ $t('menu.builder.addOption') }}</button>
      </div>
    </div>

    <button v-if="courses.length > 0" type="button" @click="addCourse"
      class="px-4 py-2 border border-charcoal-200 rounded-lg hover:bg-ivory-50">
      + {{ $t('menu.builder.addCourse') }}
    </button>
  </div>
</template>

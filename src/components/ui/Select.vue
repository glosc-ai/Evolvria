<script setup lang="ts">
import { cn } from '@/lib/utils'

interface SelectOption {
  label: string
  value: string | number
}

withDefaults(defineProps<{
  modelValue?: string | number
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()
</script>

<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    :class="cn('flex h-10 w-full rounded-md border border-input bg-input px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm', $attrs.class as string)"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>

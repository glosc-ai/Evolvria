<script setup lang="ts">
import { cn } from '@/lib/utils'

withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  rows?: number
}>(), {
  rows: 3,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <textarea
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows"
    :class="cn('flex min-h-[80px] w-full rounded-md border border-input bg-input px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none md:text-sm', $attrs.class as string)"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

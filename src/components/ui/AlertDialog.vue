<script setup lang="ts">
import Button from './Button.vue'

withDefaults(defineProps<{
  open?: boolean
  title?: string
  description?: string
  cancelText?: string
  confirmText?: string
  isLoading?: boolean
}>(), {
  cancelText: '取消',
  confirmText: '确认',
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 bg-black/80">
    <div class="fixed left-[50%] top-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%] border border-border bg-background p-4 shadow-lg duration-200 sm:rounded-lg">
      <div class="flex flex-col space-y-2">
        <h2 v-if="title" class="text-lg font-semibold leading-none tracking-tight">{{ title }}</h2>
        <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <Button
          variant="outline"
          :disabled="isLoading"
          @click="() => { emit('cancel'); emit('update:open', false); }"
        >
          {{ cancelText }}
        </Button>
        <Button
          :disabled="isLoading"
          @click="() => { emit('confirm'); emit('update:open', false); }"
        >
          {{ confirmText }}
        </Button>
      </div>
    </div>
  </div>
</template>

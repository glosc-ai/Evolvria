<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  as?: string
}>()
</script>

<template>
  <div :class="cn('rounded-lg border border-card-foreground/10 bg-card text-card-foreground', $attrs.class as string)">
    <slot />
  </div>
</template>

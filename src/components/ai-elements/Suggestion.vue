<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const props = defineProps<{
  suggestion: string;
  disabled?: boolean;
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  select: [suggestion: string];
}>();
</script>

<template>
  <Button
    :class="cn('cursor-pointer rounded-full px-4', props.class)"
    variant="outline"
    size="sm"
    type="button"
    :disabled="disabled"
    @click="emit('select', suggestion)"
  >
    <slot>{{ suggestion }}</slot>
  </Button>
</template>

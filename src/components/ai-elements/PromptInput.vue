<script setup lang="ts">
import { Send, Square } from "@lucide/vue";
import type { HTMLAttributes } from "vue";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    status?: "ready" | "submitted" | "streaming";
    placeholder?: string;
    class?: HTMLAttributes["class"];
    textareaClass?: HTMLAttributes["class"];
  }>(),
  {
    status: "ready",
    placeholder: "输入你的行动...",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

function handleSubmit(): void {
  if (props.disabled || !props.modelValue.trim()) return;
  emit("submit");
}
</script>

<template>
  <form
    :class="cn('relative flex min-h-24 flex-col overflow-hidden rounded-xl border bg-background shadow-sm', props.class)"
    @submit.prevent="handleSubmit"
  >
    <Textarea
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="cn('min-h-24 resize-none border-0 bg-transparent pb-12 shadow-none focus-visible:ring-0', textareaClass)"
      @update:model-value="(value) => emit('update:modelValue', String(value))"
      @keydown.meta.enter.prevent="handleSubmit"
      @keydown.ctrl.enter.prevent="handleSubmit"
    />
    <div class="absolute bottom-2 right-2 flex items-center gap-2">
      <Button
        size="icon"
        :variant="status === 'streaming' ? 'secondary' : 'default'"
        :disabled="disabled || (!modelValue.trim() && status !== 'streaming')"
        type="submit"
        aria-label="提交行动"
      >
        <Spinner v-if="status === 'streaming'" data-icon="inline-start" />
        <Square v-else-if="status === 'submitted'" data-icon="inline-start" />
        <Send v-else data-icon="inline-start" />
      </Button>
    </div>
  </form>
</template>

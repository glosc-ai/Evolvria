<script setup lang="ts">
import { AlertTriangle } from "lucide-vue-next";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    estimateText: string;
    confirmLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
  }>(),
  {
    confirmLabel: "确认调用",
    cancelLabel: "取消",
    busy: false,
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/68 px-4 py-6" role="dialog" aria-modal="true" :aria-label="title">
      <div class="w-full max-w-lg rounded-md border border-amber-300/30 bg-[#121816] p-5 shadow-2xl">
        <div class="flex items-start gap-3">
          <span class="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-amber-300/30 bg-amber-300/12 text-amber-100">
            <AlertTriangle :size="19" />
          </span>
          <div>
            <h2 class="text-lg font-semibold text-white">{{ title }}</h2>
            <p class="mt-2 text-sm leading-6 text-white/70">{{ description }}</p>
          </div>
        </div>

        <div class="mt-4 rounded-md border border-white/10 bg-black/24 p-3 text-sm leading-6 text-white/78">
          <div class="font-medium text-white">用量估算</div>
          <div class="mt-1">{{ estimateText }}</div>
        </div>

        <div class="mt-5 flex flex-wrap justify-end gap-3">
          <button class="e-btn" :disabled="busy" type="button" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button class="e-btn e-btn-primary" :disabled="busy" type="button" @click="emit('confirm')">{{ busy ? "正在调用..." : confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

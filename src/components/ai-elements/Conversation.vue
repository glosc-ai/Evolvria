<script setup lang="ts">
import { ArrowDown, Download } from "@lucide/vue";
import type { HTMLAttributes } from "vue";
import { nextTick, onMounted, onUpdated, ref } from "vue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    contentClass?: HTMLAttributes["class"];
    downloadable?: boolean;
    downloadLabel?: string;
  }>(),
  {
    downloadable: false,
    downloadLabel: "下载对话",
  },
);

const emit = defineEmits<{
  download: [];
}>();

const viewport = ref<HTMLElement | null>(null);
const atBottom = ref(true);

function updateAtBottom(): void {
  const element = viewport.value;
  if (!element) return;
  atBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
}

function scrollToBottom(behavior: ScrollBehavior = "smooth"): void {
  const element = viewport.value;
  if (!element) return;
  element.scrollTo({ top: element.scrollHeight, behavior });
}

onMounted(async () => {
  await nextTick();
  scrollToBottom("instant");
  updateAtBottom();
});

onUpdated(async () => {
  if (!atBottom.value) return;
  await nextTick();
  scrollToBottom("smooth");
});
</script>

<template>
  <section :class="cn('relative flex min-h-0 min-w-0 flex-1 overflow-hidden', props.class)" role="log" aria-live="polite">
    <div ref="viewport" class="min-h-0 min-w-0 flex-1 overflow-y-auto" @scroll="updateAtBottom">
      <div :class="cn('flex min-h-full min-w-0 flex-col gap-8 p-4', props.contentClass)">
        <slot />
      </div>
    </div>

    <Button
      v-if="downloadable"
      class="absolute right-4 top-4 rounded-full"
      size="icon"
      variant="outline"
      type="button"
      :aria-label="downloadLabel"
      @click="emit('download')"
    >
      <Download data-icon="inline-start" />
    </Button>

    <Button
      v-if="!atBottom"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full"
      size="icon"
      variant="outline"
      type="button"
      aria-label="滚动到底部"
      @click="scrollToBottom()"
    >
      <ArrowDown data-icon="inline-start" />
    </Button>
  </section>
</template>

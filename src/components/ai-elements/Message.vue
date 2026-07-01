<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  from: "user" | "assistant" | "system";
  class?: HTMLAttributes["class"];
  contentClass?: HTMLAttributes["class"];
}>();

const rootClass = computed(() =>
  cn(
    "group flex min-w-0 max-w-[95%] flex-col gap-2",
    props.from === "user" ? "ml-auto items-end justify-end" : "items-start",
    props.class,
  ),
);

const contentClass = computed(() =>
  cn(
    "flex min-w-0 max-w-full flex-col gap-2 text-sm leading-6 text-foreground",
    props.from === "user" ? "w-fit rounded-lg bg-secondary px-4 py-3" : "w-full",
    props.contentClass,
  ),
);
</script>

<template>
  <article :class="rootClass" :data-from="from">
    <div :class="contentClass">
      <slot />
    </div>
  </article>
</template>

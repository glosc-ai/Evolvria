<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
</script>

<template>
  <section v-if="world.hasWorld">
    <h1 class="text-2xl font-semibold">线索与目标</h1>
    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <Card v-for="thread in world.threads" :key="thread.id" class="p-4" :class="thread.status === 'resolved' ? 'opacity-60' : ''">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-medium">{{ thread.title }}</h2>
            <p class="text-muted-foreground mt-1 text-sm">{{ thread.kind }} · 优先级 {{ Math.round(thread.priority * 100) }}</p>
          </div>
          <span class="rounded px-2 py-1 text-xs" :class="thread.status === 'open' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/8 text-white/56'">{{ thread.status === 'open' ? "进行中" : "已解决" }}</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-white/70">{{ thread.description }}</p>
        <ol class="mt-3 space-y-2 text-sm">
          <li v-for="progress in thread.progress" :key="progress.event_id" class="rounded-md bg-black/22 p-2 text-white/62">{{ progress.text }}</li>
        </ol>
        <Button v-if="thread.status === 'open'" variant="outline" class="mt-3" type="button" @click="world.resolveThread(thread.id)">标记解决</Button>
      </Card>
    </div>
  </section>
</template>

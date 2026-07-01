<script setup lang="ts">
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const mainThread = computed(() => world.threads.find((thread) => thread.kind === "main") ?? world.threads[0]);
const goalProgress = computed(() => Math.min((mainThread.value?.progress.length ?? 0) * 34, 100));
</script>

<template>
  <section v-if="world.hasWorld">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-serif text-2xl font-semibold">线索与目标</h1>
        <p v-if="mainThread" class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          首要目标：{{ mainThread.title }}。{{ mainThread.description }}
        </p>
      </div>
      <Badge v-if="mainThread" :variant="mainThread.progress.length > 0 ? 'default' : 'secondary'">
        {{ mainThread.progress.length > 0 ? `已推进 ${mainThread.progress.length} 步` : "尚未推进" }}
      </Badge>
    </div>
    <div v-if="mainThread" class="mt-4 rounded-md border bg-card/60 p-4">
      <div class="flex items-center justify-between gap-3 text-sm">
        <span class="font-medium">首要目标进度</span>
        <span class="text-muted-foreground">{{ mainThread.status === "resolved" ? "已解决" : `${Math.round(goalProgress)}%` }}</span>
      </div>
      <Progress :model-value="mainThread.status === 'resolved' ? 100 : goalProgress" class="mt-3" />
      <p v-if="mainThread.progress[0]" class="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{{ mainThread.progress.at(-1)?.text }}</p>
    </div>
    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <Card v-for="thread in world.threads" :key="thread.id" :class="cn(thread.status === 'resolved' && 'opacity-60')">
        <CardHeader>
          <div class="flex items-start justify-between gap-3">
            <div>
            <CardTitle>{{ thread.title }}</CardTitle>
            <p class="text-muted-foreground mt-1 text-sm">{{ thread.kind }} · 优先级 {{ Math.round(thread.priority * 100) }}</p>
            </div>
            <Badge :variant="thread.status === 'open' ? 'default' : 'secondary'">{{ thread.status === 'open' ? "进行中" : "已解决" }}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-sm leading-6 text-muted-foreground">{{ thread.description }}</p>
          <ol class="mt-3 flex flex-col gap-2 text-sm">
            <li v-for="progress in thread.progress" :key="progress.event_id" class="rounded-md bg-secondary p-2 text-muted-foreground">{{ progress.text }}</li>
          </ol>
        </CardContent>
        <CardFooter v-if="thread.status === 'open'">
          <Button variant="outline" type="button" @click="world.resolveThread(thread.id)">标记解决</Button>
        </CardFooter>
      </Card>
    </div>
    <Empty v-if="world.threads.length === 0" class="mt-6">
      <EmptyHeader>
        <EmptyTitle>没有线索</EmptyTitle>
        <EmptyDescription>行动产生目标或悬念后会记录在这里。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </section>
</template>

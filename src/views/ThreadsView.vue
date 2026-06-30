<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
</script>

<template>
  <section v-if="world.hasWorld">
    <h1 class="font-serif text-2xl font-semibold">线索与目标</h1>
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

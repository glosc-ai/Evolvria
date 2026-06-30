<script setup lang="ts">
import { Bot, Clock, MapPin, Send, Sparkles } from "@lucide/vue";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/stores/app";
import { useWorldStore } from "@/stores/world";

const router = useRouter();
const app = useAppStore();
const world = useWorldStore();
const action = ref("");

const visibleSuggestedActions = computed(() => {
  const currentName = world.current?.name;
  if (!currentName) return world.suggestedActions;
  const currentTravel = `前往${currentName}`;
  const currentTravelWithSpace = `前往 ${currentName}`;
  return world.suggestedActions.filter((item) => item !== currentTravel && item !== currentTravelWithSpace);
});
async function requestSubmit(text = action.value) {
  try {
    if (world.busy) return;
    if (!world.hasWorld) {
      await router.push("/new-world");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    await submit(trimmed);
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}

async function submit(text = action.value) {
  try {
    await world.submitPlayerAction(text);
    action.value = "";
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}
</script>

<template>
  <section v-if="world.hasWorld" class="grid gap-5 xl:grid-cols-[1fr_360px]">
    <div class="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div class="flex flex-wrap items-center gap-3">
            <Badge variant="secondary"><MapPin />{{ world.current?.name }}</Badge>
            <Badge variant="secondary"><Clock />第 {{ world.world.current_time.day }} 天 {{ world.world.current_time.hour }} 时</Badge>
            <Badge :variant="world.busy ? 'default' : 'secondary'"><Bot />{{ world.busy ? "AI 正在生成" : "等待行动" }}</Badge>
          </div>
        </CardHeader>
        <CardContent>
        <article class="max-w-3xl text-lg leading-9 text-foreground">
          {{ world.lastNarrative || world.timeline[world.timeline.length - 1]?.description }}
        </article>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2"><Sparkles class="size-4" />推荐行动</CardTitle>
        </CardHeader>
        <CardContent>
        <div class="flex flex-wrap gap-2">
          <Button v-for="item in visibleSuggestedActions" :key="item" variant="outline" :disabled="world.busy" type="button" @click="requestSubmit(item)">{{ item }}</Button>
        </div>
        <Empty v-if="visibleSuggestedActions.length === 0">
          <EmptyHeader>
            <EmptyTitle>暂无推荐行动</EmptyTitle>
            <EmptyDescription>可以直接输入下一步行动。</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Field class="mt-4">
          <FieldLabel for="player-action" class="sr-only">输入行动</FieldLabel>
          <div class="flex gap-2">
          <Textarea id="player-action" v-model="action" class="min-h-24 flex-1" placeholder="输入你的行动..." @keydown.meta.enter.prevent="requestSubmit()" @keydown.ctrl.enter.prevent="requestSubmit()" />
          <Button class="self-stretch px-4" :disabled="world.busy || !action.trim()" type="button" aria-label="提交行动" @click="requestSubmit()">
            <Send data-icon="inline-start" />
          </Button>
          </div>
        </Field>
        </CardContent>
      </Card>
    </div>

    <aside class="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>当前地点</CardTitle>
          <CardDescription>{{ world.current?.description }}</CardDescription>
        </CardHeader>
        <CardContent>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button v-for="location in world.locations.filter((l) => l.id !== world.current?.id).slice(0, 4)" :key="location.id" variant="outline" size="sm" type="button" @click="world.goToLocation(location.id)">前往 {{ location.name }}</Button>
        </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>最近事件</CardTitle>
        </CardHeader>
        <CardContent>
        <ol class="flex flex-col gap-3 text-sm">
          <li v-for="event in world.timeline.slice(-5).reverse()" :key="event.id" class="rounded-md bg-secondary p-3">
            <div class="font-medium">{{ event.title }}</div>
            <div class="text-muted-foreground mt-1 line-clamp-2">{{ event.description }}</div>
          </li>
        </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>同行角色</CardTitle>
        </CardHeader>
        <CardContent>
        <div class="flex flex-col gap-2 text-sm">
          <Badge v-for="character in world.characters.filter((c) => c.companion)" :key="character.id" variant="secondary" class="justify-start rounded-md px-3 py-2">{{ character.name }} · {{ character.role }}</Badge>
        </div>
        <Empty v-if="world.characters.filter((c) => c.companion).length === 0">
          <EmptyHeader>
            <EmptyTitle>暂无同行角色</EmptyTitle>
          </EmptyHeader>
        </Empty>
        </CardContent>
      </Card>
    </aside>
  </section>
  <section v-else class="mx-auto max-w-xl text-center">
    <h1 class="text-3xl font-semibold">还没有世界</h1>
    <p class="text-muted-foreground mt-2">先创建世界后进入探索。</p>
    <Button class="mt-5" type="button" @click="router.push('/new-world')">新建世界</Button>
  </section>
</template>

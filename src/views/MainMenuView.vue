<script setup lang="ts">
import { Play, Plus, Settings, Upload } from "@lucide/vue";
import { RouterLink, useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { useWorldStore } from "@/stores/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

const router = useRouter();
const app = useAppStore();
const world = useWorldStore();

async function continueGame() {
  if (!world.hasWorld) {
    app.setError("当前没有可继续的世界。");
    return;
  }
  await router.push("/exploration");
}
</script>

<template>
  <section class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
    <div class="flex min-h-[70dvh] flex-col justify-center">
      <p class="text-sm uppercase tracking-[0.22em] text-primary/80">Evolvria</p>
      <h1 class="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">让角色、地点和时间线在本地持续演化</h1>
      <p class="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">创建主角与世界种子,AI 扩写世界并记录每一次行动、记忆、关系和地图变化。未配置 Glosc One 时自动使用本地模拟。</p>
      <div class="mt-8 flex flex-wrap gap-3">
        <Button type="button" :variant="world.hasWorld ? 'default' : 'outline'" :disabled="!world.hasWorld" @click="continueGame">
          <Play data-icon="inline-start" />
          继续游戏
        </Button>
        <Button :as="RouterLink" to="/new-world">
          <Plus data-icon="inline-start" />
          新建世界
        </Button>
        <Button :as="RouterLink" to="/saves" variant="outline">
          <Upload data-icon="inline-start" />
          存档列表
        </Button>
        <Button :as="RouterLink" to="/settings" variant="outline">
          <Settings data-icon="inline-start" />
          设置
        </Button>
      </div>
    </div>
    <aside class="self-center">
      <Card>
        <CardHeader>
          <CardTitle>当前状态</CardTitle>
          <CardDescription v-if="world.hasWorld">{{ world.world.genre }} · {{ world.world.tone.join(" / ") }}</CardDescription>
        </CardHeader>
        <CardContent>
        <div v-if="world.hasWorld" class="flex flex-col gap-3 text-sm">
          <div class="text-2xl font-semibold">{{ world.world.name }}</div>
          <div class="grid grid-cols-2 gap-2">
            <Badge variant="secondary" class="justify-between rounded-md px-3 py-2">角色 <span>{{ world.characters.length }}</span></Badge>
            <Badge variant="secondary" class="justify-between rounded-md px-3 py-2">地点 <span>{{ world.locations.length }}</span></Badge>
            <Badge variant="secondary" class="justify-between rounded-md px-3 py-2">事件 <span>{{ world.timeline.length }}</span></Badge>
            <Badge variant="secondary" class="justify-between rounded-md px-3 py-2">线索 <span>{{ world.activeThreads.length }}</span></Badge>
          </div>
        </div>
        <Empty v-else>
          <EmptyHeader>
            <EmptyTitle>还没有世界</EmptyTitle>
            <EmptyDescription>还没有世界。先创建一个世界，或从存档页导入已有存档。</EmptyDescription>
          </EmptyHeader>
        </Empty>
        </CardContent>
      </Card>
    </aside>
  </section>
</template>

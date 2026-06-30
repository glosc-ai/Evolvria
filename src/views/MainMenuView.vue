<script setup lang="ts">
import { Play, Plus, Settings, Upload } from "lucide-vue-next";
import { RouterLink, useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { useWorldStore } from "@/stores/world";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
      <p class="text-sm uppercase tracking-[0.22em] text-emerald-300/80">Evolvria</p>
      <h1 class="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">让角色、地点和时间线在本地持续演化</h1>
      <p class="mt-5 max-w-2xl text-base leading-7 text-white/64">创建主角与世界种子，AI 扩写世界并记录每一次行动、记忆、关系和地图变化。未配置 Glosc One 时自动使用本地模拟。</p>
      <div class="mt-8 flex flex-wrap gap-3">
        <Button type="button" :variant="world.hasWorld ? 'default' : 'outline'" :disabled="!world.hasWorld" @click="continueGame"><Play :size="18" />继续游戏</Button>
        <Button :as="RouterLink" to="/new-world"><Plus :size="18" />新建世界</Button>
        <Button :as="RouterLink" to="/saves" variant="outline"><Upload :size="18" />存档列表</Button>
        <Button :as="RouterLink" to="/settings" variant="outline"><Settings :size="18" />设置</Button>
      </div>
    </div>
    <aside class="self-center">
      <Card class="p-5">
        <div class="text-sm font-medium text-white/80">当前状态</div>
        <div v-if="world.hasWorld" class="mt-4 space-y-3 text-sm">
          <div class="text-2xl font-semibold">{{ world.world.name }}</div>
          <div class="text-muted-foreground">{{ world.world.genre }} · {{ world.world.tone.join(" / ") }}</div>
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-md bg-black/24 p-3"><div class="text-muted-foreground text-xs">角色</div><div class="mt-1 text-lg">{{ world.characters.length }}</div></div>
            <div class="rounded-md bg-black/24 p-3"><div class="text-muted-foreground text-xs">地点</div><div class="mt-1 text-lg">{{ world.locations.length }}</div></div>
            <div class="rounded-md bg-black/24 p-3"><div class="text-muted-foreground text-xs">事件</div><div class="mt-1 text-lg">{{ world.timeline.length }}</div></div>
            <div class="rounded-md bg-black/24 p-3"><div class="text-muted-foreground text-xs">线索</div><div class="mt-1 text-lg">{{ world.activeThreads.length }}</div></div>
          </div>
        </div>
        <div v-else class="mt-4 text-sm leading-6 text-white/58">还没有世界。先创建一个世界，或从存档页导入已有存档。</div>
      </Card>
    </aside>
  </section>
</template>

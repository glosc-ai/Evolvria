<script setup lang="ts">
import { Bot, Clock, MapPin, Send, Sparkles } from "lucide-vue-next";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { useWorldStore } from "@/stores/world";

const router = useRouter();
const app = useAppStore();
const world = useWorldStore();
const action = ref("");

async function submit(text = action.value) {
  try {
    if (!world.hasWorld) {
      await router.push("/new-world");
      return;
    }
    await world.submitPlayerAction(text);
    action.value = "";
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}
</script>

<template>
  <section v-if="world.hasWorld" class="grid gap-5 xl:grid-cols-[1fr_360px]">
    <div class="space-y-5">
      <div class="e-panel p-5">
        <div class="flex flex-wrap items-center gap-3 text-sm text-white/62">
          <span class="inline-flex items-center gap-2"><MapPin :size="16" />{{ world.current?.name }}</span>
          <span class="inline-flex items-center gap-2"><Clock :size="16" />第 {{ world.world.current_time.day }} 天 {{ world.world.current_time.hour }} 时</span>
          <span class="inline-flex items-center gap-2"><Bot :size="16" />{{ world.busy ? "AI 正在生成" : "等待行动" }}</span>
        </div>
        <article class="mt-5 max-w-3xl text-lg leading-9 text-white/86">
          {{ world.lastNarrative || world.timeline[world.timeline.length - 1]?.description }}
        </article>
      </div>

      <div class="e-panel p-5">
        <div class="mb-3 flex items-center gap-2 text-sm font-medium"><Sparkles :size="16" />推荐行动</div>
        <div class="flex flex-wrap gap-2">
          <button v-for="item in world.suggestedActions" :key="item" class="e-btn" :disabled="world.busy" type="button" @click="submit(item)">{{ item }}</button>
        </div>
        <div class="mt-4 flex gap-2">
          <textarea v-model="action" class="e-field min-h-24 flex-1" placeholder="输入你的行动..." @keydown.meta.enter.prevent="submit()" @keydown.ctrl.enter.prevent="submit()" />
          <button class="e-btn e-btn-primary self-stretch px-4" :disabled="world.busy || !action.trim()" type="button" @click="submit()"><Send :size="18" /></button>
        </div>
      </div>
    </div>

    <aside class="space-y-5">
      <div class="e-panel p-5">
        <div class="font-medium">当前地点</div>
        <p class="e-muted mt-2 text-sm leading-6">{{ world.current?.description }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button v-for="location in world.locations.filter((l) => l.id !== world.current?.id).slice(0, 4)" :key="location.id" class="e-btn" type="button" @click="world.goToLocation(location.id)">前往 {{ location.name }}</button>
        </div>
      </div>
      <div class="e-panel p-5">
        <div class="font-medium">最近事件</div>
        <ol class="mt-3 space-y-3 text-sm">
          <li v-for="event in world.timeline.slice(-5).reverse()" :key="event.id" class="rounded-md bg-black/24 p-3">
            <div class="font-medium">{{ event.title }}</div>
            <div class="e-muted mt-1 line-clamp-2">{{ event.description }}</div>
          </li>
        </ol>
      </div>
      <div class="e-panel p-5">
        <div class="font-medium">同行角色</div>
        <div class="mt-3 space-y-2 text-sm">
          <div v-for="character in world.characters.filter((c) => c.companion)" :key="character.id" class="rounded-md bg-black/24 p-3">{{ character.name }} · {{ character.role }}</div>
        </div>
      </div>
    </aside>
  </section>
  <section v-else class="mx-auto max-w-xl text-center">
    <h1 class="text-3xl font-semibold">还没有世界</h1>
    <p class="e-muted mt-2">先创建世界后进入探索。</p>
    <RouterLink class="e-btn e-btn-primary mt-5" to="/new-world">新建世界</RouterLink>
  </section>
</template>

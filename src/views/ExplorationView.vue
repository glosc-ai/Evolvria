<script setup lang="ts">
import { Bot, Clock, MapPin, Send, Sparkles } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AiCallConfirmDialog from "@/components/AiCallConfirmDialog.vue";
import { estimateUsageText } from "@/services/ai";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";
import { useWorldStore } from "@/stores/world";

const router = useRouter();
const app = useAppStore();
const settings = useSettingsStore();
const world = useWorldStore();
const action = ref("");
const actionToConfirm = ref("");
const confirmOpen = ref(false);

const shouldConfirmAiCall = computed(() => settings.settings.confirm_ai_calls && settings.gloscConfigured);
const visibleSuggestedActions = computed(() => {
  const currentName = world.current?.name;
  if (!currentName) return world.suggestedActions;
  const currentTravel = `前往${currentName}`;
  const currentTravelWithSpace = `前往 ${currentName}`;
  return world.suggestedActions.filter((item) => item !== currentTravel && item !== currentTravelWithSpace);
});
const actionEstimate = computed(() => {
  const text = actionToConfirm.value.trim();
  if (!text || !world.hasWorld) return "";
  return estimateUsageText(world.getUsageEstimate("player_action", { action: text, context: world.buildAiContext(text) }));
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
    if (shouldConfirmAiCall.value) {
      actionToConfirm.value = trimmed;
      confirmOpen.value = true;
      return;
    }
    await submit(trimmed);
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}

async function submit(text = actionToConfirm.value || action.value) {
  confirmOpen.value = false;
  try {
    await world.submitPlayerAction(text);
    action.value = "";
    actionToConfirm.value = "";
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}

function cancelConfirmation() {
  confirmOpen.value = false;
  actionToConfirm.value = "";
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
          <button v-for="item in visibleSuggestedActions" :key="item" class="e-btn" :disabled="world.busy" type="button" @click="requestSubmit(item)">{{ item }}</button>
        </div>
        <div class="mt-4 flex gap-2">
          <textarea v-model="action" class="e-field min-h-24 flex-1" placeholder="输入你的行动..." @keydown.meta.enter.prevent="requestSubmit()" @keydown.ctrl.enter.prevent="requestSubmit()" />
          <button class="e-btn e-btn-primary self-stretch px-4" :disabled="world.busy || !action.trim()" type="button" @click="requestSubmit()"><Send :size="18" /></button>
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

    <AiCallConfirmDialog
      :open="confirmOpen"
      title="确认调用 Glosc One 解析行动"
      :description="`将把当前场景、相关记忆和你的行动“${actionToConfirm}”发送到远端模型。`"
      :estimate-text="actionEstimate"
      confirm-label="确认并提交行动"
      :busy="world.busy"
      @confirm="submit"
      @cancel="cancelConfirmation"
    />
  </section>
  <section v-else class="mx-auto max-w-xl text-center">
    <h1 class="text-3xl font-semibold">还没有世界</h1>
    <p class="e-muted mt-2">先创建世界后进入探索。</p>
    <RouterLink class="e-btn e-btn-primary mt-5" to="/new-world">新建世界</RouterLink>
  </section>
</template>

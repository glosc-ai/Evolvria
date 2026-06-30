<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AiCallConfirmDialog from "@/components/AiCallConfirmDialog.vue";
import { estimateUsageText } from "@/services/ai";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";
import { useWorldStore } from "@/stores/world";
import type { WorldSeed } from "@/types/domain";

const router = useRouter();
const app = useAppStore();
const settings = useSettingsStore();
const world = useWorldStore();
const step = ref(1);
const confirmOpen = ref(false);
const draft = reactive<WorldSeed>({
  world_name: "烟测世界",
  genre: "奇幻",
  tone: "冒险",
  limits: "保持可读性，避免极端血腥和酷刑描写。",
  narrative_detail: "详细",
  npc_autonomy_frequency: "中频",
  hero: { name: "测试者", description: "记录员", goal: "验证世界循环", ability: "观察,推理", weakness: "过度谨慎" },
  key_characters: [
    { name: "璃安", role: "旧友", relationship: "同行", personality: "温和,谨慎", goal: "查清徽记来源", secret: "知道徽记与旧档案有关", action_tendency: "保护主角并暗中确认线索", description: "提供线索的人" },
    { name: "赛拉", role: "竞争者", relationship: "竞争", personality: "果断,好胜", goal: "抢先得到档案", secret: "曾为边境守望工作", action_tendency: "主动追踪遗迹并试探玩家", description: "推动冲突的人" },
  ],
});

const estimate = computed(() => estimateUsageText(world.getUsageEstimate("world_expand", draft)));
const shouldConfirmAiCall = computed(() => settings.settings.confirm_ai_calls && settings.gloscConfigured);

async function requestCreate() {
  if (world.busy) return;
  if (shouldConfirmAiCall.value) {
    confirmOpen.value = true;
    return;
  }
  await create();
}

async function create() {
  confirmOpen.value = false;
  try {
    await world.createWorld(JSON.parse(JSON.stringify(draft)));
    app.setNotice("世界已创建。");
    await router.push("/exploration");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "世界创建失败。");
  }
}
</script>

<template>
  <section class="mx-auto max-w-5xl">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold">新建世界</h1>
        <p class="e-muted mt-1 text-sm">第 {{ step }} / 5 步</p>
      </div>
      <RouterLink class="e-btn" to="/">返回首页</RouterLink>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
      <div class="e-panel p-5">
        <div v-if="step === 1" class="space-y-4">
          <label class="block text-sm">世界名称<input v-model="draft.world_name" class="e-field mt-2" /></label>
          <label class="block text-sm">类型<select v-model="draft.genre" class="e-field mt-2"><option>奇幻</option><option>科幻</option><option>现代都市</option><option>武侠</option></select></label>
          <label class="block text-sm">基调<select v-model="draft.tone" class="e-field mt-2"><option>冒险</option><option>政治</option><option>悬疑</option><option>温情</option></select></label>
        </div>
        <div v-else-if="step === 2" class="space-y-4">
          <label class="block text-sm">主角姓名<input v-model="draft.hero.name" class="e-field mt-2" /></label>
          <label class="block text-sm">身份描述<textarea v-model="draft.hero.description" class="e-field mt-2 min-h-24" /></label>
          <label class="block text-sm">目标<input v-model="draft.hero.goal" class="e-field mt-2" /></label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm">能力<input v-model="draft.hero.ability" class="e-field mt-2" /></label>
            <label class="block text-sm">弱点<input v-model="draft.hero.weakness" class="e-field mt-2" /></label>
          </div>
        </div>
        <div v-else-if="step === 3" class="space-y-4">
          <fieldset v-for="(character, index) in draft.key_characters" :key="index" class="rounded-md border border-white/10 bg-black/20 p-3">
            <legend class="px-1 text-sm font-medium text-white/86">关键角色 {{ index + 1 }}</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-sm">姓名<input v-model="character.name" class="e-field mt-2" /></label>
              <label class="block text-sm">身份<input v-model="character.role" class="e-field mt-2" /></label>
              <label class="block text-sm">与主角关系<input v-model="character.relationship" class="e-field mt-2" /></label>
              <label class="block text-sm">性格标签<input v-model="character.personality" class="e-field mt-2" /></label>
              <label class="block text-sm">目标<input v-model="character.goal" class="e-field mt-2" /></label>
              <label class="block text-sm">秘密<input v-model="character.secret" class="e-field mt-2" /></label>
            </div>
            <label class="mt-3 block text-sm">行动倾向<textarea v-model="character.action_tendency" class="e-field mt-2 min-h-20" /></label>
          </fieldset>
          <button class="e-btn" type="button" @click="draft.key_characters.push({ name: '', role: '', relationship: '', personality: '', goal: '', secret: '', action_tendency: '', description: '' })">添加角色</button>
        </div>
        <div v-else-if="step === 4" class="space-y-4">
          <label class="block text-sm">内容偏好与禁用内容<textarea v-model="draft.limits" class="e-field mt-2 min-h-24" /></label>
          <label class="block text-sm">叙事详细度<select v-model="draft.narrative_detail" class="e-field mt-2"><option>简洁</option><option>适中</option><option>详细</option></select></label>
          <label class="block text-sm">NPC 自主频率<select v-model="draft.npc_autonomy_frequency" class="e-field mt-2"><option>低频</option><option>中频</option><option>高频</option></select></label>
        </div>
        <div v-else class="space-y-4">
          <div class="rounded-md bg-black/24 p-4 text-sm leading-6">
            <div class="font-medium">{{ draft.world_name }} · {{ draft.genre }} · {{ draft.tone }}</div>
            <div class="e-muted mt-2">主角：{{ draft.hero.name }}，目标：{{ draft.hero.goal }}</div>
            <div class="e-muted">关键角色：{{ draft.key_characters.map((c) => c.name).filter(Boolean).join("、") }}</div>
          </div>
          <div class="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-50">{{ estimate }}</div>
        </div>

        <div class="mt-6 flex justify-between">
          <button class="e-btn" :disabled="step === 1 || world.busy" type="button" @click="step -= 1">上一步</button>
          <button v-if="step < 5" class="e-btn e-btn-primary" type="button" @click="step += 1">下一步</button>
          <button v-else class="e-btn e-btn-primary" :disabled="world.busy" type="button" @click="requestCreate">{{ world.busy ? "正在扩写..." : "创建并扩写世界" }}</button>
        </div>
      </div>

      <aside class="e-panel p-5">
        <div class="font-medium">预览</div>
        <div class="mt-4 space-y-3 text-sm text-white/68">
          <p>{{ draft.limits }}</p>
          <p>叙事：{{ draft.narrative_detail }} · NPC：{{ draft.npc_autonomy_frequency }}</p>
          <p>所有 AI 请求都会先校验 JSON 和状态 patch，失败不会修改世界。</p>
        </div>
      </aside>
    </div>

    <AiCallConfirmDialog
      :open="confirmOpen"
      title="确认调用 Glosc One 扩写世界"
      description="将把当前世界种子、主角与关键角色设定发送到远端模型生成初始世界。"
      :estimate-text="estimate"
      confirm-label="确认并创建世界"
      :busy="world.busy"
      @confirm="create"
      @cancel="confirmOpen = false"
    />
  </section>
</template>

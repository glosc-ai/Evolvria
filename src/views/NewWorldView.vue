<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AiCallConfirmDialog from "@/components/AiCallConfirmDialog.vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AppSelect from "@/components/AppSelect.vue";
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
        <p class="text-muted-foreground mt-1 text-sm">第 {{ step }} / 5 步</p>
      </div>
      <Button variant="outline" type="button" @click="router.push('/')">返回首页</Button>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card class="p-5">
        <div v-if="step === 1" class="space-y-4">
          <label class="block text-sm">世界名称<Input v-model="draft.world_name" class="mt-2" /></label>
          <label class="block text-sm">
            类型
            <AppSelect v-model="draft.genre" :options="[{label: '奇幻', value: '奇幻'}, {label: '科幻', value: '科幻'}, {label: '现代都市', value: '现代都市'}, {label: '武侠', value: '武侠'}]" class="mt-2" />
          </label>
          <label class="block text-sm">
            基调
            <AppSelect v-model="draft.tone" :options="[{label: '冒险', value: '冒险'}, {label: '政治', value: '政治'}, {label: '悬疑', value: '悬疑'}, {label: '温情', value: '温情'}]" class="mt-2" />
          </label>
        </div>
        <div v-else-if="step === 2" class="space-y-4">
          <label class="block text-sm">主角姓名<Input v-model="draft.hero.name" class="mt-2" /></label>
          <label class="block text-sm">身份描述<Textarea v-model="draft.hero.description" class="mt-2 min-h-24" /></label>
          <label class="block text-sm">目标<Input v-model="draft.hero.goal" class="mt-2" /></label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm">能力<Input v-model="draft.hero.ability" class="mt-2" /></label>
            <label class="block text-sm">弱点<Input v-model="draft.hero.weakness" class="mt-2" /></label>
          </div>
        </div>
        <div v-else-if="step === 3" class="space-y-4">
          <fieldset v-for="(character, index) in draft.key_characters" :key="index" class="rounded-md border border-white/10 bg-black/20 p-3">
            <legend class="px-1 text-sm font-medium text-white/86">关键角色 {{ index + 1 }}</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-sm">姓名<Input v-model="character.name" class="mt-2" /></label>
              <label class="block text-sm">身份<Input v-model="character.role" class="mt-2" /></label>
              <label class="block text-sm">与主角关系<Input v-model="character.relationship" class="mt-2" /></label>
              <label class="block text-sm">性格标签<Input v-model="character.personality" class="mt-2" /></label>
              <label class="block text-sm">目标<Input v-model="character.goal" class="mt-2" /></label>
              <label class="block text-sm">秘密<Input v-model="character.secret" class="mt-2" /></label>
            </div>
            <label class="mt-3 block text-sm">行动倾向<Textarea v-model="character.action_tendency" class="mt-2 min-h-20" /></label>
          </fieldset>
          <Button variant="outline" type="button" @click="draft.key_characters.push({ name: '', role: '', relationship: '', personality: '', goal: '', secret: '', action_tendency: '', description: '' })">添加角色</Button>
        </div>
        <div v-else-if="step === 4" class="space-y-4">
          <label class="block text-sm">内容偏好与禁用内容<Textarea v-model="draft.limits" class="mt-2 min-h-24" /></label>
          <label class="block text-sm">
            叙事详细度
            <AppSelect v-model="draft.narrative_detail" :options="[{label: '简洁', value: '简洁'}, {label: '适中', value: '适中'}, {label: '详细', value: '详细'}]" class="mt-2" />
          </label>
          <label class="block text-sm">
            NPC 自主频率
            <AppSelect v-model="draft.npc_autonomy_frequency" :options="[{label: '低频', value: '低频'}, {label: '中频', value: '中频'}, {label: '高频', value: '高频'}]" class="mt-2" />
          </label>
        </div>
        <div v-else class="space-y-4">
          <div class="rounded-md bg-black/24 p-4 text-sm leading-6">
            <div class="font-medium">{{ draft.world_name }} · {{ draft.genre }} · {{ draft.tone }}</div>
            <div class="text-muted-foreground mt-2">主角：{{ draft.hero.name }}，目标：{{ draft.hero.goal }}</div>
            <div class="text-muted-foreground">关键角色：{{ draft.key_characters.map((c) => c.name).filter(Boolean).join("、") }}</div>
          </div>
          <div class="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-50">{{ estimate }}</div>
        </div>

        <div class="mt-6 flex justify-between">
          <Button variant="outline" :disabled="step === 1 || world.busy" type="button" @click="step -= 1">上一步</Button>
          <Button v-if="step < 5" :disabled="world.busy" type="button" @click="step += 1">下一步</Button>
          <Button v-else :disabled="world.busy" type="button" @click="requestCreate">{{ world.busy ? "正在扩写..." : "创建并扩写世界" }}</Button>
        </div>
      </Card>

      <Card class="p-5">
        <div class="font-medium">预览</div>
        <div class="mt-4 space-y-3 text-sm text-white/68">
          <p>{{ draft.limits }}</p>
          <p>叙事：{{ draft.narrative_detail }} · NPC：{{ draft.npc_autonomy_frequency }}</p>
          <p>所有 AI 请求都会先校验 JSON 和状态 patch，失败不会修改世界。</p>
        </div>
      </Card>
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

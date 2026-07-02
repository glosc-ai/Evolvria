<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { labelFor } from "@/lib/display";
import { useAppStore } from "@/stores/app";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const storyline = computed(() => store.getStoryline(String(route.params.storylineId)));
const scenarios = computed(() => storyline.value ? store.storylineScenarios(storyline.value) : []);
const personas = computed(() => store.personas);
const personaMode = ref<"new" | "saved">("new");
const selectedPersonaId = ref(personas.value[0]?.id ?? "");
const selectedPersona = computed(() => personas.value.find((persona) => persona.id === selectedPersonaId.value));
const form = reactive({
  name: "旅人",
  pronouns: "",
  description: "",
  scenarioId: "",
  pace: "balanced",
  tone: "immersive",
  boundaries: "保持 SFW 默认边界\n不使用竞品角色或素材",
  privateNotes: "",
});

watch(personas, (items) => {
  if (!selectedPersonaId.value && items[0]) selectedPersonaId.value = items[0].id;
}, { immediate: true });

async function start() {
  if (!storyline.value) return;
  const useSavedPersona = personaMode.value === "saved" && selectedPersona.value;
  const chatId = await store.startStory(storyline.value.id, {
    personaId: useSavedPersona ? selectedPersona.value.id : undefined,
    name: useSavedPersona ? selectedPersona.value.name : form.name,
    pronouns: useSavedPersona ? selectedPersona.value.pronouns : form.pronouns || undefined,
    description: useSavedPersona ? selectedPersona.value.description : form.description || storyline.value.playerRole,
    scenarioId: form.scenarioId || scenarios.value[0]?.id,
    preferences: useSavedPersona
      ? selectedPersona.value.preferences
      : [
          { key: "pace", value: form.pace },
          { key: "tone", value: form.tone },
        ],
    boundaries: useSavedPersona ? selectedPersona.value.boundaries : splitList(form.boundaries),
    privateNotes: useSavedPersona ? selectedPersona.value.privateNotes : form.privateNotes,
  });
  await router.push(`/chat/${chatId}`);
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
</script>

<template>
  <section v-if="storyline" class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">开始</p>
        <h2>{{ storyline.title }}</h2>
      </div>
    </div>
    <div class="page-grid">
      <form class="panel field-grid" @submit.prevent="start">
        <div class="mode-tabs" role="tablist" aria-label="玩家档案来源">
          <button type="button" :class="{ active: personaMode === 'new' }" @click="personaMode = 'new'">新玩家档案</button>
          <button type="button" :class="{ active: personaMode === 'saved' }" :disabled="!personas.length" @click="personaMode = 'saved'">已保存玩家档案</button>
        </div>
        <template v-if="personaMode === 'new'">
          <label class="field-box">
            <span>玩家档案名称</span>
            <input v-model="form.name" class="input" required />
          </label>
          <label class="field-box">
            <span>代词</span>
            <input v-model="form.pronouns" class="input" placeholder="可选" />
          </label>
          <label class="field-box">
            <span>玩家档案描述</span>
            <textarea v-model="form.description" class="textarea" :placeholder="storyline.playerRole" />
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>节奏偏好</span>
              <select v-model="form.pace" class="select">
                <option value="slow">慢热</option>
                <option value="balanced">平衡</option>
                <option value="fast">快速推进</option>
              </select>
            </label>
            <label class="field-box" style="flex: 1">
              <span>氛围偏好</span>
              <select v-model="form.tone" class="select">
                <option value="immersive">沉浸</option>
                <option value="cozy">温暖</option>
                <option value="tense">紧张</option>
                <option value="mystery">悬疑</option>
              </select>
            </label>
          </div>
          <label class="field-box">
            <span>边界</span>
            <textarea v-model="form.boundaries" class="textarea" />
          </label>
          <label class="field-box">
            <span>私密备注</span>
            <textarea v-model="form.privateNotes" class="textarea" placeholder="只保存在本地玩家档案，不参与公开发布。" />
          </label>
        </template>
        <template v-else>
          <label class="field-box">
            <span>已保存玩家档案</span>
            <select v-model="selectedPersonaId" class="select">
              <option v-for="persona in personas" :key="persona.id" :value="persona.id">{{ persona.name }}</option>
            </select>
          </label>
          <div v-if="selectedPersona" class="field-box">
            <strong>{{ selectedPersona.name }}</strong>
            <span class="muted">{{ selectedPersona.description }}</span>
            <div class="tags">
              <span v-for="item in selectedPersona.preferences" :key="`${item.key}:${item.value}`" class="tag">{{ item.key }}: {{ item.value }}</span>
            </div>
          </div>
        </template>
        <label class="field-box">
          <span>场景</span>
          <select v-model="form.scenarioId" class="select">
            <option value="">默认场景</option>
            <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">{{ scenario.title }}</option>
          </select>
        </label>
        <button class="primary-button" type="submit">开始聊天</button>
      </form>
      <aside class="panel">
        <h3>安全与成本</h3>
        <p class="muted">默认使用 {{ labelFor(store.envelope.settings.provider.type) }} 提供方。成人锁定内容保持锁定。</p>
        <p class="muted">启动会保存玩家档案选择、聊天和开场消息；公开发布不会包含玩家档案私密信息。</p>
        <div class="field-box" style="margin-top: 12px">
          <strong>提供方</strong>
          <span class="muted">{{ store.envelope.settings.provider.model }} / 最多 {{ store.envelope.settings.provider.maxTokens }} tokens</span>
        </div>
        <div class="field-box" style="margin-top: 12px">
          <strong>已保存玩家档案</strong>
          <span class="muted">{{ personas.length }} 个可复用本地玩家档案</span>
        </div>
      </aside>
    </div>
  </section>
</template>

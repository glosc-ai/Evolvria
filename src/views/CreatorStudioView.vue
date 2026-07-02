<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CheckCircle2, Dices, Download, FileAudio, FileImage, PenTool, Play, PlusCircle, ShieldCheck, Upload, UserPlus } from "lucide-vue-next";
import { labelFor, mediaKindLabel, mediaPurposeLabel } from "@/lib/display";
import { useAppStore } from "@/stores/app";
import { buildNarrativePromptBundle, redactPromptPreviewContent } from "@/services/ai/context";
import type { ContentRating, DungeonMindConfig, MediaAsset } from "@/types/domain";

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const selectedStoryId = ref(resolveStoryId(route.query.storyId) ?? store.storylines[0]?.id ?? "");
const feedback = ref("");
const editHydrating = ref(false);
const draftDirty = ref(false);
const lastAutosaveAt = ref("");
let autosaveTimer: number | undefined;
const createForm = reactive({
  title: "",
  tagline: "",
  summary: "",
  characterName: "",
  opening: "",
});

const addScenarioForm = reactive({
  title: "",
  summary: "",
  location: "",
  opening: "",
});

const addCharacterForm = reactive({
  name: "",
  subtitle: "",
  role: "",
  relationshipSeed: "",
  summary: "",
  profile: "",
  tone: "",
  goals: "",
});

const nativeImportForm = reactive({
  path: "",
  purpose: "cover" as MediaAsset["purpose"],
  voiceCharacterId: "",
});

interface MediaDraft {
  altText: string;
  sourceKind: MediaAsset["source"]["kind"];
  sourceLabel: string;
  sourceUrl: string;
  licenseKind: MediaAsset["license"]["kind"];
  licenseNote: string;
}

const mediaDrafts = reactive<Record<string, MediaDraft>>({});

interface FateConfigDraft {
  enabled: boolean;
  dice: DungeonMindConfig["dice"];
  visibility: DungeonMindConfig["visibility"];
  attributeName: string;
  attributeDescription: string;
  attributeDefaultValue: number;
  skillName: string;
  skillDescription: string;
  difficultyEasy: number;
  difficultyStandard: number;
  difficultyHard: number;
  consequenceLabel: string;
  consequenceDescription: string;
}

const editForm = reactive({
  title: "",
  tagline: "",
  summary: "",
  premise: "",
  playerRole: "",
  worldRules: "",
  tags: "",
  rating: "SFW" as ContentRating,
  characterName: "",
  characterSummary: "",
  characterProfile: "",
  characterTone: "",
  characterGoals: "",
  scenarioTitle: "",
  scenarioSummary: "",
  scenarioOpening: "",
  scenarioLocation: "",
  version: "",
  changelog: "",
});

const fateForm = reactive<FateConfigDraft>({
  enabled: false,
  dice: "d20",
  visibility: "summary",
  attributeName: "意志",
  attributeDescription: "承受压力、保持专注并处理风险的综合能力。",
  attributeDefaultValue: 1,
  skillName: "读势",
  skillDescription: "行动前观察细节并判断局势。",
  difficultyEasy: 8,
  difficultyStandard: 12,
  difficultyHard: 16,
  consequenceLabel: "压力时钟",
  consequenceDescription: "失败时推进一个本地危险或代价。",
});

const selectedStory = computed(() => store.getStoryline(selectedStoryId.value, true));
const selectedStoryDeleted = computed(() => Boolean(selectedStory.value?.deletedAt));
const selectedCharacters = computed(() => selectedStory.value ? store.storylineCharacters(selectedStory.value) : []);
const selectedScenarios = computed(() => selectedStory.value ? store.storylineScenarios(selectedStory.value) : []);
const selectedMedia = computed(() => selectedStory.value ? store.storylineMedia(selectedStory.value) : []);
const selectedDungeonMindConfig = computed(() =>
  selectedStory.value?.dungeonMindConfigId ? store.envelope.entities.dungeonMindConfigs[selectedStory.value.dungeonMindConfigId] : undefined,
);
const validationIssues = computed(() => selectedStory.value ? store.validateStoryline(selectedStory.value.id) : []);
const canReady = computed(() => validationIssues.value.every((issue) => issue.severity !== "error"));
const promptPreviewBundle = computed(() => {
  const story = selectedStory.value;
  const scenario = selectedScenarios.value[0];
  const persona = store.personas[0];
  if (!story || story.deletedAt || !scenario || !persona) return undefined;
  return buildNarrativePromptBundle({
    storyline: story,
    scenario,
    persona,
    characters: selectedCharacters.value,
    messages: [],
    provider: store.envelope.settings.provider,
    mode: "act",
    userInput: "预览：玩家做出下一步行动。",
    adultContentUnlocked: store.envelope.settings.adultContentUnlocked,
  });
});
const promptPreviewContractVersion = computed(() => promptPreviewBundle.value?.contractVersion);
const promptPreviewLayers = computed(() => (promptPreviewBundle.value?.layers ?? []).map((layer) => ({
  ...layer,
  content: redactPromptPreviewContent(layer.content),
})));

watch(() => route.query, (query) => {
  const storyId = resolveStoryId(query.storyId);
  if (storyId) selectedStoryId.value = storyId;
  if (query.duplicated === "1") feedback.value = "已复制为本地草稿。";
}, { immediate: true });

watch(selectedStory, (story) => {
  if (!story) return;
  editHydrating.value = true;
  const primaryCharacter = selectedCharacters.value[0];
  const primaryScenario = selectedScenarios.value[0];
  editForm.title = story.title;
  editForm.tagline = story.tagline;
  editForm.summary = story.summary;
  editForm.premise = story.premise;
  editForm.playerRole = story.playerRole;
  editForm.worldRules = story.worldRules.join("\n");
  editForm.tags = story.tags.join("，");
  editForm.rating = story.rating;
  editForm.characterName = primaryCharacter?.name ?? "";
  editForm.characterSummary = primaryCharacter?.summary ?? "";
  editForm.characterProfile = primaryCharacter?.profile ?? "";
  editForm.characterTone = primaryCharacter?.voice.tone ?? "";
  editForm.characterGoals = primaryCharacter?.goals.join("，") ?? "";
  editForm.scenarioTitle = primaryScenario?.title ?? "";
  editForm.scenarioSummary = primaryScenario?.summary ?? "";
  editForm.scenarioOpening = primaryScenario?.opening ?? "";
  editForm.scenarioLocation = primaryScenario?.location ?? "";
  editForm.version = story.version.version;
  editForm.changelog = story.version.changelog;
  window.setTimeout(() => {
    draftDirty.value = false;
    editHydrating.value = false;
  }, 0);
}, { immediate: true });

watch(editForm, () => {
  if (!editHydrating.value && selectedStory.value) draftDirty.value = true;
}, { deep: true });

onMounted(() => {
  autosaveTimer = window.setInterval(() => {
    void autosaveEdits();
  }, 10_000);
});

onBeforeUnmount(() => {
  if (autosaveTimer) window.clearInterval(autosaveTimer);
});

watch(selectedMedia, (assets) => {
  const activeIds = new Set(assets.map((asset) => asset.id));
  for (const asset of assets) {
    if (mediaDrafts[asset.id]) continue;
    mediaDrafts[asset.id] = createMediaDraft(asset);
  }
  for (const id of Object.keys(mediaDrafts)) {
    if (!activeIds.has(id)) delete mediaDrafts[id];
  }
}, { immediate: true });

watch(selectedDungeonMindConfig, (config) => {
  hydrateFateForm(config);
}, { immediate: true });

function resolveStoryId(value: unknown): string | undefined {
  const storyId = Array.isArray(value) ? value[0] : value;
  return typeof storyId === "string" && store.getStoryline(storyId, true) ? storyId : undefined;
}

async function createDraft() {
  const id = await store.createStorylineDraft(createForm);
  selectedStoryId.value = id;
  feedback.value = "草稿已创建。";
}

async function exportSelectedPackage() {
  if (!selectedStory.value) return;
  try {
    const fileName = await store.exportStorylinePackage(selectedStory.value.id);
    feedback.value = `故事线内容包已导出：${fileName}。`;
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  }
}

async function importStorylinePackage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const importedId = await store.importStorylinePackageFile(file);
    selectedStoryId.value = importedId;
    feedback.value = "故事线内容包已作为本地草稿导入。";
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

async function saveEdits() {
  await persistEdits("草稿已保存。");
}

async function persistEdits(successMessage: string) {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再编辑。";
    return;
  }
  await store.updateStorylineDraft({ id: selectedStory.value.id, ...editForm });
  await store.updatePrimaryCharacter({
    storylineId: selectedStory.value.id,
    name: editForm.characterName,
    summary: editForm.characterSummary,
    profile: editForm.characterProfile,
    tone: editForm.characterTone,
    goals: editForm.characterGoals,
  });
  await store.updatePrimaryScenario({
    storylineId: selectedStory.value.id,
    title: editForm.scenarioTitle,
    summary: editForm.scenarioSummary,
    opening: editForm.scenarioOpening,
    location: editForm.scenarioLocation,
  });
  draftDirty.value = false;
  feedback.value = successMessage;
}

async function autosaveEdits() {
  if (!selectedStory.value || selectedStoryDeleted.value || !draftDirty.value || store.saving) return;
  await persistEdits("草稿已自动保存。");
  lastAutosaveAt.value = new Date().toLocaleTimeString();
}

async function addScenario() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再添加场景。";
    return;
  }
  await store.addScenarioToStoryline({
    storylineId: selectedStory.value.id,
    title: addScenarioForm.title,
    summary: addScenarioForm.summary,
    location: addScenarioForm.location,
    opening: addScenarioForm.opening,
  });
  addScenarioForm.title = "";
  addScenarioForm.summary = "";
  addScenarioForm.location = "";
  addScenarioForm.opening = "";
  feedback.value = "场景已添加。";
}

async function addCharacter() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再添加角色。";
    return;
  }
  await store.addCharacterToStoryline({
    storylineId: selectedStory.value.id,
    name: addCharacterForm.name,
    subtitle: addCharacterForm.subtitle,
    role: addCharacterForm.role,
    relationshipSeed: addCharacterForm.relationshipSeed,
    summary: addCharacterForm.summary,
    profile: addCharacterForm.profile,
    tone: addCharacterForm.tone,
    goals: addCharacterForm.goals,
  });
  addCharacterForm.name = "";
  addCharacterForm.subtitle = "";
  addCharacterForm.role = "";
  addCharacterForm.relationshipSeed = "";
  addCharacterForm.summary = "";
  addCharacterForm.profile = "";
  addCharacterForm.tone = "";
  addCharacterForm.goals = "";
  feedback.value = "角色已添加。";
}

async function markReady() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再标记本地就绪。";
    return;
  }
  const issues = await store.markStorylineLocalReady(selectedStory.value.id);
  feedback.value = issues.length ? `仍被 ${issues.length} 个问题阻止。` : "已标记为本地就绪。";
}

async function runPreview(scenarioId?: string) {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再预览。";
    return;
  }
  const chatId = await store.startStory(selectedStory.value.id, {
    name: "预览玩家档案",
    description: selectedStory.value.playerRole,
    scenarioId,
  });
  await router.push(`/chat/${chatId}`);
}

async function trashSelectedStory() {
  if (!selectedStory.value || selectedStoryDeleted.value) return;
  await store.trashStorylinePackage(selectedStory.value.id);
  feedback.value = "内容包已移入废纸篓。它会从内容库隐藏，并可在此恢复。";
}

async function restoreSelectedStory() {
  if (!selectedStory.value || !selectedStoryDeleted.value) return;
  await store.restoreStorylinePackage(selectedStory.value.id);
  feedback.value = "内容包已恢复。";
}

async function onMediaSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再导入媒体。";
    return;
  }
  await store.importMediaForStoryline(selectedStory.value.id, file, "cover");
  input.value = "";
  feedback.value = "媒体已导入。请在标记本地就绪前确认授权。";
}

async function importNativeMedia() {
  if (!selectedStory.value || !nativeImportForm.path.trim()) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再导入媒体。";
    return;
  }
  const assetId = await store.importNativeMediaForStoryline(selectedStory.value.id, nativeImportForm.path, nativeImportForm.purpose);
  if (!assetId) {
    feedback.value = "本地媒体导入需要 Tauri 桌面运行时。";
    return;
  }
  nativeImportForm.path = "";
  feedback.value = "本地媒体已导入。请在标记本地就绪前确认授权。";
}

async function pickNativeMedia() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再导入媒体。";
    return;
  }
  const assetId = await store.pickNativeMediaForStoryline(selectedStory.value.id, nativeImportForm.purpose);
  feedback.value = assetId
    ? "本地媒体已选择并导入。请在标记本地就绪前确认授权。"
    : "媒体文件选择器需要 Tauri 桌面运行时或已选择的文件。";
}

async function importNativeVoiceReference() {
  if (!selectedStory.value || !nativeImportForm.path.trim()) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再导入语音。";
    return;
  }
  const characterId = nativeImportForm.voiceCharacterId || selectedCharacters.value[0]?.id;
  if (!characterId) return;
  const assetId = await store.importNativeVoiceReferenceForCharacter(selectedStory.value.id, characterId, nativeImportForm.path);
  if (!assetId) {
    feedback.value = "本地语音导入需要 Tauri 桌面运行时。";
    return;
  }
  nativeImportForm.path = "";
  feedback.value = "本地语音参考已导入。请在标记本地就绪前确认授权。";
}

async function pickNativeVoiceReference() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再导入语音。";
    return;
  }
  const characterId = nativeImportForm.voiceCharacterId || selectedCharacters.value[0]?.id;
  if (!characterId) return;
  const assetId = await store.pickNativeVoiceReferenceForCharacter(selectedStory.value.id, characterId);
  feedback.value = assetId
    ? "本地语音参考已选择并导入。请在标记本地就绪前确认授权。"
    : "语音文件选择器需要 Tauri 桌面运行时或已选择的文件。";
}

async function onVoiceReferenceSelected(characterId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再导入语音。";
    return;
  }
  await store.importVoiceReferenceForCharacter(selectedStory.value.id, characterId, file);
  input.value = "";
  feedback.value = "语音参考已导入。请在标记本地就绪前确认授权。";
}

async function confirmVoiceReference(assetId: string) {
  await store.confirmMediaLicense(assetId, "已确认该语音参考为本地创作者内容包的原创或授权素材。");
  feedback.value = "语音参考授权已确认。";
}

function createMediaDraft(asset: MediaAsset): MediaDraft {
  return {
    altText: asset.altText,
    sourceKind: asset.source.kind,
    sourceLabel: asset.source.label,
    sourceUrl: asset.source.url ?? "",
    licenseKind: asset.license.kind,
    licenseNote: asset.license.note,
  };
}

function mediaDraft(asset: MediaAsset): MediaDraft {
  mediaDrafts[asset.id] ??= createMediaDraft(asset);
  return mediaDrafts[asset.id];
}

async function saveMediaMetadata(asset: MediaAsset) {
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再编辑媒体。";
    return;
  }
  const draft = mediaDraft(asset);
  await store.updateMediaAssetMetadata(asset.id, draft);
  feedback.value = "媒体元数据已保存。";
}

async function generateThumbnail(asset: MediaAsset) {
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再生成缩略图。";
    return;
  }
  const variant = await store.generateMediaThumbnail(asset.id, 320);
  feedback.value = variant
    ? `缩略图已生成：${variant.width ?? 0}x${variant.height ?? 0}。`
    : "缩略图生成需要在 Tauri 桌面运行时导入的图片素材。";
}

function hydrateFateForm(config?: DungeonMindConfig) {
  const attribute = config?.attributes[0];
  const skill = config?.skills[0];
  const consequence = config?.consequenceRules[0];
  fateForm.enabled = config?.enabled ?? false;
  fateForm.dice = config?.dice ?? "d20";
  fateForm.visibility = config?.visibility ?? "summary";
  fateForm.attributeName = attribute?.name ?? "意志";
  fateForm.attributeDescription = attribute?.description ?? "承受压力、保持专注并处理风险的综合能力。";
  fateForm.attributeDefaultValue = attribute?.defaultValue ?? 1;
  fateForm.skillName = skill?.name ?? "读势";
  fateForm.skillDescription = skill?.description ?? "行动前观察细节并判断局势。";
  fateForm.difficultyEasy = config?.difficultyTable[0]?.target ?? 8;
  fateForm.difficultyStandard = config?.difficultyTable[1]?.target ?? 12;
  fateForm.difficultyHard = config?.difficultyTable[2]?.target ?? 16;
  fateForm.consequenceLabel = consequence?.label ?? "压力时钟";
  fateForm.consequenceDescription = consequence?.description ?? "失败时推进一个本地危险或代价。";
}

async function saveFateConfig() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "请先恢复内容包，再编辑 Fate 裁定规则。";
    return;
  }
  await store.updateDungeonMindConfig({
    storylineId: selectedStory.value.id,
    ...fateForm,
    attributeDefaultValue: Number(fateForm.attributeDefaultValue),
    difficultyEasy: Number(fateForm.difficultyEasy),
    difficultyStandard: Number(fateForm.difficultyStandard),
    difficultyHard: Number(fateForm.difficultyHard),
  });
  feedback.value = fateForm.enabled ? "Fate 裁定规则已保存。" : "Fate 裁定已关闭。";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">创作工作台</p>
        <h2>草稿、校验、预览</h2>
      </div>
      <button class="secondary-button" :disabled="!selectedStory || selectedStoryDeleted" @click="runPreview()">
        <Play :size="16" />
        模拟预览
      </button>
    </div>

    <div class="page-grid">
      <div class="field-grid">
        <form class="panel field-grid" @submit.prevent="createDraft">
          <h3><PenTool :size="17" /> 新建故事线</h3>
          <label class="field-box">
            <span>故事线标题</span>
            <input v-model="createForm.title" class="input" required placeholder="例如：苍白学院" />
          </label>
          <label class="field-box">
            <span>一句话钩子</span>
            <input v-model="createForm.tagline" class="input" placeholder="一句能让玩家开始的钩子" />
          </label>
          <label class="field-box">
            <span>摘要</span>
            <textarea v-model="createForm.summary" class="textarea" placeholder="世界、冲突、玩家身份" />
          </label>
          <label class="field-box">
            <span>主角色</span>
            <input v-model="createForm.characterName" class="input" required placeholder="原创角色名" />
          </label>
          <label class="field-box">
            <span>开场场景</span>
            <textarea v-model="createForm.opening" class="textarea" placeholder="第一幕开场文本" />
          </label>
          <button class="primary-button" type="submit">保存新草稿</button>
        </form>

        <form v-if="selectedStory" class="panel field-grid" @submit.prevent="saveEdits">
          <h3>编辑内容包</h3>
          <label class="field-box">
            <span>选择内容包</span>
            <select v-model="selectedStoryId" class="select">
              <optgroup label="可用内容包">
                <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }}</option>
              </optgroup>
              <optgroup v-if="store.trashedStorylines.length" label="废纸篓">
                <option v-for="story in store.trashedStorylines" :key="story.id" :value="story.id">{{ story.title }}（已移入废纸篓）</option>
              </optgroup>
            </select>
          </label>
          <div v-if="selectedStoryDeleted" class="field-box">
            <strong>位于废纸篓</strong>
            <span class="muted">恢复之前，此内容包会从内容库、搜索、启动流程和同步就绪索引中隐藏。</span>
          </div>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>标题</span>
              <input v-model="editForm.title" class="input" />
            </label>
            <label class="field-box" style="width: 170px">
              <span>分级</span>
              <select v-model="editForm.rating" class="select">
                <option value="SFW">SFW</option>
                <option value="M17">M17</option>
                <option value="AdultLocked">成人锁定</option>
              </select>
            </label>
          </div>
          <label class="field-box">
            <span>一句话钩子</span>
            <input v-model="editForm.tagline" class="input" />
          </label>
          <label class="field-box">
            <span>摘要</span>
            <textarea v-model="editForm.summary" class="textarea" />
          </label>
          <label class="field-box">
            <span>前提</span>
            <textarea v-model="editForm.premise" class="textarea" />
          </label>
          <label class="field-box">
            <span>玩家身份</span>
            <input v-model="editForm.playerRole" class="input" />
          </label>
          <label class="field-box">
            <span>世界规则</span>
            <textarea v-model="editForm.worldRules" class="textarea" />
          </label>
          <label class="field-box">
            <span>标签</span>
            <input v-model="editForm.tags" class="input" />
          </label>
          <h3>版本与变更记录</h3>
          <div class="row">
            <label class="field-box" style="width: 170px">
              <span>版本</span>
              <input v-model="editForm.version" class="input" placeholder="0.1.0" />
            </label>
            <label class="field-box" style="flex: 1">
              <span>变更记录</span>
              <input v-model="editForm.changelog" class="input" placeholder="这次草稿改了什么" />
            </label>
          </div>
          <h3>主角色</h3>
          <label class="field-box">
            <span>姓名</span>
            <input v-model="editForm.characterName" class="input" />
          </label>
          <label class="field-box">
            <span>摘要</span>
            <textarea v-model="editForm.characterSummary" class="textarea" />
          </label>
          <label class="field-box">
            <span>档案</span>
            <textarea v-model="editForm.characterProfile" class="textarea" />
          </label>
          <label class="field-box">
            <span>说话语气</span>
            <input v-model="editForm.characterTone" class="input" />
          </label>
          <label class="field-box">
            <span>目标</span>
            <input v-model="editForm.characterGoals" class="input" />
          </label>
          <h3>主场景</h3>
          <label class="field-box">
            <span>标题</span>
            <input v-model="editForm.scenarioTitle" class="input" />
          </label>
          <label class="field-box">
            <span>摘要</span>
            <input v-model="editForm.scenarioSummary" class="input" />
          </label>
          <label class="field-box">
            <span>地点</span>
            <input v-model="editForm.scenarioLocation" class="input" />
          </label>
          <label class="field-box">
            <span>开场</span>
            <textarea v-model="editForm.scenarioOpening" class="textarea" />
          </label>
          <div class="row">
            <button class="primary-button" type="submit" :disabled="selectedStoryDeleted">保存编辑</button>
            <button v-if="!selectedStoryDeleted" class="ghost-button" type="button" @click="trashSelectedStory">
              移入废纸篓
            </button>
            <button v-else class="ghost-button" type="button" @click="restoreSelectedStory">
              恢复内容包
            </button>
          </div>
        </form>
      </div>

      <aside class="panel field-grid">
        <h3>校验</h3>
        <p v-if="feedback" class="status-pill provider">{{ feedback }}</p>
        <p v-if="draftDirty || lastAutosaveAt" class="muted">
          {{ draftDirty ? "本地编辑尚未保存" : `上次自动保存 ${lastAutosaveAt}` }}
        </p>
        <div v-if="selectedStory" class="field-box">
          <strong>{{ selectedStory.title }}</strong>
          <span class="muted">{{ selectedStory.version.version }} / {{ labelFor(selectedStory.version.status) }} / {{ labelFor(selectedStory.moderation.state) }} / {{ selectedStory.moderation.rating }}{{ selectedStory.deletedAt ? ` / 已移入废纸篓 ${selectedStory.deletedAt}` : "" }}</span>
          <div class="cluster">
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="exportSelectedPackage">
              <Download :size="16" />
              导出故事内容包
            </button>
            <label class="ghost-button" style="cursor: pointer">
              <Upload :size="16" />
              导入故事内容包
              <input type="file" accept="application/json,.json,.evolvria.json" hidden @change="importStorylinePackage" />
            </label>
          </div>
          <span v-if="store.lastStorylinePackageExportPath" class="muted">
            最近故事内容包：{{ store.lastStorylinePackageExportPath }}
          </span>
          <span v-if="store.lastImportMessage" class="muted">{{ store.lastImportMessage }}</span>
        </div>
        <div class="field-grid">
          <div v-for="issue in validationIssues" :key="`${issue.field}-${issue.message}`" class="field-box">
            <strong>{{ labelFor(issue.severity) }}：{{ issue.field }}</strong>
            <span class="muted">{{ issue.message }}</span>
          </div>
          <div v-if="!validationIssues.length" class="field-box">
            <strong>就绪</strong>
            <span class="muted">没有校验问题。</span>
          </div>
        </div>

        <div class="field-grid" aria-label="提示词预览">
          <h3>提示词预览</h3>
          <span v-if="promptPreviewContractVersion" class="muted">契约 {{ promptPreviewContractVersion }}</span>
          <div v-if="promptPreviewLayers.length" class="prompt-preview">
            <details v-for="layer in promptPreviewLayers" :key="layer.name" class="field-box">
              <summary>
                {{ layer.title }}
                <span class="muted">优先级 {{ layer.priority }} · {{ layer.locked ? "锁定" : "记忆" }}</span>
              </summary>
              <pre>{{ layer.content }}</pre>
            </details>
          </div>
          <div v-else class="field-box">
            <strong>暂不可预览</strong>
            <span class="muted">请选择至少包含一个场景和玩家档案的可用内容包。</span>
          </div>
        </div>

        <label class="secondary-button" :style="{ cursor: selectedStoryDeleted ? 'not-allowed' : 'pointer' }">
          <FileImage :size="16" />
          导入媒体
          <input type="file" accept="image/*,audio/*,video/*" hidden :disabled="selectedStoryDeleted" @change="onMediaSelected" />
        </label>

        <form v-if="selectedStory" class="field-grid native-import-box" @submit.prevent="importNativeMedia">
          <h3>本地素材导入</h3>
          <label class="field-box">
            <span>本地素材路径</span>
            <input v-model="nativeImportForm.path" class="input" placeholder="/Users/me/Pictures/cover.png" />
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>用途</span>
              <select v-model="nativeImportForm.purpose" class="select">
                <option value="cover">封面</option>
                <option value="avatar">头像</option>
                <option value="background">背景</option>
                <option value="sprite">立绘</option>
                <option value="reference">参考</option>
              </select>
            </label>
            <label class="field-box" style="flex: 1">
              <span>语音绑定角色</span>
              <select v-model="nativeImportForm.voiceCharacterId" class="select">
                <option value="">主角色</option>
                <option v-for="character in selectedCharacters" :key="character.id" :value="character.id">{{ character.name }}</option>
              </select>
            </label>
          </div>
          <div class="row">
            <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted || !nativeImportForm.path.trim()">
              导入本地素材
            </button>
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="pickNativeMedia">
              选择本地素材
            </button>
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted || !nativeImportForm.path.trim()" @click="importNativeVoiceReference">
              <FileAudio :size="16" />
              导入本地语音
            </button>
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="pickNativeVoiceReference">
              <FileAudio :size="16" />
              选择本地语音
            </button>
          </div>
          <p class="muted small">桌面端导入会把文件复制到工作区 assets 文件夹；浏览器预览仍使用不可移植的文件引用。</p>
        </form>

        <div class="field-grid">
          <div v-for="asset in selectedMedia" :key="asset.id" class="field-box">
            <strong>{{ mediaPurposeLabel(asset.purpose) }} / {{ mediaKindLabel(asset.kind) }}</strong>
            <span class="muted">{{ asset.mimeType }} · {{ asset.sizeBytes }} 字节</span>
            <label class="field-box">
              <span>替代文本</span>
              <input v-model="mediaDraft(asset).altText" class="input" placeholder="描述画面内容和用途" />
            </label>
            <div class="row">
              <label class="field-box" style="flex: 1">
                <span>来源</span>
                <select v-model="mediaDraft(asset).sourceKind" class="select">
                  <option value="original">原创</option>
                  <option value="generated">生成</option>
                  <option value="imported">导入</option>
                  <option value="placeholder">占位</option>
                </select>
              </label>
              <label class="field-box" style="flex: 1">
                <span>授权</span>
                <select v-model="mediaDraft(asset).licenseKind" class="select">
                  <option value="owned">自有</option>
                  <option value="cc0">CC0</option>
                  <option value="licensed">已授权</option>
                  <option value="unknown">未知</option>
                </select>
              </label>
            </div>
            <label class="field-box">
              <span>来源标签</span>
              <input v-model="mediaDraft(asset).sourceLabel" class="input" placeholder="原创作者、生成工具、素材库或导入来源" />
            </label>
            <label class="field-box">
              <span>来源 URL</span>
              <input v-model="mediaDraft(asset).sourceUrl" class="input" placeholder="可选，用于素材来源追溯" />
            </label>
            <label class="field-box">
              <span>授权说明</span>
              <textarea v-model="mediaDraft(asset).licenseNote" class="textarea" placeholder="授权范围、生成提示摘要或归属说明" />
            </label>
            <div class="row">
              <button class="secondary-button" type="button" :disabled="selectedStoryDeleted" @click="saveMediaMetadata(asset)">
                保存元数据
              </button>
              <button v-if="asset.kind === 'image'" class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="generateThumbnail(asset)">
                <FileImage :size="16" />
                生成缩略图
              </button>
              <button v-if="asset.license.kind === 'unknown'" class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="store.confirmMediaLicense(asset.id)">
                <ShieldCheck :size="16" />
                快速确认
              </button>
            </div>
            <span v-if="asset.variants.length" class="muted">已生成 {{ asset.variants.length }} 个变体</span>
          </div>
        </div>

        <form v-if="selectedStory" class="field-grid" @submit.prevent="saveFateConfig">
          <h3><Dices :size="17" /> Fate 裁定引擎</h3>
          <label class="field-box">
            <span>启用</span>
            <select v-model="fateForm.enabled" class="select">
              <option :value="true">启用</option>
              <option :value="false">关闭</option>
            </select>
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>骰子</span>
              <select v-model="fateForm.dice" class="select">
                <option value="d20">d20</option>
                <option value="2d6">2d6</option>
                <option value="percentile">百分骰</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <label class="field-box" style="flex: 1">
              <span>可见性</span>
              <select v-model="fateForm.visibility" class="select">
                <option value="hidden">隐藏</option>
                <option value="summary">摘要</option>
                <option value="full">完整</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>简单目标</span>
              <input v-model.number="fateForm.difficultyEasy" class="input" type="number" min="2" max="100" />
            </label>
            <label class="field-box" style="flex: 1">
              <span>标准目标</span>
              <input v-model.number="fateForm.difficultyStandard" class="input" type="number" min="2" max="100" />
            </label>
            <label class="field-box" style="flex: 1">
              <span>困难目标</span>
              <input v-model.number="fateForm.difficultyHard" class="input" type="number" min="2" max="100" />
            </label>
          </div>
          <label class="field-box">
            <span>属性</span>
            <input v-model="fateForm.attributeName" class="input" placeholder="例如：意志" />
          </label>
          <label class="field-box">
            <span>属性描述</span>
            <textarea v-model="fateForm.attributeDescription" class="textarea" placeholder="该属性如何影响裁定" />
          </label>
          <label class="field-box">
            <span>默认修正值</span>
            <input v-model.number="fateForm.attributeDefaultValue" class="input" type="number" min="-5" max="20" />
          </label>
          <label class="field-box">
            <span>技能</span>
            <input v-model="fateForm.skillName" class="input" placeholder="例如：读势" />
          </label>
          <label class="field-box">
            <span>技能描述</span>
            <textarea v-model="fateForm.skillDescription" class="textarea" placeholder="技能触发条件或叙事用途" />
          </label>
          <label class="field-box">
            <span>后果标签</span>
            <input v-model="fateForm.consequenceLabel" class="input" placeholder="例如：危机时钟" />
          </label>
          <label class="field-box">
            <span>后果描述</span>
            <textarea v-model="fateForm.consequenceDescription" class="textarea" placeholder="失败或部分成功时怎样改变事实" />
          </label>
          <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted">
            <Dices :size="16" />
            保存 Fate 规则
          </button>
        </form>

        <form v-if="selectedStory" class="field-grid" @submit.prevent="addCharacter">
          <h3><UserPlus :size="17" /> 角色编辑器</h3>
          <div class="field-grid">
            <div v-for="character in selectedCharacters" :key="character.id" class="field-box">
              <strong>{{ character.name }}</strong>
              <span class="muted">{{ character.subtitle || "无副标题" }} · {{ character.summary }}</span>
              <template v-if="character.voice.referenceAssetId">
                <span class="muted">语音参考：{{ store.envelope.entities.mediaAssets[character.voice.referenceAssetId]?.altText }}</span>
                <span class="muted">
                  授权：{{ labelFor(store.envelope.entities.mediaAssets[character.voice.referenceAssetId]?.license.kind) }}
                  · {{ store.envelope.entities.mediaAssets[character.voice.referenceAssetId]?.source.label }}
                </span>
                <button
                  v-if="store.envelope.entities.mediaAssets[character.voice.referenceAssetId]?.license.kind === 'unknown'"
                  class="ghost-button"
                  type="button"
                  :disabled="selectedStoryDeleted"
                  @click="confirmVoiceReference(character.voice.referenceAssetId)"
                >
                  <ShieldCheck :size="16" />
                  确认语音授权
                </button>
              </template>
              <label class="ghost-button" :style="{ cursor: selectedStoryDeleted ? 'not-allowed' : 'pointer' }">
                <FileAudio :size="16" />
                导入语音参考
                <input type="file" accept="audio/*" hidden :disabled="selectedStoryDeleted" @change="onVoiceReferenceSelected(character.id, $event)" />
              </label>
            </div>
          </div>
          <label class="field-box">
            <span>新角色姓名</span>
            <input v-model="addCharacterForm.name" class="input" required placeholder="例如：米娅" />
          </label>
          <label class="field-box">
            <span>副标题</span>
            <input v-model="addCharacterForm.subtitle" class="input" placeholder="角色身份或短称" />
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>阵容定位</span>
              <input v-model="addCharacterForm.role" class="input" required placeholder="向导、对手、见证人..." />
            </label>
            <label class="field-box" style="flex: 1">
              <span>目标</span>
              <input v-model="addCharacterForm.goals" class="input" required placeholder="守住秘密，找到失物" />
            </label>
          </div>
          <label class="field-box">
            <span>关系种子</span>
            <input v-model="addCharacterForm.relationshipSeed" class="input" required placeholder="与玩家或主角的初始关系" />
          </label>
          <label class="field-box">
            <span>摘要</span>
            <textarea v-model="addCharacterForm.summary" class="textarea" required placeholder="角色的一句话概念" />
          </label>
          <label class="field-box">
            <span>档案</span>
            <textarea v-model="addCharacterForm.profile" class="textarea" required placeholder="身份、动机、冲突、边界" />
          </label>
          <label class="field-box">
            <span>说话语气</span>
            <input v-model="addCharacterForm.tone" class="input" required placeholder="说话风格" />
          </label>
          <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted">
            <UserPlus :size="16" />
            添加角色
          </button>
        </form>

        <form v-if="selectedStory" class="field-grid" @submit.prevent="addScenario">
          <h3><PlusCircle :size="17" /> 场景编辑器</h3>
          <div class="field-grid">
            <div v-for="scenario in selectedScenarios" :key="scenario.id" class="field-box">
              <strong>{{ scenario.order }}. {{ scenario.title }}</strong>
              <span class="muted">{{ scenario.location || "无固定地点" }} · {{ scenario.summary }}</span>
              <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="runPreview(scenario.id)">
                <Play :size="16" />
                预览
              </button>
            </div>
          </div>
          <label class="field-box">
            <span>新场景标题</span>
            <input v-model="addScenarioForm.title" class="input" required placeholder="例如：钟楼第二次敲响" />
          </label>
          <label class="field-box">
            <span>摘要</span>
            <input v-model="addScenarioForm.summary" class="input" required placeholder="这个入口的冲突和目标" />
          </label>
          <label class="field-box">
            <span>地点</span>
            <input v-model="addScenarioForm.location" class="input" placeholder="可选" />
          </label>
          <label class="field-box">
            <span>开场提示</span>
            <textarea v-model="addScenarioForm.opening" class="textarea" required placeholder="玩家进入该入口时看到的第一幕" />
          </label>
          <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted">
            <PlusCircle :size="16" />
            添加场景
          </button>
        </form>

        <button class="primary-button" :disabled="!selectedStory || selectedStoryDeleted || !canReady" @click="markReady">
          <CheckCircle2 :size="16" />
          标记本地就绪
        </button>
      </aside>
    </div>
  </section>
</template>

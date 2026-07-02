<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CheckCircle2, Dices, FileAudio, FileImage, PenTool, Play, PlusCircle, ShieldCheck, UserPlus } from "lucide-vue-next";
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
  attributeName: "Resolve",
  attributeDescription: "General pressure, focus, and risk handling.",
  attributeDefaultValue: 1,
  skillName: "Read the Scene",
  skillDescription: "Notice details before acting.",
  difficultyEasy: 8,
  difficultyStandard: 12,
  difficultyHard: 16,
  consequenceLabel: "Pressure Clock",
  consequenceDescription: "On a miss, advance a local danger or cost.",
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
  if (query.duplicated === "1") feedback.value = "Duplicated as local draft.";
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
  feedback.value = "Draft created.";
}

async function saveEdits() {
  await persistEdits("Draft saved.");
}

async function persistEdits(successMessage: string) {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before editing.";
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
  await persistEdits("Autosaved draft.");
  lastAutosaveAt.value = new Date().toLocaleTimeString();
}

async function addScenario() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before adding scenarios.";
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
  feedback.value = "Scenario added.";
}

async function addCharacter() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before adding characters.";
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
  feedback.value = "Character added.";
}

async function markReady() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before marking local_ready.";
    return;
  }
  const issues = await store.markStorylineLocalReady(selectedStory.value.id);
  feedback.value = issues.length ? `Still blocked by ${issues.length} issue(s).` : "Marked local_ready.";
}

async function runPreview(scenarioId?: string) {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before previewing.";
    return;
  }
  const chatId = await store.startStory(selectedStory.value.id, {
    name: "Preview Persona",
    description: selectedStory.value.playerRole,
    scenarioId,
  });
  await router.push(`/chat/${chatId}`);
}

async function trashSelectedStory() {
  if (!selectedStory.value || selectedStoryDeleted.value) return;
  await store.trashStorylinePackage(selectedStory.value.id);
  feedback.value = "Moved package to Trash. It is hidden from Library and can be restored here.";
}

async function restoreSelectedStory() {
  if (!selectedStory.value || !selectedStoryDeleted.value) return;
  await store.restoreStorylinePackage(selectedStory.value.id);
  feedback.value = "Package restored.";
}

async function onMediaSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before importing media.";
    return;
  }
  await store.importMediaForStoryline(selectedStory.value.id, file, "cover");
  input.value = "";
  feedback.value = "Media imported. Confirm license before local_ready.";
}

async function importNativeMedia() {
  if (!selectedStory.value || !nativeImportForm.path.trim()) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before importing media.";
    return;
  }
  const assetId = await store.importNativeMediaForStoryline(selectedStory.value.id, nativeImportForm.path, nativeImportForm.purpose);
  if (!assetId) {
    feedback.value = "Native media import requires the Tauri desktop runtime.";
    return;
  }
  nativeImportForm.path = "";
  feedback.value = "Native media imported. Confirm license before local_ready.";
}

async function pickNativeMedia() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before importing media.";
    return;
  }
  const assetId = await store.pickNativeMediaForStoryline(selectedStory.value.id, nativeImportForm.purpose);
  feedback.value = assetId
    ? "Native media picked and imported. Confirm license before local_ready."
    : "Native media picker requires the Tauri desktop runtime or a selected file.";
}

async function importNativeVoiceReference() {
  if (!selectedStory.value || !nativeImportForm.path.trim()) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before importing voice.";
    return;
  }
  const characterId = nativeImportForm.voiceCharacterId || selectedCharacters.value[0]?.id;
  if (!characterId) return;
  const assetId = await store.importNativeVoiceReferenceForCharacter(selectedStory.value.id, characterId, nativeImportForm.path);
  if (!assetId) {
    feedback.value = "Native voice import requires the Tauri desktop runtime.";
    return;
  }
  nativeImportForm.path = "";
  feedback.value = "Native voice reference imported. Confirm license before local_ready.";
}

async function pickNativeVoiceReference() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before importing voice.";
    return;
  }
  const characterId = nativeImportForm.voiceCharacterId || selectedCharacters.value[0]?.id;
  if (!characterId) return;
  const assetId = await store.pickNativeVoiceReferenceForCharacter(selectedStory.value.id, characterId);
  feedback.value = assetId
    ? "Native voice reference picked and imported. Confirm license before local_ready."
    : "Native voice picker requires the Tauri desktop runtime or a selected file.";
}

async function onVoiceReferenceSelected(characterId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before importing voice.";
    return;
  }
  await store.importVoiceReferenceForCharacter(selectedStory.value.id, characterId, file);
  input.value = "";
  feedback.value = "Voice reference imported. Confirm license before local_ready.";
}

async function confirmVoiceReference(assetId: string) {
  await store.confirmMediaLicense(assetId, "Confirmed original or licensed voice reference for this local creator package.");
  feedback.value = "Voice reference license confirmed.";
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
    feedback.value = "Restore this package before editing media.";
    return;
  }
  const draft = mediaDraft(asset);
  await store.updateMediaAssetMetadata(asset.id, draft);
  feedback.value = "Media metadata saved.";
}

async function generateThumbnail(asset: MediaAsset) {
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before generating thumbnails.";
    return;
  }
  const variant = await store.generateMediaThumbnail(asset.id, 320);
  feedback.value = variant
    ? `Thumbnail generated: ${variant.width ?? 0}x${variant.height ?? 0}.`
    : "Thumbnail generation requires an image asset imported in the Tauri desktop runtime.";
}

function hydrateFateForm(config?: DungeonMindConfig) {
  const attribute = config?.attributes[0];
  const skill = config?.skills[0];
  const consequence = config?.consequenceRules[0];
  fateForm.enabled = config?.enabled ?? false;
  fateForm.dice = config?.dice ?? "d20";
  fateForm.visibility = config?.visibility ?? "summary";
  fateForm.attributeName = attribute?.name ?? "Resolve";
  fateForm.attributeDescription = attribute?.description ?? "General pressure, focus, and risk handling.";
  fateForm.attributeDefaultValue = attribute?.defaultValue ?? 1;
  fateForm.skillName = skill?.name ?? "Read the Scene";
  fateForm.skillDescription = skill?.description ?? "Notice details before acting.";
  fateForm.difficultyEasy = config?.difficultyTable[0]?.target ?? 8;
  fateForm.difficultyStandard = config?.difficultyTable[1]?.target ?? 12;
  fateForm.difficultyHard = config?.difficultyTable[2]?.target ?? 16;
  fateForm.consequenceLabel = consequence?.label ?? "Pressure Clock";
  fateForm.consequenceDescription = consequence?.description ?? "On a miss, advance a local danger or cost.";
}

async function saveFateConfig() {
  if (!selectedStory.value) return;
  if (selectedStoryDeleted.value) {
    feedback.value = "Restore this package before editing Fate rules.";
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
  feedback.value = fateForm.enabled ? "Fate Engine rules saved." : "Fate Engine disabled.";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">Creator Studio</p>
        <h2>Draft, Validate, Preview</h2>
      </div>
      <button class="secondary-button" :disabled="!selectedStory || selectedStoryDeleted" @click="runPreview()">
        <Play :size="16" />
        Mock Preview
      </button>
    </div>

    <div class="page-grid">
      <div class="field-grid">
        <form class="panel field-grid" @submit.prevent="createDraft">
          <h3><PenTool :size="17" /> New Storyline</h3>
          <label class="field-box">
            <span>Storyline title</span>
            <input v-model="createForm.title" class="input" required placeholder="例如：苍白学院" />
          </label>
          <label class="field-box">
            <span>Tagline</span>
            <input v-model="createForm.tagline" class="input" placeholder="一句能让玩家开始的钩子" />
          </label>
          <label class="field-box">
            <span>Summary</span>
            <textarea v-model="createForm.summary" class="textarea" placeholder="世界、冲突、玩家身份" />
          </label>
          <label class="field-box">
            <span>Main character</span>
            <input v-model="createForm.characterName" class="input" required placeholder="原创角色名" />
          </label>
          <label class="field-box">
            <span>Opening scene</span>
            <textarea v-model="createForm.opening" class="textarea" placeholder="第一幕开场文本" />
          </label>
          <button class="primary-button" type="submit">Save New Draft</button>
        </form>

        <form v-if="selectedStory" class="panel field-grid" @submit.prevent="saveEdits">
          <h3>Edit Package</h3>
          <label class="field-box">
            <span>Select package</span>
            <select v-model="selectedStoryId" class="select">
              <optgroup label="Active packages">
                <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }}</option>
              </optgroup>
              <optgroup v-if="store.trashedStorylines.length" label="Trash">
                <option v-for="story in store.trashedStorylines" :key="story.id" :value="story.id">{{ story.title }} (trashed)</option>
              </optgroup>
            </select>
          </label>
          <div v-if="selectedStoryDeleted" class="field-box">
            <strong>In Trash</strong>
            <span class="muted">This package is hidden from Library, search, start flow and sync-ready indexes until restored.</span>
          </div>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>Title</span>
              <input v-model="editForm.title" class="input" />
            </label>
            <label class="field-box" style="width: 170px">
              <span>Rating</span>
              <select v-model="editForm.rating" class="select">
                <option value="SFW">SFW</option>
                <option value="M17">M17</option>
                <option value="AdultLocked">AdultLocked</option>
              </select>
            </label>
          </div>
          <label class="field-box">
            <span>Tagline</span>
            <input v-model="editForm.tagline" class="input" />
          </label>
          <label class="field-box">
            <span>Summary</span>
            <textarea v-model="editForm.summary" class="textarea" />
          </label>
          <label class="field-box">
            <span>Premise</span>
            <textarea v-model="editForm.premise" class="textarea" />
          </label>
          <label class="field-box">
            <span>Player role</span>
            <input v-model="editForm.playerRole" class="input" />
          </label>
          <label class="field-box">
            <span>World rules</span>
            <textarea v-model="editForm.worldRules" class="textarea" />
          </label>
          <label class="field-box">
            <span>Tags</span>
            <input v-model="editForm.tags" class="input" />
          </label>
          <h3>Version & Changelog</h3>
          <div class="row">
            <label class="field-box" style="width: 170px">
              <span>Version</span>
              <input v-model="editForm.version" class="input" placeholder="0.1.0" />
            </label>
            <label class="field-box" style="flex: 1">
              <span>Changelog</span>
              <input v-model="editForm.changelog" class="input" placeholder="What changed in this draft" />
            </label>
          </div>
          <h3>Primary Character</h3>
          <label class="field-box">
            <span>Name</span>
            <input v-model="editForm.characterName" class="input" />
          </label>
          <label class="field-box">
            <span>Summary</span>
            <textarea v-model="editForm.characterSummary" class="textarea" />
          </label>
          <label class="field-box">
            <span>Profile</span>
            <textarea v-model="editForm.characterProfile" class="textarea" />
          </label>
          <label class="field-box">
            <span>Voice tone</span>
            <input v-model="editForm.characterTone" class="input" />
          </label>
          <label class="field-box">
            <span>Goals</span>
            <input v-model="editForm.characterGoals" class="input" />
          </label>
          <h3>Primary Scenario</h3>
          <label class="field-box">
            <span>Title</span>
            <input v-model="editForm.scenarioTitle" class="input" />
          </label>
          <label class="field-box">
            <span>Summary</span>
            <input v-model="editForm.scenarioSummary" class="input" />
          </label>
          <label class="field-box">
            <span>Location</span>
            <input v-model="editForm.scenarioLocation" class="input" />
          </label>
          <label class="field-box">
            <span>Opening</span>
            <textarea v-model="editForm.scenarioOpening" class="textarea" />
          </label>
          <div class="row">
            <button class="primary-button" type="submit" :disabled="selectedStoryDeleted">Save Edits</button>
            <button v-if="!selectedStoryDeleted" class="ghost-button" type="button" @click="trashSelectedStory">
              Move to Trash
            </button>
            <button v-else class="ghost-button" type="button" @click="restoreSelectedStory">
              Restore Package
            </button>
          </div>
        </form>
      </div>

      <aside class="panel field-grid">
        <h3>Validation</h3>
        <p v-if="feedback" class="status-pill provider">{{ feedback }}</p>
        <p v-if="draftDirty || lastAutosaveAt" class="muted">
          {{ draftDirty ? "Unsaved local edits" : `Last autosave ${lastAutosaveAt}` }}
        </p>
        <div v-if="selectedStory" class="field-box">
          <strong>{{ selectedStory.title }}</strong>
          <span class="muted">{{ selectedStory.version.version }} / {{ selectedStory.version.status }} / {{ selectedStory.moderation.state }} / {{ selectedStory.moderation.rating }}{{ selectedStory.deletedAt ? ` / trashed ${selectedStory.deletedAt}` : "" }}</span>
        </div>
        <div class="field-grid">
          <div v-for="issue in validationIssues" :key="`${issue.field}-${issue.message}`" class="field-box">
            <strong>{{ issue.severity }}: {{ issue.field }}</strong>
            <span class="muted">{{ issue.message }}</span>
          </div>
          <div v-if="!validationIssues.length" class="field-box">
            <strong>Ready</strong>
            <span class="muted">No validation issues.</span>
          </div>
        </div>

        <div class="field-grid" aria-label="Prompt Preview">
          <h3>Prompt Preview</h3>
          <span v-if="promptPreviewContractVersion" class="muted">Contract {{ promptPreviewContractVersion }}</span>
          <div v-if="promptPreviewLayers.length" class="prompt-preview">
            <details v-for="layer in promptPreviewLayers" :key="layer.name" class="field-box">
              <summary>
                {{ layer.title }}
                <span class="muted">priority {{ layer.priority }} · {{ layer.locked ? "locked" : "memory" }}</span>
              </summary>
              <pre>{{ layer.content }}</pre>
            </details>
          </div>
          <div v-else class="field-box">
            <strong>Preview unavailable</strong>
            <span class="muted">Select an active package with at least one scenario and persona.</span>
          </div>
        </div>

        <label class="secondary-button" :style="{ cursor: selectedStoryDeleted ? 'not-allowed' : 'pointer' }">
          <FileImage :size="16" />
          Import Media
          <input type="file" accept="image/*,audio/*,video/*" hidden :disabled="selectedStoryDeleted" @change="onMediaSelected" />
        </label>

        <form v-if="selectedStory" class="field-grid native-import-box" @submit.prevent="importNativeMedia">
          <h3>Native Asset Import</h3>
          <label class="field-box">
            <span>Native asset path</span>
            <input v-model="nativeImportForm.path" class="input" placeholder="/Users/me/Pictures/cover.png" />
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>Purpose</span>
              <select v-model="nativeImportForm.purpose" class="select">
                <option value="cover">cover</option>
                <option value="avatar">avatar</option>
                <option value="background">background</option>
                <option value="sprite">sprite</option>
                <option value="reference">reference</option>
              </select>
            </label>
            <label class="field-box" style="flex: 1">
              <span>Voice target</span>
              <select v-model="nativeImportForm.voiceCharacterId" class="select">
                <option value="">Primary character</option>
                <option v-for="character in selectedCharacters" :key="character.id" :value="character.id">{{ character.name }}</option>
              </select>
            </label>
          </div>
          <div class="row">
            <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted || !nativeImportForm.path.trim()">
              Import Native Asset
            </button>
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="pickNativeMedia">
              Pick Native Asset
            </button>
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted || !nativeImportForm.path.trim()" @click="importNativeVoiceReference">
              <FileAudio :size="16" />
              Import Native Voice
            </button>
            <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="pickNativeVoiceReference">
              <FileAudio :size="16" />
              Pick Native Voice
            </button>
          </div>
          <p class="muted small">Desktop imports copy files into the workspace assets folder; browser fallback still uses non-portable file references.</p>
        </form>

        <div class="field-grid">
          <div v-for="asset in selectedMedia" :key="asset.id" class="field-box">
            <strong>{{ asset.purpose }} / {{ asset.kind }}</strong>
            <span class="muted">{{ asset.mimeType }} · {{ asset.sizeBytes }} bytes</span>
            <label class="field-box">
              <span>Alt text</span>
              <input v-model="mediaDraft(asset).altText" class="input" placeholder="描述画面内容和用途" />
            </label>
            <div class="row">
              <label class="field-box" style="flex: 1">
                <span>Source</span>
                <select v-model="mediaDraft(asset).sourceKind" class="select">
                  <option value="original">original</option>
                  <option value="generated">generated</option>
                  <option value="imported">imported</option>
                  <option value="placeholder">placeholder</option>
                </select>
              </label>
              <label class="field-box" style="flex: 1">
                <span>License</span>
                <select v-model="mediaDraft(asset).licenseKind" class="select">
                  <option value="owned">owned</option>
                  <option value="cc0">cc0</option>
                  <option value="licensed">licensed</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
            </div>
            <label class="field-box">
              <span>Source label</span>
              <input v-model="mediaDraft(asset).sourceLabel" class="input" placeholder="原创作者、生成工具、素材库或导入来源" />
            </label>
            <label class="field-box">
              <span>Source URL</span>
              <input v-model="mediaDraft(asset).sourceUrl" class="input" placeholder="可选，用于素材来源追溯" />
            </label>
            <label class="field-box">
              <span>License note</span>
              <textarea v-model="mediaDraft(asset).licenseNote" class="textarea" placeholder="授权范围、生成提示摘要或归属说明" />
            </label>
            <div class="row">
              <button class="secondary-button" type="button" :disabled="selectedStoryDeleted" @click="saveMediaMetadata(asset)">
                Save Metadata
              </button>
              <button v-if="asset.kind === 'image'" class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="generateThumbnail(asset)">
                <FileImage :size="16" />
                Generate Thumbnail
              </button>
              <button v-if="asset.license.kind === 'unknown'" class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="store.confirmMediaLicense(asset.id)">
                <ShieldCheck :size="16" />
                Quick Confirm
              </button>
            </div>
            <span v-if="asset.variants.length" class="muted">{{ asset.variants.length }} variant(s) generated</span>
          </div>
        </div>

        <form v-if="selectedStory" class="field-grid" @submit.prevent="saveFateConfig">
          <h3><Dices :size="17" /> Fate Engine</h3>
          <label class="field-box">
            <span>Enabled</span>
            <select v-model="fateForm.enabled" class="select">
              <option :value="true">enabled</option>
              <option :value="false">disabled</option>
            </select>
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>Dice</span>
              <select v-model="fateForm.dice" class="select">
                <option value="d20">d20</option>
                <option value="2d6">2d6</option>
                <option value="percentile">percentile</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label class="field-box" style="flex: 1">
              <span>Visibility</span>
              <select v-model="fateForm.visibility" class="select">
                <option value="hidden">hidden</option>
                <option value="summary">summary</option>
                <option value="full">full</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>Easy target</span>
              <input v-model.number="fateForm.difficultyEasy" class="input" type="number" min="2" max="100" />
            </label>
            <label class="field-box" style="flex: 1">
              <span>Standard target</span>
              <input v-model.number="fateForm.difficultyStandard" class="input" type="number" min="2" max="100" />
            </label>
            <label class="field-box" style="flex: 1">
              <span>Hard target</span>
              <input v-model.number="fateForm.difficultyHard" class="input" type="number" min="2" max="100" />
            </label>
          </div>
          <label class="field-box">
            <span>Attribute</span>
            <input v-model="fateForm.attributeName" class="input" placeholder="例如：意志" />
          </label>
          <label class="field-box">
            <span>Attribute description</span>
            <textarea v-model="fateForm.attributeDescription" class="textarea" placeholder="该属性如何影响裁定" />
          </label>
          <label class="field-box">
            <span>Default modifier</span>
            <input v-model.number="fateForm.attributeDefaultValue" class="input" type="number" min="-5" max="20" />
          </label>
          <label class="field-box">
            <span>Skill</span>
            <input v-model="fateForm.skillName" class="input" placeholder="例如：读势" />
          </label>
          <label class="field-box">
            <span>Skill description</span>
            <textarea v-model="fateForm.skillDescription" class="textarea" placeholder="技能触发条件或叙事用途" />
          </label>
          <label class="field-box">
            <span>Consequence label</span>
            <input v-model="fateForm.consequenceLabel" class="input" placeholder="例如：危机时钟" />
          </label>
          <label class="field-box">
            <span>Consequence description</span>
            <textarea v-model="fateForm.consequenceDescription" class="textarea" placeholder="失败或部分成功时怎样改变事实" />
          </label>
          <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted">
            <Dices :size="16" />
            Save Fate Rules
          </button>
        </form>

        <form v-if="selectedStory" class="field-grid" @submit.prevent="addCharacter">
          <h3><UserPlus :size="17" /> Character Editor</h3>
          <div class="field-grid">
            <div v-for="character in selectedCharacters" :key="character.id" class="field-box">
              <strong>{{ character.name }}</strong>
              <span class="muted">{{ character.subtitle || "No subtitle" }} · {{ character.summary }}</span>
              <template v-if="character.voice.referenceAssetId">
                <span class="muted">Voice reference: {{ store.envelope.entities.mediaAssets[character.voice.referenceAssetId]?.altText }}</span>
                <span class="muted">
                  License: {{ store.envelope.entities.mediaAssets[character.voice.referenceAssetId]?.license.kind }}
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
                  Confirm Voice License
                </button>
              </template>
              <label class="ghost-button" :style="{ cursor: selectedStoryDeleted ? 'not-allowed' : 'pointer' }">
                <FileAudio :size="16" />
                Import Voice Reference
                <input type="file" accept="audio/*" hidden :disabled="selectedStoryDeleted" @change="onVoiceReferenceSelected(character.id, $event)" />
              </label>
            </div>
          </div>
          <label class="field-box">
            <span>New character name</span>
            <input v-model="addCharacterForm.name" class="input" required placeholder="例如：米娅" />
          </label>
          <label class="field-box">
            <span>Subtitle</span>
            <input v-model="addCharacterForm.subtitle" class="input" placeholder="角色身份或短称" />
          </label>
          <div class="row">
            <label class="field-box" style="flex: 1">
              <span>Role in cast</span>
              <input v-model="addCharacterForm.role" class="input" required placeholder="向导、对手、见证人..." />
            </label>
            <label class="field-box" style="flex: 1">
              <span>Goals</span>
              <input v-model="addCharacterForm.goals" class="input" required placeholder="守住秘密，找到失物" />
            </label>
          </div>
          <label class="field-box">
            <span>Relationship seed</span>
            <input v-model="addCharacterForm.relationshipSeed" class="input" required placeholder="与玩家或主角的初始关系" />
          </label>
          <label class="field-box">
            <span>Summary</span>
            <textarea v-model="addCharacterForm.summary" class="textarea" required placeholder="角色的一句话概念" />
          </label>
          <label class="field-box">
            <span>Profile</span>
            <textarea v-model="addCharacterForm.profile" class="textarea" required placeholder="身份、动机、冲突、边界" />
          </label>
          <label class="field-box">
            <span>Voice tone</span>
            <input v-model="addCharacterForm.tone" class="input" required placeholder="说话风格" />
          </label>
          <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted">
            <UserPlus :size="16" />
            Add Character
          </button>
        </form>

        <form v-if="selectedStory" class="field-grid" @submit.prevent="addScenario">
          <h3><PlusCircle :size="17" /> Scenario Editor</h3>
          <div class="field-grid">
            <div v-for="scenario in selectedScenarios" :key="scenario.id" class="field-box">
              <strong>{{ scenario.order }}. {{ scenario.title }}</strong>
              <span class="muted">{{ scenario.location || "No fixed location" }} · {{ scenario.summary }}</span>
              <button class="ghost-button" type="button" :disabled="selectedStoryDeleted" @click="runPreview(scenario.id)">
                <Play :size="16" />
                Preview
              </button>
            </div>
          </div>
          <label class="field-box">
            <span>New scenario title</span>
            <input v-model="addScenarioForm.title" class="input" required placeholder="例如：钟楼第二次敲响" />
          </label>
          <label class="field-box">
            <span>Summary</span>
            <input v-model="addScenarioForm.summary" class="input" required placeholder="这个入口的冲突和目标" />
          </label>
          <label class="field-box">
            <span>Location</span>
            <input v-model="addScenarioForm.location" class="input" placeholder="可选" />
          </label>
          <label class="field-box">
            <span>Opening prompt</span>
            <textarea v-model="addScenarioForm.opening" class="textarea" required placeholder="玩家进入该入口时看到的第一幕" />
          </label>
          <button class="secondary-button" type="submit" :disabled="selectedStoryDeleted">
            <PlusCircle :size="16" />
            Add Scenario
          </button>
        </form>

        <button class="primary-button" :disabled="!selectedStory || selectedStoryDeleted || !canReady" @click="markReady">
          <CheckCircle2 :size="16" />
          Mark local_ready
        </button>
      </aside>
    </div>
  </section>
</template>

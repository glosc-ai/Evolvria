<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ChevronLeft, ChevronRight, Edit3, Film, History, Image, MessageSquare, Pause, Play, Save, SkipForward, Volume2, X } from "lucide-vue-next";
import { readTauriMediaDataUrl } from "@/services/media";
import { useAppStore } from "@/stores/app";
import type { MediaAsset, MediaGenerationJob, MediaGenerationKind, MediaGenerationStatus, SceneChoice, SceneHint, SceneSprite, VoiceCue } from "@/types/domain";

const route = useRoute();
const store = useAppStore();
const chatId = computed(() => String(route.params.chatId));
const chat = computed(() => store.getChat(chatId.value));
const messages = computed(() => store.chatMessages(chatId.value).filter((message) => message.role !== "system"));
const index = ref(Math.max(0, messages.value.length - 1));
const current = computed(() => messages.value[Math.min(index.value, Math.max(0, messages.value.length - 1))]);
const storyline = computed(() => chat.value ? store.getStoryline(chat.value.storylineId) : undefined);
const sceneHint = computed(() => current.value?.sceneHints?.[0]);
const sprites = computed(() => sceneHint.value?.characterSprites ?? []);
const choices = computed(() => sceneHint.value?.choices ?? []);
const voiceCues = computed(() => sceneHint.value?.voice ?? []);
const sceneJobs = computed(() => current.value ? store.mediaGenerationJobsForMessage(current.value.id) : []);
const assetUrls = ref<Record<string, string>>({});
const assetErrors = ref<Record<string, string>>({});
const textSpeed = ref(36);
const visibleCharacters = ref(0);
const autoplay = ref(false);
const showHistory = ref(false);
const showSceneEditor = ref(false);
const sceneFeedback = ref("");
const displayedText = computed(() => (current.value?.content ?? "场景模式会读取聊天消息和 SceneHint；继续聊天后这里会同步更新。").slice(0, visibleCharacters.value));
const isTextComplete = computed(() => visibleCharacters.value >= (current.value?.content ?? "").length);
const recentHistory = computed(() => messages.value.slice(Math.max(0, index.value - 8), index.value + 1));
const loadingAssetIds = new Set<string>();
type CameraOption = NonNullable<SceneHint["camera"]>;
type SceneChoiceDraft = { id?: string; label: string; message: string };
const cameraOptions: CameraOption[] = ["wide", "medium", "close"];
const sceneEditForm = ref<{
  mood: string;
  camera: CameraOption;
  choices: SceneChoiceDraft[];
}>(createSceneEditForm());
const backgroundAsset = computed(() => {
  const hinted = sceneHint.value?.backgroundAssetId ? store.envelope.entities.mediaAssets[sceneHint.value.backgroundAssetId] : undefined;
  if (hinted?.kind === "image") return hinted;
  if (!storyline.value) return undefined;
  const media = store.storylineMedia(storyline.value).filter((asset) => asset.kind === "image");
  return media.find((asset) => asset.purpose === "background") ?? media.find((asset) => asset.purpose === "cover");
});
const backgroundAssetUrl = computed(() => assetUrl(backgroundAsset.value));
let revealTimer: number | undefined;
let autoplayTimer: number | undefined;

function next() {
  index.value = Math.min(messages.value.length - 1, index.value + 1);
}

function previous() {
  index.value = Math.max(0, index.value - 1);
}

function jumpLatest() {
  index.value = Math.max(0, messages.value.length - 1);
}

function revealAll() {
  visibleCharacters.value = current.value?.content.length ?? 0;
}

function toggleAutoplay() {
  autoplay.value = !autoplay.value;
}

function toggleHistory() {
  showHistory.value = !showHistory.value;
  if (showHistory.value) {
    showSceneEditor.value = false;
  }
}

function createSceneEditForm() {
  const hint = sceneHint.value;
  const draftChoices: SceneChoiceDraft[] = [...(hint?.choices ?? [])].slice(0, 3).map((choice) => ({
    id: choice.id,
    label: choice.label,
    message: choice.message,
  }));
  while (draftChoices.length < 3) {
    draftChoices.push({ label: "", message: "" });
  }
  return {
    mood: hint?.mood ?? "",
    camera: hint?.camera ?? "medium",
    choices: draftChoices,
  };
}

function openSceneEditor() {
  sceneEditForm.value = createSceneEditForm();
  showHistory.value = false;
  showSceneEditor.value = true;
}

function closeSceneEditor() {
  showSceneEditor.value = false;
  sceneEditForm.value = createSceneEditForm();
}

async function saveSceneHint() {
  if (!current.value) return;
  await store.updateMessageSceneHint(current.value.id, {
    mood: sceneEditForm.value.mood,
    camera: sceneEditForm.value.camera,
    choices: sceneEditForm.value.choices,
  });
  sceneFeedback.value = "场景提示已保存。";
  showSceneEditor.value = false;
}

async function chooseSceneChoice(choice: SceneChoice) {
  if (!chat.value || chat.value.status !== "active" || store.generating) return;
  autoplay.value = false;
  sceneFeedback.value = `已发送选择：${choice.label}`;
  const result = await store.sendMessage(chat.value.id, choice.message, "act");
  if (!result.ok) {
    sceneFeedback.value = `选择被拦截：${result.reason ?? "未知原因"}`;
    return;
  }
  await nextTick();
  index.value = Math.max(0, messages.value.length - 1);
}

async function queueVoiceGeneration() {
  if (!chat.value || !storyline.value || !current.value) return;
  const cue = voiceCues.value[0];
  const jobId = await store.queueMediaGenerationJob({
    kind: "voice",
    storylineId: storyline.value.id,
    chatId: chat.value.id,
    messageId: current.value.id,
    speakerId: cue?.speakerId,
    prompt: `为《${storyline.value.title}》生成安全的中文旁白语音占位。`,
    voiceText: cue?.text || current.value.content.slice(0, 180),
    style: cue?.voiceModel || "中文场景旁白",
  });
  sceneFeedback.value = `已加入语音生成队列：${jobId}。`;
}

async function queueImageGeneration() {
  if (!chat.value || !storyline.value || !current.value) return;
  const jobId = await store.queueMediaGenerationJob({
    kind: "image",
    storylineId: storyline.value.id,
    chatId: chat.value.id,
    messageId: current.value.id,
    prompt: [
      `Scene image for ${storyline.value.title}.`,
      sceneHint.value?.mood ? `Mood: ${sceneHint.value.mood}.` : undefined,
      current.value.content.slice(0, 220),
    ].filter(Boolean).join("\n"),
    style: "original cinematic visual-novel background, no third-party characters or logos",
  });
  sceneFeedback.value = `已加入图片生成队列：${jobId}。`;
}

async function queueVideoGeneration() {
  if (!chat.value || !storyline.value || !current.value) return;
  const jobId = await store.queueMediaGenerationJob({
    kind: "video",
    storylineId: storyline.value.id,
    chatId: chat.value.id,
    messageId: current.value.id,
    prompt: [
      `Short scene video for ${storyline.value.title}.`,
      sceneHint.value?.mood ? `Mood: ${sceneHint.value.mood}.` : undefined,
      current.value.content.slice(0, 220),
    ].filter(Boolean).join("\n"),
    style: "5 second original visual-novel shot, subtle camera movement, no third-party characters or logos",
  });
  sceneFeedback.value = `已加入视频生成队列：${jobId}。`;
}

async function runGenerationJob(job: MediaGenerationJob) {
  const assetId = await store.runMediaGenerationJob(job.id);
  sceneFeedback.value = assetId ? `${generationKindLabel(job.kind)}生成完成。` : `${generationKindLabel(job.kind)}生成未能运行。`;
  if (assetId) {
    const asset = store.envelope.entities.mediaAssets[assetId];
    if (asset) await ensureAssetUrl(asset);
  }
}

function voiceReferenceAsset(cue: VoiceCue): MediaAsset | undefined {
  return cue.assetId ? store.envelope.entities.mediaAssets[cue.assetId] : undefined;
}

function spriteAsset(sprite: SceneSprite): MediaAsset | undefined {
  const explicit = sprite.mediaAssetId ? store.envelope.entities.mediaAssets[sprite.mediaAssetId] : undefined;
  if (explicit?.kind === "image") return explicit;
  const character = store.getCharacter(sprite.characterId);
  return character?.mediaIds
    .map((assetId) => store.envelope.entities.mediaAssets[assetId])
    .find((asset) => asset?.kind === "image" && (asset.purpose === "sprite" || asset.purpose === "avatar"));
}

function spriteUrl(sprite: SceneSprite): string | undefined {
  return assetUrl(spriteAsset(sprite));
}

function voiceCueUrl(cue: VoiceCue): string | undefined {
  const asset = voiceReferenceAsset(cue);
  return asset?.kind === "audio" ? assetUrl(asset) : undefined;
}

function assetUrl(asset: MediaAsset | undefined): string | undefined {
  return asset ? assetUrls.value[asset.id] : undefined;
}

function assetFallbackLabel(asset: MediaAsset | undefined): string | undefined {
  if (!asset) return undefined;
  if (asset.relativePath.startsWith("browser://")) return "浏览器临时素材无法在场景模式中渲染，请先用 Tauri 桌面导入器重新导入。";
  return assetErrors.value[asset.id];
}

async function ensureSceneAssets() {
  const assets = [
    backgroundAsset.value,
    ...sprites.value.map(spriteAsset),
    ...voiceCues.value.map(voiceReferenceAsset),
  ].filter((asset): asset is MediaAsset => Boolean(asset));
  for (const asset of [...new Map(assets.map((item) => [item.id, item])).values()]) {
    await ensureAssetUrl(asset);
  }
}

async function ensureAssetUrl(asset: MediaAsset) {
  if (assetUrls.value[asset.id] || assetErrors.value[asset.id] || loadingAssetIds.has(asset.id)) return;
  if (!asset.relativePath.trim()) {
    assetErrors.value = { ...assetErrors.value, [asset.id]: "这个场景素材还没有绑定实际媒体文件。" };
    return;
  }
  if (asset.relativePath.startsWith("browser://")) {
    assetErrors.value = {
      ...assetErrors.value,
      [asset.id]: "浏览器临时素材无法在场景模式中渲染，请先用 Tauri 桌面导入器重新导入。",
    };
    return;
  }
  loadingAssetIds.add(asset.id);
  try {
    const dataUrl = await readTauriMediaDataUrl(store.envelope.workspace.id, asset);
    if (dataUrl) {
      assetUrls.value = { ...assetUrls.value, [asset.id]: dataUrl };
    } else {
      assetErrors.value = { ...assetErrors.value, [asset.id]: "媒体预览需要 Tauri 桌面运行时。" };
    }
  } catch (error) {
    assetErrors.value = {
      ...assetErrors.value,
      [asset.id]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    loadingAssetIds.delete(asset.id);
  }
}

watch(messages, (nextMessages) => {
  if (!nextMessages.length) {
    index.value = 0;
  } else if (index.value >= nextMessages.length) {
    index.value = nextMessages.length - 1;
  }
});

watch([current, backgroundAsset], () => {
  void ensureSceneAssets();
}, { immediate: true });

watch(current, () => {
  if (!showSceneEditor.value) {
    sceneEditForm.value = createSceneEditForm();
  }
});

watch([current, textSpeed], () => {
  if (revealTimer) window.clearInterval(revealTimer);
  visibleCharacters.value = 0;
  const contentLength = current.value?.content.length ?? 0;
  if (!contentLength) return;
  revealTimer = window.setInterval(() => {
    visibleCharacters.value = Math.min(contentLength, visibleCharacters.value + Math.max(1, Math.round(textSpeed.value / 12)));
    if (visibleCharacters.value >= contentLength && revealTimer) {
      window.clearInterval(revealTimer);
      revealTimer = undefined;
    }
  }, 45);
}, { immediate: true });

watch([autoplay, isTextComplete, index, messages], () => {
  if (autoplayTimer) {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = undefined;
  }
  if (!autoplay.value || !isTextComplete.value || index.value >= messages.value.length - 1) return;
  autoplayTimer = window.setTimeout(() => {
    next();
  }, 900);
}, { immediate: true });

onBeforeUnmount(() => {
  if (revealTimer) window.clearInterval(revealTimer);
  if (autoplayTimer) window.clearTimeout(autoplayTimer);
});

function generationKindLabel(kind: MediaGenerationKind): string {
  if (kind === "voice") return "语音";
  if (kind === "image") return "图片";
  return "视频";
}

function generationStatusLabel(status: MediaGenerationStatus): string {
  if (status === "queued") return "排队中";
  if (status === "running") return "生成中";
  if (status === "completed") return "已完成";
  if (status === "blocked") return "已拦截";
  return "失败";
}

function voiceCueStatusLabel(status: VoiceCue["status"]): string {
  if (status === "generated") return "已生成";
  if (status === "failed") return "失败";
  return "已规划";
}
</script>

<template>
  <section v-if="chat && storyline" class="scene-page">
    <div class="scene-stage">
      <div class="scene-background" :class="{ mist: storyline.rating === 'M17' }">
        <img
          v-if="backgroundAssetUrl"
          class="scene-bg-media"
          :src="backgroundAssetUrl"
          :alt="backgroundAsset?.altText || `${storyline.title} scene background`"
          aria-label="Scene background asset"
        />
        <div class="scene-topbar">
          <RouterLink class="ghost-button" :to="`/chat/${chat.id}`">
            <MessageSquare :size="16" />
            返回聊天
          </RouterLink>
          <span class="status-pill">{{ storyline.title }}</span>
        </div>

        <div class="scene-settings" aria-label="场景设置">
          <button class="ghost-button" @click="toggleAutoplay">
            <component :is="autoplay ? Pause : Play" :size="16" />
            {{ autoplay ? "暂停自动播放" : "自动播放" }}
          </button>
          <label class="scene-speed">
            <span>文字速度</span>
            <input v-model.number="textSpeed" type="range" min="12" max="72" step="6" />
          </label>
          <button class="ghost-button" @click="toggleHistory">
            <History :size="16" />
            历史
          </button>
          <button class="ghost-button" @click="openSceneEditor">
            <Edit3 :size="16" />
            编辑场景
          </button>
          <button class="ghost-button" :disabled="index >= messages.length - 1" @click="jumpLatest">
            <SkipForward :size="16" />
            最新
          </button>
        </div>

        <aside v-if="showHistory" class="scene-history" aria-label="场景历史">
          <div class="message-meta">
            <span>历史</span>
            <span>{{ recentHistory.length }} 行</span>
          </div>
          <button
            v-for="(message, historyIndex) in recentHistory"
            :key="message.id"
            class="history-line"
            @click="index = Math.max(0, index - recentHistory.length + 1 + historyIndex)"
          >
            <strong>{{ message.role }}<template v-if="message.mode"> / {{ message.mode }}</template></strong>
            <span>{{ message.content }}</span>
          </button>
        </aside>

        <aside v-if="showSceneEditor" class="scene-editor" aria-label="场景提示编辑器">
          <div class="message-meta">
            <span>场景提示</span>
            <button class="ghost-button icon-button" type="button" aria-label="关闭场景编辑器" @click="closeSceneEditor">
              <X :size="16" />
            </button>
          </div>
          <label class="field-box">
            <span>场景情绪</span>
            <input v-model="sceneEditForm.mood" class="input" aria-label="场景情绪" placeholder="开场、紧张、温暖..." />
          </label>
          <label class="field-box">
            <span>镜头</span>
            <select v-model="sceneEditForm.camera" class="select" aria-label="场景镜头">
              <option v-for="camera in cameraOptions" :key="camera" :value="camera">{{ camera }}</option>
            </select>
          </label>
          <div class="scene-choice-editor" aria-label="场景选项编辑器">
            <label v-for="(_, choiceIndex) in sceneEditForm.choices" :key="choiceIndex" class="field-box">
              <span>选项 {{ choiceIndex + 1 }}</span>
              <input v-model="sceneEditForm.choices[choiceIndex].label" class="input" :aria-label="`选项 ${choiceIndex + 1} 标签`" placeholder="短标签" />
              <textarea v-model="sceneEditForm.choices[choiceIndex].message" class="textarea compact" :aria-label="`选项 ${choiceIndex + 1} 消息`" placeholder="选择后发送到聊天的内容" />
            </label>
          </div>
          <button class="primary-button" type="button" @click="saveSceneHint">
            <Save :size="16" />
            保存场景提示
          </button>
        </aside>

        <div class="sprite-row" aria-label="当前角色">
          <div v-for="sprite in sprites" :key="sprite.characterId" class="sprite" :class="sprite.position">
            <img
              v-if="spriteUrl(sprite)"
              class="sprite-media"
              :src="spriteUrl(sprite)"
              :alt="spriteAsset(sprite)?.altText || `${store.getCharacter(sprite.characterId)?.name ?? 'Character'} sprite`"
              :aria-label="`${store.getCharacter(sprite.characterId)?.name ?? 'Character'} sprite asset`"
            />
            <span>{{ store.getCharacter(sprite.characterId)?.name ?? "Unknown" }}</span>
          </div>
        </div>

        <div class="subtitle-box">
          <div class="message-meta">
            <span>{{ current?.role ?? "narrator" }}</span>
            <span>{{ index + 1 }} / {{ messages.length }}</span>
          </div>
          <button class="subtitle-text" type="button" @click="revealAll">
            {{ displayedText }}
          </button>
          <div v-if="choices.length" class="scene-choices" aria-label="场景选项">
            <button
              v-for="choice in choices"
              :key="choice.id"
              class="ghost-button"
              type="button"
              :disabled="store.generating || chat.status !== 'active'"
              @click="chooseSceneChoice(choice)"
            >
              {{ choice.label }}
            </button>
          </div>
          <div v-if="voiceCues.length" class="scene-voice-cues" aria-label="语音提示">
            <div v-for="(cue, cueIndex) in voiceCues" :key="`${cue.text}-${cueIndex}`" class="voice-cue">
              <Volume2 :size="15" />
              <span>
                {{ voiceCueStatusLabel(cue.status) }} · {{ cue.voiceModel || "计划中文语音" }}
                <template v-if="voiceReferenceAsset(cue)">
                  · 已附加参考音频
                  · 授权 {{ voiceReferenceAsset(cue)?.license.kind }}
                  · {{ voiceReferenceAsset(cue)?.source.label }}
                  <template v-if="!voiceCueUrl(cue) && assetFallbackLabel(voiceReferenceAsset(cue))">
                    · 暂无预览
                  </template>
                </template>
              </span>
              <audio
                v-if="voiceCueUrl(cue)"
                class="voice-player"
                controls
                preload="metadata"
                :src="voiceCueUrl(cue)"
                :aria-label="`语音预览 ${cueIndex + 1}`"
              />
            </div>
          </div>
          <div class="scene-generation-queue" aria-label="生成队列">
            <div class="cluster">
              <button class="ghost-button" type="button" :disabled="chat.status !== 'active'" @click="queueVoiceGeneration">
                <Volume2 :size="15" />
                排队生成语音
              </button>
              <button class="ghost-button" type="button" :disabled="chat.status !== 'active'" @click="queueImageGeneration">
                <Image :size="15" />
                排队生成图片
              </button>
              <button class="ghost-button" type="button" :disabled="chat.status !== 'active'" @click="queueVideoGeneration">
                <Film :size="15" />
                排队生成视频
              </button>
            </div>
            <div v-if="sceneJobs.length" class="generation-job-list">
              <div v-for="job in sceneJobs.slice(0, 4)" :key="job.id" class="generation-job">
                <span>{{ generationKindLabel(job.kind) }} · {{ generationStatusLabel(job.status) }} · {{ job.model }}</span>
                <button
                  v-if="job.status === 'queued' || job.status === 'failed'"
                  class="ghost-button"
                  type="button"
                  @click="runGenerationJob(job)"
                >
                  运行
                </button>
              </div>
            </div>
          </div>
          <p v-if="assetFallbackLabel(backgroundAsset)" class="scene-feedback">{{ assetFallbackLabel(backgroundAsset) }}</p>
          <p v-if="sceneFeedback" class="scene-feedback">{{ sceneFeedback }}</p>
          <div class="cluster">
            <button class="ghost-button" :disabled="index <= 0" @click="previous">
              <ChevronLeft :size="16" />
              上一条
            </button>
            <button class="primary-button" :disabled="index >= messages.length - 1" @click="next">
              下一条
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section v-else class="page">
    <div class="panel">未找到场景。</div>
  </section>
</template>

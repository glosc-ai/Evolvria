<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { CopyPlus, Flag, PenTool, Play, RotateCcw } from "lucide-vue-next";
import { labelFor, playModeLabel } from "@/lib/display";
import { useAppStore } from "@/stores/app";
import type { Character, MediaAsset } from "@/types/domain";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const duplicating = ref(false);
const reportReason = ref("公开目录举报：内容需要再次进行本地审核。");
const reportMessage = ref("");
const activeTab = ref<"overview" | "characters" | "scenarios" | "notes" | "safety" | "changelog">("overview");
const storyline = computed(() => store.getStoryline(String(route.params.id)));
const casts = computed(() => storyline.value ? store.storylineCharacters(storyline.value) : []);
const scenarios = computed(() => storyline.value ? store.storylineScenarios(storyline.value) : []);
const media = computed(() => storyline.value ? store.storylineMedia(storyline.value) : []);
const validationIssues = computed(() => storyline.value ? store.validateStoryline(storyline.value.id) : []);
const existingChat = computed(() => store.activeChats.find((chat) => chat.storylineId === storyline.value?.id));

const tabs: Array<{ value: typeof activeTab.value; label: string }> = [
  { value: "overview", label: "概览" },
  { value: "characters", label: "角色" },
  { value: "scenarios", label: "场景" },
  { value: "notes", label: "创作者备注" },
  { value: "safety", label: "安全" },
  { value: "changelog", label: "变更记录" },
];

async function duplicateAsDraft() {
  if (!storyline.value || duplicating.value) return;
  duplicating.value = true;
  try {
    const duplicatedId = await store.duplicateStorylineAsDraft(storyline.value.id);
    await router.push({ path: "/create", query: { storyId: duplicatedId, duplicated: "1" } });
  } finally {
    duplicating.value = false;
  }
}

function voiceReference(character: Character): MediaAsset | undefined {
  const assetId = character.voice.referenceAssetId;
  return assetId ? store.envelope.entities.mediaAssets[assetId] : undefined;
}

async function reportStoryline() {
  if (!storyline.value) return;
  await store.submitLocalModerationCase("storyline", storyline.value.id, reportReason.value);
  reportMessage.value = "故事线举报已加入本地审核队列。";
}
</script>

<template>
  <section v-if="storyline" class="page">
    <div class="hero-panel">
      <div>
        <p class="eyebrow">故事线详情</p>
        <h2>{{ storyline.title }}</h2>
        <p>{{ storyline.summary }}</p>
        <div class="tags">
          <span class="tag" :class="storyline.rating === 'SFW' ? 'sfw' : 'm17'">{{ storyline.rating }}</span>
          <span v-for="mode in storyline.supportedModes" :key="mode" class="tag">{{ playModeLabel(mode) }}</span>
          <span v-for="tag in storyline.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <div class="cluster" style="margin-top: 18px">
          <RouterLink class="primary-button" :to="`/start/${storyline.id}`">
            <Play :size="17" />
            开始
          </RouterLink>
          <RouterLink v-if="existingChat" class="secondary-button" :to="`/chat/${existingChat.id}`">
            <RotateCcw :size="17" />
            继续
          </RouterLink>
          <RouterLink class="secondary-button" :to="{ path: '/create', query: { storyId: storyline.id } }">
            <PenTool :size="17" />
            编辑
          </RouterLink>
          <button class="secondary-button" :disabled="duplicating" @click="duplicateAsDraft">
            <CopyPlus :size="17" />
            复制
          </button>
        </div>
      </div>
      <div class="cover" :class="{ mist: storyline.rating === 'M17' }" aria-hidden="true"></div>
    </div>

    <div class="mode-tabs detail-tabs" role="tablist" aria-label="故事线详情标签">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="page-grid" style="margin-top: 22px">
      <div class="field-grid">
        <section v-if="activeTab === 'overview'" class="panel">
          <h3>前提</h3>
          <p class="muted">{{ storyline.premise }}</p>
          <h3>世界规则</h3>
          <ul>
            <li v-for="rule in storyline.worldRules" :key="rule">{{ rule }}</li>
          </ul>
          <h3>支持模式</h3>
          <div class="tags">
            <span v-for="mode in storyline.supportedModes" :key="mode" class="tag">{{ playModeLabel(mode) }}</span>
          </div>
        </section>

        <section v-else-if="activeTab === 'characters'" class="panel">
          <h3>角色阵容</h3>
          <div class="field-grid">
            <article v-for="character in casts" :key="character.id" class="field-box">
              <strong>{{ character.name }}</strong>
              <span class="muted">{{ character.subtitle }}</span>
              <p>{{ character.summary }}</p>
              <span class="muted small">{{ character.voice.tone }}</span>
              <template v-if="voiceReference(character)">
                <span class="muted small">语音参考：{{ voiceReference(character)?.altText }}</span>
                <span class="muted small">
                  授权 {{ labelFor(voiceReference(character)?.license.kind) }}
                  · {{ labelFor(voiceReference(character)?.safety.state) }}
                  · {{ voiceReference(character)?.source.label }}
                </span>
              </template>
            </article>
          </div>
        </section>

        <section v-else-if="activeTab === 'scenarios'" class="panel">
          <h3>场景</h3>
          <div class="field-grid">
            <article v-for="scenario in scenarios" :key="scenario.id" class="field-box">
              <strong>{{ scenario.title }}</strong>
              <span class="muted">{{ scenario.location || "无固定地点" }}</span>
              <p>{{ scenario.summary }}</p>
              <p class="muted">{{ scenario.opening }}</p>
            </article>
          </div>
        </section>

        <section v-else-if="activeTab === 'notes'" class="panel">
          <h3>创作者备注</h3>
          <div class="field-grid">
            <div class="field-box">
              <strong>{{ storyline.createdBy.name }}</strong>
              <span class="muted">创作者 ID：{{ storyline.createdBy.id }}</span>
            </div>
            <div class="field-box">
              <strong>玩家身份</strong>
              <span class="muted">{{ storyline.playerRole }}</span>
            </div>
            <div class="field-box">
              <strong>内容包边界</strong>
              <span class="muted">Evolvria 原创内容。不得复制第三方品牌、代码、素材、提示词或用户内容。</span>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'safety'" class="panel">
          <h3>安全</h3>
          <div class="field-grid">
            <div class="field-box">
              <strong>{{ storyline.rating }} / {{ labelFor(storyline.moderation.state) }}</strong>
              <span class="muted">{{ labelFor(storyline.visibility) }}可见性 · {{ storyline.moderation.safetyFlags.map(labelFor).join(", ") }}</span>
            </div>
            <div v-for="issue in validationIssues" :key="`${issue.field}:${issue.message}`" class="field-box">
              <strong>{{ labelFor(issue.severity) }}：{{ issue.field }}</strong>
              <span class="muted">{{ issue.message }}</span>
            </div>
            <div v-if="!validationIssues.length" class="field-box">
              <strong>没有校验问题</strong>
              <span class="muted">除非继续编辑或添加新媒体，否则此内容包可保持本地就绪。</span>
            </div>
            <form class="field-box field-grid" @submit.prevent="reportStoryline">
              <strong><Flag :size="15" /> 举报故事线</strong>
              <textarea v-model="reportReason" class="textarea" aria-label="故事线举报原因" />
              <button class="danger-button" type="submit">创建举报</button>
              <span v-if="reportMessage" class="muted">{{ reportMessage }}</span>
            </form>
          </div>
        </section>

        <section v-else class="panel">
          <h3>变更记录</h3>
          <div class="field-grid">
            <div class="field-box">
              <strong>{{ storyline.version.version }} / {{ labelFor(storyline.version.status) }}</strong>
              <span class="muted">{{ storyline.version.changelog }}</span>
              <span v-if="storyline.version.baseVersionId" class="muted">基线：{{ storyline.version.baseVersionId }}</span>
            </div>
            <div class="field-box">
              <strong>时间线</strong>
              <span class="muted">创建于 {{ new Date(storyline.createdAt).toLocaleString() }}</span>
              <span class="muted">更新于 {{ new Date(storyline.updatedAt).toLocaleString() }}</span>
            </div>
          </div>
        </section>
      </div>

      <aside class="panel">
        <h3>启动选项</h3>
        <p class="muted small">玩家身份</p>
        <strong>{{ storyline.playerRole }}</strong>
        <p class="muted small">创作者</p>
        <strong>{{ storyline.createdBy.name }}</strong>
        <p class="muted small">媒体</p>
        <strong>{{ media.length }} 个素材</strong>
        <p class="muted small">场景</p>
        <div class="field-grid">
          <div v-for="scenario in scenarios" :key="scenario.id" class="field-box">
            <strong>{{ scenario.title }}</strong>
            <span class="muted">{{ scenario.summary }}</span>
          </div>
        </div>
      </aside>
    </div>
  </section>
  <section v-else class="page">
    <div class="panel">未找到故事线。</div>
  </section>
</template>

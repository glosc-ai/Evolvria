<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Archive, Bookmark, BookmarkCheck, Database, Dices, Download, Film, Plus, RotateCcw, Save, ScrollText, Search, Send, Sparkles, Trash2, Undo2 } from "lucide-vue-next";
import { createMessageWindow } from "@/domain/chat-reducer";
import { labelFor, messageModeLabel, messageRoleLabel } from "@/lib/display";
import { NARRATIVE_PROMPT_CONTRACT_VERSION } from "@/services/ai/context";
import { useAppStore } from "@/stores/app";
import type { Arc, ArcBeat, MessageMode } from "@/types/domain";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const chatId = computed(() => String(route.params.chatId));
const chat = computed(() => store.getChat(chatId.value));
const messages = computed(() => store.chatMessages(chatId.value));
const storyline = computed(() => chat.value ? store.getStoryline(chat.value.storylineId) : undefined);
const scenario = computed(() => chat.value ? store.getScenario(chat.value.scenarioId) : undefined);
const persona = computed(() => chat.value ? store.envelope.entities.personas[chat.value.personaId] : undefined);
const dungeonMindConfig = computed(() => storyline.value?.dungeonMindConfigId ? store.envelope.entities.dungeonMindConfigs[storyline.value.dungeonMindConfigId] : undefined);
const summaries = computed(() => store.chatSummaries(chatId.value));
const latestSummary = computed(() => summaries.value.at(-1));
const activeArc = computed(() => store.chatArc(chatId.value));
const fateChecks = computed(() => store.chatFateChecks(chatId.value));
const checkpoints = computed(() => store.chatCheckpoints(chatId.value).slice().reverse());
const bookmarkedMessages = computed(() => store.bookmarkedChatMessages(chatId.value));
const relationshipDeltas = computed(() => messages.value.flatMap((message) => message.relationshipDeltas ?? []));
const input = ref("");
const searchQuery = ref("");
const mode = ref<MessageMode>("say");
const fateFeedback = ref("");
const fateDraft = reactive({
  intent: "",
  attributeId: "",
  skillId: "",
  difficultyBandIndex: "1",
  difficulty: 12,
  modifier: 0,
  seed: "",
});
const feed = ref<HTMLElement | null>(null);
const messagePageSize = 80;
const visibleMessageLimit = ref(messagePageSize);
const messagePageProbeVisible = ref(false);
const jsonMessageWindow = computed(() => createMessageWindow(messages.value, visibleMessageLimit.value, searchQuery.value));
const activeSqliteMessagePage = computed(() => store.lastSqliteMessagePage?.chatId === chatId.value ? store.lastSqliteMessagePage : undefined);
const activeDisplayMessagePage = computed(() => {
  const page = activeSqliteMessagePage.value;
  if (!page || searchQuery.value.trim() || page.offsetFromEnd !== 0) return undefined;
  if (page.totalCount !== messages.value.length) return undefined;
  if (page.pageSize < Math.min(200, Math.max(1, Math.round(visibleMessageLimit.value)))) return undefined;
  return page;
});
const activeDisplayPageMessages = computed(() =>
  activeDisplayMessagePage.value?.messages.map((message) => store.envelope.entities.messages[message.id] ?? message) ?? [],
);
const messageWindow = computed(() => {
  const page = activeDisplayMessagePage.value;
  if (!page) return jsonMessageWindow.value;
  return {
    messages: activeDisplayPageMessages.value,
    totalCount: page.totalCount,
    hiddenCount: page.startIndex,
    searchActive: false,
  };
});
const visibleMessages = computed(() => messageWindow.value.messages);
const latestPromptContractVersion = computed(() =>
  [...messages.value].reverse().find((message) => message.promptContractVersion)?.promptContractVersion ?? NARRATIVE_PROMPT_CONTRACT_VERSION,
);
const turnEstimate = computed(() => input.value.trim() ? store.estimateChatTurn(chatId.value, input.value.trim()) : undefined);
const budgetCheck = computed(() => input.value.trim() ? store.checkChatBudget(chatId.value, input.value.trim()) : { ok: true, reasons: [] });
const canRetry = computed(() => Boolean(chat.value && chat.value.status !== "archived" && !store.generating));
const fateAttributes = computed(() => dungeonMindConfig.value?.attributes ?? []);
const fateSkillOptions = computed(() => {
  const skills = dungeonMindConfig.value?.skills ?? [];
  if (!fateDraft.attributeId) return skills;
  return skills.filter((skill) => skill.attributeId === fateDraft.attributeId);
});
const selectedFateAttribute = computed(() => fateAttributes.value.find((attribute) => attribute.id === fateDraft.attributeId));
const fateDifficultyBands = computed(() => dungeonMindConfig.value?.difficultyTable ?? []);
const lastFateCheck = computed(() => fateChecks.value.at(-1));
const summaryDraft = reactive({
  title: "",
  summary: "",
  facts: "",
  unresolvedThreads: "",
});
type ArcBeatDraft = {
  id?: string;
  title: string;
  status: ArcBeat["status"];
  evidenceMessageIds: string[];
};
const arcDraft = reactive({
  title: "",
  theme: "",
  goal: "",
  stakes: "",
  status: "active" as Arc["status"],
  beats: [] as ArcBeatDraft[],
});
const arcFeedback = ref("");

const modeLabels: Array<{ value: MessageMode; label: string }> = [
  { value: "say", label: "说话" },
  { value: "act", label: "行动" },
  { value: "ask", label: "询问" },
  { value: "ooc", label: "旁白外" },
];

watch(messages, async () => {
  await nextTick();
  feed.value?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
});

watch(chatId, () => {
  visibleMessageLimit.value = messagePageSize;
  searchQuery.value = "";
  messagePageProbeVisible.value = false;
  void refreshDisplayMessagePage();
});

watch(searchQuery, () => {
  visibleMessageLimit.value = messagePageSize;
  if (!searchQuery.value.trim()) void refreshDisplayMessagePage();
});

watch(() => messages.value.length, () => {
  if (!searchQuery.value.trim()) void refreshDisplayMessagePage();
}, { immediate: true });

watch(latestSummary, (summary) => {
  summaryDraft.title = summary?.title ?? "";
  summaryDraft.summary = summary?.summary ?? "";
  summaryDraft.facts = summary?.facts.join("\n") ?? "";
  summaryDraft.unresolvedThreads = summary?.unresolvedThreads.join("\n") ?? "";
}, { immediate: true });

watch(activeArc, (arc) => {
  resetArcDraft(arc);
}, { immediate: true });

watch(dungeonMindConfig, (config) => {
  hydrateFateDraft(config);
}, { immediate: true });

watch(() => fateDraft.difficultyBandIndex, (index) => {
  const band = fateDifficultyBands.value[Number(index)];
  if (band) fateDraft.difficulty = band.target;
});

watch(() => fateDraft.attributeId, () => {
  fateDraft.modifier = selectedFateAttribute.value?.defaultValue ?? 0;
  if (!fateSkillOptions.value.some((skill) => skill.id === fateDraft.skillId)) {
    fateDraft.skillId = fateSkillOptions.value[0]?.id ?? "";
  }
});

async function send() {
  const content = input.value.trim();
  if (!content || store.generating || !budgetCheck.value.ok) return;
  const result = await store.sendMessage(chatId.value, content, mode.value);
  if (result.ok) {
    input.value = "";
  }
}

async function exportVisibleMessages() {
  await store.exportChatExcerpt(chatId.value, visibleMessages.value.map((message) => message.id));
}

async function archiveCurrentChat() {
  if (!chat.value || !storyline.value) return;
  await store.archiveChat(chat.value.id);
  await router.push(`/storylines/${storyline.value.id}`);
}

async function switchToMockProvider() {
  await store.updateProvider({
    ...store.envelope.settings.provider,
    type: "mock",
    model: "evolvria-mock",
  });
}

function hydrateFateDraft(config = dungeonMindConfig.value) {
  const attribute = config?.attributes[0];
  const skill = attribute
    ? config?.skills.find((item) => item.attributeId === attribute.id)
    : config?.skills[0];
  const bandIndex = config?.difficultyTable[1] ? 1 : 0;
  fateDraft.intent = "";
  fateDraft.attributeId = attribute?.id ?? "";
  fateDraft.skillId = skill?.id ?? "";
  fateDraft.difficultyBandIndex = String(bandIndex);
  fateDraft.difficulty = config?.difficultyTable[bandIndex]?.target ?? 12;
  fateDraft.modifier = attribute?.defaultValue ?? 0;
  fateDraft.seed = "";
  fateFeedback.value = "";
}

async function runFateFromDraft(continueAfter = false) {
  if (!chat.value || !dungeonMindConfig.value?.enabled) return;
  const check = await store.performFateCheck(chat.value.id, {
    intent: fateDraft.intent,
    attributeId: fateDraft.attributeId || undefined,
    skillId: fateDraft.skillId || undefined,
    difficulty: Number(fateDraft.difficulty),
    modifier: Number(fateDraft.modifier),
    seed: fateDraft.seed,
    continueAfter,
  });
  if (check) {
    fateFeedback.value = `${labelFor(check.outcome)} · 总计 ${check.roll.total}`;
    fateDraft.seed = "";
  }
}

async function saveLatestSummary() {
  if (!latestSummary.value) return;
  await store.updateSummaryChapter(latestSummary.value.id, {
    title: summaryDraft.title,
    summary: summaryDraft.summary,
    facts: splitLines(summaryDraft.facts),
    unresolvedThreads: splitLines(summaryDraft.unresolvedThreads),
  });
}

async function revertLatestSummary() {
  if (!latestSummary.value) return;
  await store.revertSummaryChapter(latestSummary.value.id);
}

function resetArcDraft(arc = activeArc.value) {
  arcDraft.title = arc?.title ?? "";
  arcDraft.theme = arc?.theme ?? "";
  arcDraft.goal = arc?.goal ?? "";
  arcDraft.stakes = arc?.stakes ?? "";
  arcDraft.status = arc?.status ?? "active";
  arcDraft.beats = arc?.beats.map((beat) => ({
    id: beat.id,
    title: beat.title,
    status: beat.status,
    evidenceMessageIds: [...beat.evidenceMessageIds],
  })) ?? [];
  arcFeedback.value = "";
}

function addArcBeat() {
  arcDraft.beats.push({
    title: "新的剧情节点",
    status: "open",
    evidenceMessageIds: [],
  });
}

function removeArcBeat(index: number) {
  arcDraft.beats.splice(index, 1);
}

async function saveActiveArc() {
  if (!activeArc.value) return;
  await store.updateArc(activeArc.value.id, {
    title: arcDraft.title,
    theme: arcDraft.theme,
    goal: arcDraft.goal,
    stakes: arcDraft.stakes,
    status: arcDraft.status,
    beats: arcDraft.beats,
  });
  arcFeedback.value = "剧情弧已保存。";
}

function splitLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function loadOlderMessages() {
  visibleMessageLimit.value += messagePageSize;
  void refreshDisplayMessagePage();
}

async function previewMessagePage(offsetFromEnd = 0) {
  messagePageProbeVisible.value = true;
  await store.previewSqliteMessagePage(chatId.value, messagePageSize, offsetFromEnd);
}

async function previewOlderMessagePage() {
  await previewMessagePage(activeSqliteMessagePage.value?.nextOffsetFromEnd ?? messagePageSize);
}

async function refreshDisplayMessagePage() {
  if (searchQuery.value.trim()) return;
  await store.previewSqliteMessagePage(chatId.value, visibleMessageLimit.value, 0);
}
</script>

<template>
  <section v-if="chat && storyline" class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">聊天会话</p>
        <h2>{{ chat.title }}</h2>
      </div>
      <div class="cluster">
        <RouterLink class="ghost-button" :to="`/scene/${chat.id}`">
          <Film :size="16" />
          场景
        </RouterLink>
        <button class="ghost-button" :disabled="!visibleMessages.length" @click="exportVisibleMessages">
          <Download :size="16" />
          导出
        </button>
        <button class="ghost-button" :disabled="store.generating || chat.status !== 'active'" @click="store.summarizeChat(chat.id)">
          <ScrollText :size="16" />
          摘要
        </button>
        <button class="ghost-button" :disabled="store.generating || chat.status !== 'active' || !dungeonMindConfig?.enabled" @click="store.performFateCheck(chat.id)">
          <Dices :size="16" />
          裁定
        </button>
        <button class="ghost-button" :disabled="!canRetry" @click="store.retryLast(chat.id)">
          <RotateCcw :size="16" />
          重试
        </button>
        <button class="ghost-button" :disabled="store.generating || chat.status !== 'active'" @click="archiveCurrentChat">
          <Archive :size="16" />
          归档
        </button>
        <button class="secondary-button" :disabled="store.generating || chat.status !== 'active'" @click="store.continueChat(chat.id)">
          <Sparkles :size="16" />
          继续
        </button>
      </div>
    </div>

    <div class="chat-layout">
      <div class="chat-feed">
        <div v-if="chat.status === 'archived'" class="message system" style="max-width: 100%; margin-bottom: 12px">
          此聊天已归档。请先在“存档”中恢复，再发送新消息。
        </div>
        <div v-if="chat.status === 'error'" class="message system" style="max-width: 100%; margin-bottom: 12px">
          提供方调用失败。你的输入已保存，可以重试或切换到模拟提供方。
          <div class="cluster" style="margin-top: 10px">
            <button class="ghost-button" type="button" :disabled="store.generating" @click="switchToMockProvider">
              切换到模拟提供方
            </button>
            <button class="ghost-button" type="button" :disabled="store.generating" @click="store.retryLast(chat.id)">
              立即重试
            </button>
          </div>
        </div>
        <label class="field-box chat-search">
          <span><Search :size="15" /> 搜索消息</span>
          <input v-model="searchQuery" class="input" placeholder="搜索对白、动作、角色回复或系统信息" />
        </label>
        <div ref="feed" class="message-list">
          <article v-if="messageWindow.hiddenCount" class="message system message-window-status">
            <span>显示最近 {{ visibleMessages.length }} / {{ messageWindow.totalCount }} 条消息。</span>
            <button class="ghost-button" type="button" @click="loadOlderMessages">
              加载更早 {{ Math.min(messagePageSize, messageWindow.hiddenCount) }} 条
            </button>
          </article>
          <article v-else-if="messageWindow.totalCount > messagePageSize && !messageWindow.searchActive" class="message system message-window-status">
            已显示全部 {{ messageWindow.totalCount }} 条消息。
          </article>
          <article v-else-if="messageWindow.searchActive" class="message system message-window-status">
            搜索结果：{{ messageWindow.totalCount }} 条消息。
          </article>
          <article
            v-for="message in visibleMessages"
            :key="message.id"
            class="message"
            :class="message.role"
          >
            <div class="message-meta">
              <span>{{ messageRoleLabel(message.role) }}<template v-if="message.mode"> / {{ messageModeLabel(message.mode) }}</template></span>
              <span class="message-meta-actions">
                {{ new Date(message.createdAt).toLocaleTimeString() }}
                <button
                  class="message-bookmark-button"
                  type="button"
                  :aria-label="message.bookmarkedAt ? '移除书签' : '标记消息'"
                  :aria-pressed="Boolean(message.bookmarkedAt)"
                  @click="store.toggleMessageBookmark(message.id)"
                >
                  <BookmarkCheck v-if="message.bookmarkedAt" :size="14" />
                  <Bookmark v-else :size="14" />
                </button>
              </span>
            </div>
            {{ message.content }}
          </article>
          <article v-if="searchQuery && !visibleMessages.length" class="message system">没有匹配消息。</article>
          <article v-if="store.generating" class="message system">AI 正在书写下一拍...</article>
        </div>

        <form class="composer" @submit.prevent="send">
          <div class="mode-tabs" role="tablist" aria-label="消息模式">
            <button
              v-for="item in modeLabels"
              :key="item.value"
              type="button"
              :class="{ active: mode === item.value }"
              @click="mode = item.value"
            >
              {{ item.label }}
            </button>
          </div>
          <textarea
            v-model="input"
            class="textarea"
            :disabled="chat.status !== 'active'"
            placeholder="说一句话、描述动作，或询问下一步..."
            @keydown.meta.enter.prevent="send"
            @keydown.ctrl.enter.prevent="send"
          />
          <div class="row">
            <button class="primary-button" type="submit" :disabled="chat.status !== 'active' || !input.trim() || store.generating || !budgetCheck.ok">
              <Send :size="16" />
              发送
            </button>
            <span class="muted small">提供方：{{ labelFor(store.envelope.settings.provider.type) }} / {{ store.envelope.settings.provider.model }}</span>
          </div>
          <div v-if="turnEstimate" class="budget-preview" :class="{ blocked: !budgetCheck.ok }">
            <span>输入 {{ turnEstimate.inputTokens }} / {{ store.envelope.settings.budget.maxInputTokens }}</span>
            <span>输出 {{ turnEstimate.outputTokens }} / {{ store.envelope.settings.budget.maxOutputTokens }}</span>
            <span>成本 {{ turnEstimate.estimatedCost.toFixed(6) }} / {{ store.envelope.settings.budget.maxEstimatedCostPerTurn.toFixed(6) }}</span>
          </div>
          <p v-if="!budgetCheck.ok" class="error-text">{{ budgetCheck.reasons.join(" ") }}</p>
        </form>
      </div>

      <aside class="panel field-grid">
        <div>
          <h3>上下文</h3>
          <p class="muted">{{ storyline.summary }}</p>
        </div>
        <div class="field-box">
          <strong>玩家档案</strong>
          <span class="muted">{{ persona?.name }} - {{ persona?.description }}</span>
        </div>
        <div class="field-box">
          <strong>场景</strong>
          <span class="muted">{{ scenario?.title }}</span>
        </div>
        <div class="field-box">
          <strong>成本</strong>
          <span class="muted">{{ Object.keys(store.envelope.entities.creditLedger).length }} 条本地账本记录</span>
          <span v-if="store.lastBudgetWarning" class="muted">{{ store.lastBudgetWarning }}</span>
          <span class="muted">提示词契约 {{ latestPromptContractVersion }}</span>
        </div>
        <div class="field-box">
          <strong>消息分页</strong>
          <span class="muted">搜索为空时，主消息流使用最近消息分页。</span>
          <span v-if="messagePageProbeVisible && store.lastSqliteMessagePageMessage" class="muted">{{ store.lastSqliteMessagePageMessage }}</span>
          <span v-if="messagePageProbeVisible && activeSqliteMessagePage" class="muted">
            第 {{ activeSqliteMessagePage.startIndex + 1 }}-{{ activeSqliteMessagePage.endIndex }} 行 / 共 {{ activeSqliteMessagePage.totalCount }}
          </span>
          <div class="cluster">
            <button class="ghost-button" type="button" @click="previewMessagePage()">
              <Database :size="15" />
              预览分页
            </button>
            <button class="ghost-button" type="button" :disabled="!activeSqliteMessagePage?.hasOlder" @click="previewOlderMessagePage">
              更早分页
            </button>
          </div>
          <div v-if="messagePageProbeVisible && activeSqliteMessagePage?.messages.length" class="field-grid">
            <span v-for="message in activeSqliteMessagePage.messages.slice(0, 3)" :key="message.id" class="muted">
              {{ messageRoleLabel(message.role) }}：{{ message.content.slice(0, 72) }}
            </span>
          </div>
        </div>
        <div class="field-box">
          <strong>回滚点</strong>
          <span class="muted">{{ checkpoints.length }} 个回滚点</span>
          <div class="field-grid">
            <button
              v-for="checkpoint in checkpoints.slice(0, 4)"
              :key="checkpoint.id"
              class="ghost-button"
              type="button"
              :disabled="store.generating || chat.status !== 'active'"
              @click="store.rollbackToCheckpoint(chat.id, checkpoint.id)"
            >
              <Undo2 :size="15" />
              {{ checkpoint.label }}
            </button>
          </div>
        </div>
        <div v-if="store.lastChatExportPath" class="field-box">
          <strong>最近摘录</strong>
          <span class="muted">{{ store.lastChatExportPath }}</span>
        </div>
        <div v-if="activeArc" class="field-box">
          <strong>{{ activeArc.title }}</strong>
          <span class="muted">{{ activeArc.goal }}</span>
          <div class="tags">
            <span v-for="beat in activeArc.beats" :key="beat.id" class="tag">{{ labelFor(beat.status) }}：{{ beat.title }}</span>
          </div>
          <div class="summary-editor" aria-label="剧情弧编辑器">
            <label class="field-box">
              <span>剧情弧标题</span>
              <input v-model="arcDraft.title" class="input" aria-label="剧情弧标题" />
            </label>
            <label class="field-box">
              <span>剧情弧主题</span>
              <input v-model="arcDraft.theme" class="input" aria-label="剧情弧主题" />
            </label>
            <label class="field-box">
              <span>剧情弧目标</span>
              <textarea v-model="arcDraft.goal" class="textarea" aria-label="剧情弧目标" />
            </label>
            <label class="field-box">
              <span>剧情弧风险</span>
              <textarea v-model="arcDraft.stakes" class="textarea" aria-label="剧情弧风险" />
            </label>
            <label class="field-box">
              <span>剧情弧状态</span>
              <select v-model="arcDraft.status" class="select" aria-label="剧情弧状态">
                <option value="planned">计划中</option>
                <option value="active">进行中</option>
                <option value="resolved">已解决</option>
                <option value="abandoned">已放弃</option>
              </select>
            </label>
            <div class="field-grid">
              <label v-for="(beat, beatIndex) in arcDraft.beats" :key="beat.id ?? beatIndex" class="field-box">
                <span>节点 {{ beatIndex + 1 }}</span>
                <input v-model="beat.title" class="input" :aria-label="`剧情节点 ${beatIndex + 1} 标题`" />
                <select v-model="beat.status" class="select" :aria-label="`剧情节点 ${beatIndex + 1} 状态`">
                  <option value="open">开放</option>
                  <option value="done">完成</option>
                  <option value="skipped">跳过</option>
                </select>
                <button class="ghost-button" type="button" :disabled="arcDraft.beats.length <= 1" @click="removeArcBeat(beatIndex)">
                  <Trash2 :size="15" />
                  移除节点
                </button>
              </label>
            </div>
            <div class="row">
              <button class="ghost-button" type="button" @click="addArcBeat">
                <Plus :size="15" />
                添加节点
              </button>
              <button class="ghost-button" type="button" :disabled="store.generating" @click="saveActiveArc">
                <Save :size="15" />
                保存剧情弧
              </button>
            </div>
            <span v-if="arcFeedback" class="muted">{{ arcFeedback }}</span>
          </div>
        </div>
        <div class="field-box">
          <strong>摘要</strong>
          <span class="muted">{{ summaries.length }} 章</span>
          <div v-if="latestSummary" class="summary-editor">
            <label class="field-box">
              <span>摘要标题</span>
              <input v-model="summaryDraft.title" class="input" aria-label="摘要标题" />
            </label>
            <label class="field-box">
              <span>摘要正文</span>
              <textarea v-model="summaryDraft.summary" class="textarea" aria-label="摘要正文" />
            </label>
            <label class="field-box">
              <span>事实</span>
              <textarea v-model="summaryDraft.facts" class="textarea" aria-label="摘要事实" />
            </label>
            <label class="field-box">
              <span>未解线索</span>
              <textarea v-model="summaryDraft.unresolvedThreads" class="textarea" aria-label="摘要未解线索" />
            </label>
            <div class="row">
              <button class="ghost-button" type="button" :disabled="store.generating" @click="saveLatestSummary">
                保存摘要
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="store.generating || !(latestSummary.revisionHistory?.length)"
                @click="revertLatestSummary"
              >
                回退摘要
              </button>
            </div>
            <span class="muted">{{ latestSummary.revisionHistory?.length ?? 0 }} 次修订</span>
          </div>
        </div>
        <div class="field-box">
          <strong>书签</strong>
          <span class="muted">{{ bookmarkedMessages.length }} 条已标记消息</span>
          <div v-if="bookmarkedMessages.length" class="field-grid">
            <button
              v-for="message in bookmarkedMessages.slice(-4).reverse()"
              :key="message.id"
              class="ghost-button bookmark-jump"
              type="button"
              @click="searchQuery = message.content.slice(0, 24)"
            >
              {{ message.content.slice(0, 54) }}
            </button>
          </div>
        </div>
        <div class="field-box">
          <strong>关系变化</strong>
          <span class="muted">{{ relationshipDeltas.length }} 条已记录变化</span>
          <p v-if="relationshipDeltas.at(-1)" class="muted">
            {{ relationshipDeltas.at(-1)?.summary }} ({{ relationshipDeltas.at(-1)?.weight }})
          </p>
        </div>
        <div class="field-box">
          <strong>裁定</strong>
          <span class="muted">
            {{ dungeonMindConfig?.enabled ? `${fateChecks.length} 次检查 · ${dungeonMindConfig.dice} · ${labelFor(dungeonMindConfig.visibility)}` : "此故事线未启用" }}
          </span>
          <form v-if="dungeonMindConfig?.enabled" class="field-grid" aria-label="裁定检查" @submit.prevent="runFateFromDraft(false)">
            <label>
              意图
              <textarea
                v-model="fateDraft.intent"
                class="textarea compact"
                aria-label="裁定意图"
                placeholder="描述需要裁定的冒险行动"
              />
            </label>
            <label>
              属性
              <select v-model="fateDraft.attributeId" class="select" aria-label="裁定属性">
                <option v-for="attribute in fateAttributes" :key="attribute.id" :value="attribute.id">
                  {{ attribute.name }} (+{{ attribute.defaultValue }})
                </option>
              </select>
            </label>
            <label>
              技能
              <select v-model="fateDraft.skillId" class="select" aria-label="裁定技能">
                <option value="">无技能</option>
                <option v-for="skill in fateSkillOptions" :key="skill.id" :value="skill.id">
                  {{ skill.name }}
                </option>
              </select>
            </label>
            <label>
              难度档位
              <select v-model="fateDraft.difficultyBandIndex" class="select" aria-label="裁定难度档位">
                <option v-for="(band, bandIndex) in fateDifficultyBands" :key="`${band.label}-${band.target}`" :value="String(bandIndex)">
                  {{ band.label }} · {{ band.target }}
                </option>
              </select>
            </label>
            <div class="field-grid two-column-fields">
              <label>
                难度目标
                <input v-model.number="fateDraft.difficulty" class="input" aria-label="难度目标" type="number" min="2" max="100" />
              </label>
              <label>
                修正值
                <input v-model.number="fateDraft.modifier" class="input" aria-label="修正值" type="number" min="-20" max="50" />
              </label>
            </div>
            <label>
              种子
              <input v-model="fateDraft.seed" class="input" aria-label="裁定种子" placeholder="可选，用于复现结果" />
            </label>
            <div class="cluster">
              <button class="ghost-button" type="submit" :disabled="store.generating || chat.status !== 'active'">
                <Dices :size="15" />
                运行检查
              </button>
              <button class="secondary-button" type="button" :disabled="store.generating || chat.status !== 'active'" @click="runFateFromDraft(true)">
                <Sparkles :size="15" />
                检查并继续
              </button>
            </div>
          </form>
          <p v-if="fateFeedback" class="muted">{{ fateFeedback }}</p>
          <p v-if="lastFateCheck" class="muted">
            {{ lastFateCheck.intent }} · {{ labelFor(lastFateCheck.outcome) }} / 总计 {{ lastFateCheck.roll.total }}
          </p>
        </div>
      </aside>
    </div>
  </section>
  <section v-else class="page">
    <div class="panel">未找到聊天。</div>
  </section>
</template>

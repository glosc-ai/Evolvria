<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Archive, Bookmark, BookmarkCheck, Dices, Download, Film, Plus, RotateCcw, Save, ScrollText, Search, Send, Sparkles, Trash2, Undo2 } from "lucide-vue-next";
import { createMessageWindow } from "@/domain/chat-reducer";
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
const feed = ref<HTMLElement | null>(null);
const messagePageSize = 80;
const visibleMessageLimit = ref(messagePageSize);
const messageWindow = computed(() => createMessageWindow(messages.value, visibleMessageLimit.value, searchQuery.value));
const visibleMessages = computed(() => messageWindow.value.messages);
const latestPromptContractVersion = computed(() =>
  [...messages.value].reverse().find((message) => message.promptContractVersion)?.promptContractVersion ?? NARRATIVE_PROMPT_CONTRACT_VERSION,
);
const turnEstimate = computed(() => input.value.trim() ? store.estimateChatTurn(chatId.value, input.value.trim()) : undefined);
const budgetCheck = computed(() => input.value.trim() ? store.checkChatBudget(chatId.value, input.value.trim()) : { ok: true, reasons: [] });
const canRetry = computed(() => Boolean(chat.value && chat.value.status !== "archived" && !store.generating));
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
  { value: "say", label: "Say" },
  { value: "act", label: "Act" },
  { value: "ask", label: "Ask" },
  { value: "ooc", label: "OOC" },
];

watch(messages, async () => {
  await nextTick();
  feed.value?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
});

watch(chatId, () => {
  visibleMessageLimit.value = messagePageSize;
  searchQuery.value = "";
});

watch(searchQuery, () => {
  visibleMessageLimit.value = messagePageSize;
});

watch(latestSummary, (summary) => {
  summaryDraft.title = summary?.title ?? "";
  summaryDraft.summary = summary?.summary ?? "";
  summaryDraft.facts = summary?.facts.join("\n") ?? "";
  summaryDraft.unresolvedThreads = summary?.unresolvedThreads.join("\n") ?? "";
}, { immediate: true });

watch(activeArc, (arc) => {
  resetArcDraft(arc);
}, { immediate: true });

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
  arcFeedback.value = "Arc saved.";
}

function splitLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function loadOlderMessages() {
  visibleMessageLimit.value += messagePageSize;
}
</script>

<template>
  <section v-if="chat && storyline" class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">Chat Session</p>
        <h2>{{ chat.title }}</h2>
      </div>
      <div class="cluster">
        <RouterLink class="ghost-button" :to="`/scene/${chat.id}`">
          <Film :size="16" />
          Scene
        </RouterLink>
        <button class="ghost-button" :disabled="!visibleMessages.length" @click="exportVisibleMessages">
          <Download :size="16" />
          Export
        </button>
        <button class="ghost-button" :disabled="store.generating || chat.status !== 'active'" @click="store.summarizeChat(chat.id)">
          <ScrollText :size="16" />
          Summary
        </button>
        <button class="ghost-button" :disabled="store.generating || chat.status !== 'active' || !dungeonMindConfig?.enabled" @click="store.performFateCheck(chat.id)">
          <Dices :size="16" />
          Fate
        </button>
        <button class="ghost-button" :disabled="!canRetry" @click="store.retryLast(chat.id)">
          <RotateCcw :size="16" />
          Retry
        </button>
        <button class="ghost-button" :disabled="store.generating || chat.status !== 'active'" @click="archiveCurrentChat">
          <Archive :size="16" />
          Archive
        </button>
        <button class="secondary-button" :disabled="store.generating || chat.status !== 'active'" @click="store.continueChat(chat.id)">
          <Sparkles :size="16" />
          Continue
        </button>
      </div>
    </div>

    <div class="chat-layout">
      <div class="chat-feed">
        <div v-if="chat.status === 'archived'" class="message system" style="max-width: 100%; margin-bottom: 12px">
          This chat is archived. Restore it from Saves before sending new messages.
        </div>
        <div v-if="chat.status === 'error'" class="message system" style="max-width: 100%; margin-bottom: 12px">
          Provider failed. Your input is saved, so you can retry or switch to mock.
          <div class="cluster" style="margin-top: 10px">
            <button class="ghost-button" type="button" :disabled="store.generating" @click="switchToMockProvider">
              Switch to mock
            </button>
            <button class="ghost-button" type="button" :disabled="store.generating" @click="store.retryLast(chat.id)">
              Retry now
            </button>
          </div>
        </div>
        <label class="field-box chat-search">
          <span><Search :size="15" /> Search messages</span>
          <input v-model="searchQuery" class="input" placeholder="搜索对白、动作、角色回复或系统信息" />
        </label>
        <div ref="feed" class="message-list">
          <article v-if="messageWindow.hiddenCount" class="message system message-window-status">
            <span>Showing latest {{ visibleMessages.length }} of {{ messageWindow.totalCount }} messages.</span>
            <button class="ghost-button" type="button" @click="loadOlderMessages">
              Load {{ Math.min(messagePageSize, messageWindow.hiddenCount) }} older
            </button>
          </article>
          <article v-else-if="messageWindow.totalCount > messagePageSize && !messageWindow.searchActive" class="message system message-window-status">
            Showing all {{ messageWindow.totalCount }} messages.
          </article>
          <article v-else-if="messageWindow.searchActive" class="message system message-window-status">
            Search results: {{ messageWindow.totalCount }} message(s).
          </article>
          <article
            v-for="message in visibleMessages"
            :key="message.id"
            class="message"
            :class="message.role"
          >
            <div class="message-meta">
              <span>{{ message.role }}<template v-if="message.mode"> / {{ message.mode }}</template></span>
              <span class="message-meta-actions">
                {{ new Date(message.createdAt).toLocaleTimeString() }}
                <button
                  class="message-bookmark-button"
                  type="button"
                  :aria-label="message.bookmarkedAt ? 'Remove bookmark' : 'Bookmark message'"
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
          <article v-if="searchQuery && !visibleMessages.length" class="message system">No matching messages.</article>
          <article v-if="store.generating" class="message system">AI is writing the next beat...</article>
        </div>

        <form class="composer" @submit.prevent="send">
          <div class="mode-tabs" role="tablist" aria-label="Message mode">
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
              Send
            </button>
            <span class="muted small">Provider: {{ store.envelope.settings.provider.type }} / {{ store.envelope.settings.provider.model }}</span>
          </div>
          <div v-if="turnEstimate" class="budget-preview" :class="{ blocked: !budgetCheck.ok }">
            <span>Input {{ turnEstimate.inputTokens }} / {{ store.envelope.settings.budget.maxInputTokens }}</span>
            <span>Output {{ turnEstimate.outputTokens }} / {{ store.envelope.settings.budget.maxOutputTokens }}</span>
            <span>Cost {{ turnEstimate.estimatedCost.toFixed(6) }} / {{ store.envelope.settings.budget.maxEstimatedCostPerTurn.toFixed(6) }}</span>
          </div>
          <p v-if="!budgetCheck.ok" class="error-text">{{ budgetCheck.reasons.join(" ") }}</p>
        </form>
      </div>

      <aside class="panel field-grid">
        <div>
          <h3>Context</h3>
          <p class="muted">{{ storyline.summary }}</p>
        </div>
        <div class="field-box">
          <strong>Persona</strong>
          <span class="muted">{{ persona?.name }} - {{ persona?.description }}</span>
        </div>
        <div class="field-box">
          <strong>Scenario</strong>
          <span class="muted">{{ scenario?.title }}</span>
        </div>
        <div class="field-box">
          <strong>Cost</strong>
          <span class="muted">{{ Object.keys(store.envelope.entities.creditLedger).length }} local ledger entries</span>
          <span v-if="store.lastBudgetWarning" class="muted">{{ store.lastBudgetWarning }}</span>
          <span class="muted">Prompt contract {{ latestPromptContractVersion }}</span>
        </div>
        <div class="field-box">
          <strong>Checkpoints</strong>
          <span class="muted">{{ checkpoints.length }} rollback point(s)</span>
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
          <strong>Last excerpt</strong>
          <span class="muted">{{ store.lastChatExportPath }}</span>
        </div>
        <div v-if="activeArc" class="field-box">
          <strong>{{ activeArc.title }}</strong>
          <span class="muted">{{ activeArc.goal }}</span>
          <div class="tags">
            <span v-for="beat in activeArc.beats" :key="beat.id" class="tag">{{ beat.status }}: {{ beat.title }}</span>
          </div>
          <div class="summary-editor" aria-label="Arc editor">
            <label class="field-box">
              <span>Arc title</span>
              <input v-model="arcDraft.title" class="input" aria-label="Arc title" />
            </label>
            <label class="field-box">
              <span>Arc theme</span>
              <input v-model="arcDraft.theme" class="input" aria-label="Arc theme" />
            </label>
            <label class="field-box">
              <span>Arc goal</span>
              <textarea v-model="arcDraft.goal" class="textarea" aria-label="Arc goal" />
            </label>
            <label class="field-box">
              <span>Arc stakes</span>
              <textarea v-model="arcDraft.stakes" class="textarea" aria-label="Arc stakes" />
            </label>
            <label class="field-box">
              <span>Arc status</span>
              <select v-model="arcDraft.status" class="select" aria-label="Arc status">
                <option value="planned">planned</option>
                <option value="active">active</option>
                <option value="resolved">resolved</option>
                <option value="abandoned">abandoned</option>
              </select>
            </label>
            <div class="field-grid">
              <label v-for="(beat, beatIndex) in arcDraft.beats" :key="beat.id ?? beatIndex" class="field-box">
                <span>Beat {{ beatIndex + 1 }}</span>
                <input v-model="beat.title" class="input" :aria-label="`Arc beat ${beatIndex + 1} title`" />
                <select v-model="beat.status" class="select" :aria-label="`Arc beat ${beatIndex + 1} status`">
                  <option value="open">open</option>
                  <option value="done">done</option>
                  <option value="skipped">skipped</option>
                </select>
                <button class="ghost-button" type="button" :disabled="arcDraft.beats.length <= 1" @click="removeArcBeat(beatIndex)">
                  <Trash2 :size="15" />
                  Remove Beat
                </button>
              </label>
            </div>
            <div class="row">
              <button class="ghost-button" type="button" @click="addArcBeat">
                <Plus :size="15" />
                Add Beat
              </button>
              <button class="ghost-button" type="button" :disabled="store.generating" @click="saveActiveArc">
                <Save :size="15" />
                Save Arc
              </button>
            </div>
            <span v-if="arcFeedback" class="muted">{{ arcFeedback }}</span>
          </div>
        </div>
        <div class="field-box">
          <strong>Summaries</strong>
          <span class="muted">{{ summaries.length }} chapters</span>
          <div v-if="latestSummary" class="summary-editor">
            <label class="field-box">
              <span>Summary title</span>
              <input v-model="summaryDraft.title" class="input" aria-label="Summary title" />
            </label>
            <label class="field-box">
              <span>Summary text</span>
              <textarea v-model="summaryDraft.summary" class="textarea" aria-label="Summary text" />
            </label>
            <label class="field-box">
              <span>Facts</span>
              <textarea v-model="summaryDraft.facts" class="textarea" aria-label="Summary facts" />
            </label>
            <label class="field-box">
              <span>Open threads</span>
              <textarea v-model="summaryDraft.unresolvedThreads" class="textarea" aria-label="Summary open threads" />
            </label>
            <div class="row">
              <button class="ghost-button" type="button" :disabled="store.generating" @click="saveLatestSummary">
                Save Summary
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="store.generating || !(latestSummary.revisionHistory?.length)"
                @click="revertLatestSummary"
              >
                Revert Summary
              </button>
            </div>
            <span class="muted">{{ latestSummary.revisionHistory?.length ?? 0 }} revision(s)</span>
          </div>
        </div>
        <div class="field-box">
          <strong>Bookmarks</strong>
          <span class="muted">{{ bookmarkedMessages.length }} marked message(s)</span>
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
          <strong>Relationship Deltas</strong>
          <span class="muted">{{ relationshipDeltas.length }} recorded change(s)</span>
          <p v-if="relationshipDeltas.at(-1)" class="muted">
            {{ relationshipDeltas.at(-1)?.summary }} ({{ relationshipDeltas.at(-1)?.weight }})
          </p>
        </div>
        <div class="field-box">
          <strong>Fate</strong>
          <span class="muted">{{ fateChecks.length }} checks</span>
          <p v-if="fateChecks.at(-1)" class="muted">{{ fateChecks.at(-1)?.outcome }} / total {{ fateChecks.at(-1)?.roll.total }}</p>
        </div>
      </aside>
    </div>
  </section>
  <section v-else class="page">
    <div class="panel">Chat not found.</div>
  </section>
</template>

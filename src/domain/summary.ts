import { createId, nowIso } from "@/domain/ids";
import type { Arc, ArcBeat, CostEstimate, Message, RelationshipDelta, SummaryChapter, SummaryRevision } from "@/types/domain";

export type AutoSummaryReason = "message_interval" | "context_pressure" | "arc_state_change";

export interface AutoSummaryDecision {
  shouldSummarize: boolean;
  reason?: AutoSummaryReason;
  messages: Message[];
  narratableCount: number;
  contextPressureRatio: number;
}

export interface AutoSummaryInput {
  messages: Message[];
  summaries: SummaryChapter[];
  estimatedContext?: CostEstimate;
  maxInputTokens: number;
  activeArcBefore?: Arc;
  activeArcAfter?: Arc;
}

const messageInterval = 20;
const arcChangeMinMessages = 8;
const contextPressureThreshold = 0.7;

export function createSummaryChapter(chatId: string, messages: Message[], chapterNumber?: number): SummaryChapter {
  const narratable = messages.filter((message) => message.role !== "system");
  const first = narratable[0] ?? messages[0];
  const last = narratable[narratable.length - 1] ?? messages[messages.length - 1];
  const userActions = narratable.filter((message) => message.role === "user").slice(-5);
  const assistantFacts = narratable.filter((message) => message.role === "assistant" || message.role === "narrator" || message.role === "fate").slice(-5);
  const relationshipDeltas: RelationshipDelta[] = userActions.length
    ? [{
        sourceId: "persona",
        targetId: "active_cast",
        summary: "玩家持续参与让主要角色更愿意共享线索。",
        weight: Math.min(3, userActions.length),
      }]
    : [];

  return {
    id: createId("summary"),
    chatId,
    range: {
      fromMessageId: first?.id ?? "none",
      toMessageId: last?.id ?? "none",
    },
    title: `第 ${chapterNumber ?? Math.max(1, Math.ceil(narratable.length / 12))} 章：${deriveTitle(last?.content ?? "")}`,
    summary: buildSummaryText(userActions, assistantFacts),
    facts: assistantFacts.map((message) => compactFact(message.content)),
    relationshipDeltas,
    unresolvedThreads: deriveThreads(narratable),
    createdAt: nowIso(),
  };
}

export interface SummaryEditInput {
  title?: string;
  summary?: string;
  facts?: string[];
  unresolvedThreads?: string[];
  note?: string;
}

export interface ArcBeatEditInput {
  id?: string;
  title: string;
  status?: ArcBeat["status"];
  evidenceMessageIds?: string[];
}

export interface ArcEditInput {
  title?: string;
  theme?: string;
  goal?: string;
  stakes?: string;
  status?: Arc["status"];
  beats?: ArcBeatEditInput[];
}

export function editSummaryChapter(chapter: SummaryChapter, input: SummaryEditInput, editedAt = nowIso()): SummaryChapter {
  return {
    ...chapter,
    title: input.title?.trim() || chapter.title,
    summary: input.summary?.trim() || chapter.summary,
    facts: input.facts?.map((fact) => fact.trim()).filter(Boolean) ?? chapter.facts,
    unresolvedThreads: input.unresolvedThreads?.map((thread) => thread.trim()).filter(Boolean) ?? chapter.unresolvedThreads,
    updatedAt: editedAt,
    revisionHistory: [
      ...(chapter.revisionHistory ?? []),
      summaryRevisionFromChapter(chapter, editedAt, input.note || "手动编辑"),
    ].slice(-12),
  };
}

export function revertSummaryChapter(chapter: SummaryChapter, revisionId?: string, revertedAt = nowIso()): SummaryChapter {
  const revisions = chapter.revisionHistory ?? [];
  const revision = revisionId ? revisions.find((candidate) => candidate.id === revisionId) : revisions.at(-1);
  if (!revision) return chapter;
  return {
    ...chapter,
    summary: revision.summary,
    facts: revision.facts,
    relationshipDeltas: revision.relationshipDeltas,
    unresolvedThreads: revision.unresolvedThreads,
    updatedAt: revertedAt,
    revisionHistory: [
      ...revisions,
      summaryRevisionFromChapter(chapter, revertedAt, "回退检查点"),
    ].slice(-12),
  };
}

export function messagesSinceLastSummary(messages: Message[], summaries: SummaryChapter[]): Message[] {
  const latest = [...summaries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return messages;
  const lastSummarizedIndex = messages.findIndex((message) => message.id === latest.range.toMessageId);
  if (lastSummarizedIndex < 0) return messages;
  return messages.slice(lastSummarizedIndex + 1);
}

function summaryRevisionFromChapter(chapter: SummaryChapter, createdAt: string, note?: string): SummaryRevision {
  return {
    id: createId("sumrev"),
    summary: chapter.summary,
    facts: [...chapter.facts],
    relationshipDeltas: [...chapter.relationshipDeltas],
    unresolvedThreads: [...chapter.unresolvedThreads],
    createdAt,
    note,
  };
}

export function shouldCreateAutoSummary(input: AutoSummaryInput): AutoSummaryDecision {
  const messages = messagesSinceLastSummary(input.messages, input.summaries);
  const narratableCount = messages.filter((message) => message.role !== "system").length;
  const contextPressureRatio = input.maxInputTokens > 0 && input.estimatedContext
    ? input.estimatedContext.inputTokens / input.maxInputTokens
    : 0;

  if (!narratableCount) {
    return { shouldSummarize: false, messages, narratableCount, contextPressureRatio };
  }
  if (narratableCount >= messageInterval) {
    return { shouldSummarize: true, reason: "message_interval", messages, narratableCount, contextPressureRatio };
  }
  if (contextPressureRatio >= contextPressureThreshold && narratableCount >= 4) {
    return { shouldSummarize: true, reason: "context_pressure", messages, narratableCount, contextPressureRatio };
  }
  if (arcChanged(input.activeArcBefore, input.activeArcAfter) && narratableCount >= arcChangeMinMessages) {
    return { shouldSummarize: true, reason: "arc_state_change", messages, narratableCount, contextPressureRatio };
  }
  return { shouldSummarize: false, messages, narratableCount, contextPressureRatio };
}

export function createInitialArc(chatId: string, title: string, evidenceMessageIds: string[]): Arc {
  const now = nowIso();
  return {
    id: createId("arc"),
    chatId,
    title: `剧情弧：${title}`,
    theme: "发现、信任与第一道选择",
    goal: "确认当前异常的来源，并建立第一个可靠盟友。",
    stakes: "如果拖延，场景中的危机时钟会推进。",
    beats: [
      { id: createId("beat"), title: "抵达并确认异常", status: "done", evidenceMessageIds },
      { id: createId("beat"), title: "向主要角色取得第一条线索", status: "open", evidenceMessageIds: [] },
      { id: createId("beat"), title: "决定是否冒险触碰规则边界", status: "open", evidenceMessageIds: [] },
    ],
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

export function advanceArc(arc: Arc, evidenceMessageId: string): Arc {
  const firstOpenIndex = arc.beats.findIndex((candidate) => candidate.status === "open");
  const beats = arc.beats.map((beat, index) =>
    index === firstOpenIndex
      ? { ...beat, status: "done" as const, evidenceMessageIds: [...beat.evidenceMessageIds, evidenceMessageId] }
      : beat,
  );
  const hasOpen = beats.some((beat) => beat.status === "open");
  return {
    ...arc,
    beats,
    status: hasOpen ? "active" : "resolved",
    updatedAt: nowIso(),
  };
}

export function editArc(arc: Arc, input: ArcEditInput, editedAt = nowIso()): Arc {
  const beats = input.beats
    ? input.beats
      .map((beat) => ({
        id: beat.id?.trim() || createId("beat"),
        title: beat.title.trim(),
        status: beat.status ?? "open",
        evidenceMessageIds: beat.evidenceMessageIds?.map((id) => id.trim()).filter(Boolean) ?? [],
      }))
      .filter((beat) => beat.title)
    : arc.beats;

  return {
    ...arc,
    title: input.title?.trim() || arc.title,
    theme: input.theme?.trim() || arc.theme,
    goal: input.goal?.trim() || arc.goal,
    stakes: input.stakes?.trim() || arc.stakes,
    status: input.status ?? arc.status,
    beats,
    updatedAt: editedAt,
  };
}

function arcChanged(before?: Arc, after?: Arc): boolean {
  if (!before || !after) return false;
  if (before.status !== after.status) return true;
  const beforeBeatState = before.beats.map((beat) => `${beat.id}:${beat.status}:${beat.evidenceMessageIds.join(",")}`).join("|");
  const afterBeatState = after.beats.map((beat) => `${beat.id}:${beat.status}:${beat.evidenceMessageIds.join(",")}`).join("|");
  return beforeBeatState !== afterBeatState;
}

function deriveTitle(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 18) || "新的线索";
}

function buildSummaryText(userActions: Message[], assistantFacts: Message[]): string {
  if (!userActions.length && !assistantFacts.length) return "故事刚刚开始，尚无足够内容形成摘要。";
  const action = userActions.at(-1)?.content ?? "玩家观察局势";
  const fact = assistantFacts.at(-1)?.content ?? "场景保持待定";
  return `玩家最近的关键行动是：${action.slice(0, 90)}。叙事反馈显示：${fact.slice(0, 120)}。这些信息将作为后续上下文的压缩事实。`;
}

function compactFact(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 120);
}

function deriveThreads(messages: Message[]): string[] {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const threads = ["主要异常的源头仍未确认。"];
  if (lastUser) threads.push(`玩家意图待追踪：${lastUser.content.slice(0, 60)}`);
  return threads;
}

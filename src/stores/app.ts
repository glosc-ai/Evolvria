import { defineStore } from "pinia";
import { createLocalAccountSession, updateAccountAgeGate } from "@/domain/account";
import { applyCreditAdjustment, createCreditAdjustment } from "@/domain/billing";
import {
  appendUserMessage,
  createChatSession,
  createMessage,
  formatChatExcerptMarkdown,
  lastAssistantMessage,
  mergeNarrativeResponse,
  rollbackChatToCheckpoint,
  updateMessageSceneHint as updateMessageSceneHintDomain,
  type SceneHintEditInput,
} from "@/domain/chat-reducer";
import { prepareVersionForDraftEdit, resetModerationForDraftEdit } from "@/domain/content-version";
import { checkBudget, compactMessagesForBudget, estimateTurnCost, isRecoverableInputOverflow } from "@/domain/cost";
import { canMarkLocalReady, validateStorylinePackage, type ValidationIssue } from "@/domain/creator-validation";
import { recordEngagementStats } from "@/domain/engagement";
import { buildIndexes, createSeedEnvelope } from "@/domain/fixtures";
import { fateCheckToText, runFateCheck } from "@/domain/fate-engine";
import { createId, nowIso } from "@/domain/ids";
import { completeMockMediaGenerationJob, createMediaGenerationJob, failMediaGenerationJob, startMediaGenerationJob } from "@/domain/media-generation";
import { applyModerationReview, createModerationAppeal, createModerationStatus, postcheckNarrativeResponse, precheckContent, resolveModerationAppeal, type ModerationAppealOutcome, type ModerationReviewOutcome } from "@/domain/moderation";
import { createWorkspacePackage, readWorkspacePackage, verifyWorkspacePackage, type PackageVerificationReport } from "@/domain/package-verification";
import { duplicateStorylinePackage } from "@/domain/storyline-duplicate";
import { advanceArc, createInitialArc, createSummaryChapter, editArc, editSummaryChapter, revertSummaryChapter, shouldCreateAutoSummary, type ArcEditInput } from "@/domain/summary";
import type { ConflictResolution } from "@/domain/sync";
import { generateNarrative } from "@/services/ai";
import { generateTauriMediaThumbnail, importBrowserMedia, importTauriMedia, pickAndImportTauriMedia } from "@/services/media";
import {
  backupWorkspace,
  deleteSecret,
  exportWorkspace,
  importWorkspaceZip,
  listWorkspaceBackups,
  loadWorkspace,
  normalizeEnvelope,
  resetWorkspace,
  restoreWorkspaceBackup,
  saveSecret,
  saveWorkspace,
  verifyWorkspacePackageNative,
  type SecretDeleteResult,
  type SecretWriteResult,
} from "@/services/repositories/workspace";
import { localContentRepository, type ContentSearchQuery, type ContentSearchResult } from "@/services/repositories/content";
import { localSyncRepository } from "@/services/repositories/sync";
import type {
  AIProviderSettings,
  AccountAgeGate,
  Arc,
  BudgetSettings,
  Character,
  Chat,
  ContentRating,
  CreditAdjustment,
  DungeonMindConfig,
  MediaAsset,
  MediaGenerationKind,
  MediaGenerationJob,
  MediaVariant,
  Message,
  MessageMode,
  Persona,
  SaveEnvelope,
  Scenario,
  SyncOperationEntity,
  SyncOperationKind,
  Storyline,
} from "@/types/domain";

interface AppState {
  envelope: SaveEnvelope;
  ready: boolean;
  saving: boolean;
  generating: boolean;
  error?: string;
  lastExportPath?: string;
  lastChatExportPath?: string;
  lastImportMessage?: string;
  lastBackupMessage?: string;
  lastBudgetWarning?: string;
  lastPackageReport?: PackageVerificationReport;
  backupMetas: Awaited<ReturnType<typeof listWorkspaceBackups>>;
}

export const useAppStore = defineStore("app", {
  state: (): AppState => ({
    envelope: createSeedEnvelope(),
    ready: false,
    saving: false,
    generating: false,
    backupMetas: [],
  }),
  getters: {
    storylines: (state) => Object.values(state.envelope.entities.storylines).filter((story) => !story.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    trashedStorylines: (state) => Object.values(state.envelope.entities.storylines).filter((story) => story.deletedAt).sort((a, b) => (b.deletedAt ?? b.updatedAt).localeCompare(a.deletedAt ?? a.updatedAt)),
    characters: (state) => Object.values(state.envelope.entities.characters).filter((character) => !character.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    scenarios: (state) => Object.values(state.envelope.entities.scenarios).filter((scenario) => !scenario.deletedAt).sort((a, b) => a.order - b.order),
    personas: (state) => Object.values(state.envelope.entities.personas).filter((persona) => !persona.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    chats: (state) => Object.values(state.envelope.entities.chats).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    activeChats: (state) => Object.values(state.envelope.entities.chats).filter((chat) => chat.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    archivedChats: (state) =>
      Object.values(state.envelope.entities.chats)
        .filter((chat) => chat.status === "archived")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    moderationQueue: (state) => Object.values(state.envelope.entities.moderationCases).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    creatorEarnings: (state) => Object.values(state.envelope.entities.creatorEarnings).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ledgerEntries: (state) => Object.values(state.envelope.entities.creditLedger).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    creditAdjustments: (state) => Object.values(state.envelope.entities.creditAdjustments).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    mediaGenerationJobs: (state) => Object.values(state.envelope.entities.mediaGenerationJobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    syncOperations: (state) => Object.values(state.envelope.entities.syncOperations).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    openSyncConflicts: (state) =>
      Object.values(state.envelope.entities.syncConflicts)
        .filter((conflict) => conflict.status === "open")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  },
  actions: {
    async init() {
      if (this.ready) return;
      try {
        this.envelope = await loadWorkspace();
        this.backupMetas = await listWorkspaceBackups(this.envelope.workspace.id);
        this.ready = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        this.envelope = createSeedEnvelope();
        this.backupMetas = [];
        this.ready = true;
      }
    },
    getStoryline(id: string, includeDeleted = false): Storyline | undefined {
      const storyline = this.envelope.entities.storylines[id];
      if (!includeDeleted && storyline?.deletedAt) return undefined;
      return storyline;
    },
    getCharacter(id: string): Character | undefined {
      return this.envelope.entities.characters[id];
    },
    getScenario(id: string): Scenario | undefined {
      return this.envelope.entities.scenarios[id];
    },
    getChat(id: string): Chat | undefined {
      return this.envelope.entities.chats[id];
    },
    chatMessages(chatId: string): Message[] {
      const chat = this.getChat(chatId);
      return chat ? chat.messageIds.map((id) => this.envelope.entities.messages[id]).filter(Boolean) : [];
    },
    bookmarkedChatMessages(chatId: string): Message[] {
      return this.chatMessages(chatId).filter((message) => message.bookmarkedAt);
    },
    chatCheckpoints(chatId: string) {
      const chat = this.getChat(chatId);
      return chat ? chat.checkpointIds.map((id) => this.envelope.entities.chatCheckpoints[id]).filter(Boolean) : [];
    },
    chatSummaries(chatId: string) {
      return Object.values(this.envelope.entities.summaryChapters)
        .filter((summary) => summary.chatId === chatId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    chatFateChecks(chatId: string) {
      return Object.values(this.envelope.entities.fateChecks)
        .filter((check) => check.chatId === chatId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    chatArc(chatId: string) {
      const chat = this.getChat(chatId);
      return chat?.activeArcId ? this.envelope.entities.arcs[chat.activeArcId] : undefined;
    },
    storylineCharacters(storyline: Storyline): Character[] {
      return storyline.cast.map((cast) => this.getCharacter(cast.characterId)).filter((character): character is Character => Boolean(character && !character.deletedAt));
    },
    storylineScenarios(storyline: Storyline): Scenario[] {
      return storyline.scenarioIds.map((id) => this.getScenario(id)).filter((scenario): scenario is Scenario => Boolean(scenario && !scenario.deletedAt));
    },
    storylineMedia(storyline: Storyline): MediaAsset[] {
      return storyline.mediaIds.map((id) => this.envelope.entities.mediaAssets[id]).filter((asset): asset is MediaAsset => Boolean(asset && !asset.deletedAt));
    },
    validateStoryline(storylineId: string): ValidationIssue[] {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) return [{ field: "storyline", severity: "error", message: "Storyline not found." }];
      return validateStorylinePackage({
        storyline,
        characters: this.storylineCharacters(storyline),
        scenarios: this.storylineScenarios(storyline),
        mediaAssets: this.storylineMedia(storyline),
      });
    },
    searchContent(query: ContentSearchQuery = {}): ContentSearchResult {
      return localContentRepository.search(this.envelope, query);
    },
    async persist(reason = "autosave") {
      this.saving = true;
      this.envelope = {
        ...this.envelope,
        indexes: buildIndexes(this.envelope.entities),
        workspace: { ...this.envelope.workspace, updatedAt: nowIso() },
        audit: [
          ...this.envelope.audit,
          { id: createId("audit"), type: reason, message: `Saved workspace: ${reason}`, createdAt: nowIso() },
        ].slice(-80),
      };
      await saveWorkspace(this.envelope);
      this.saving = false;
    },
    async startStory(storylineId: string, input: {
      name: string;
      description: string;
      pronouns?: string;
      scenarioId?: string;
      personaId?: string;
      preferences?: Persona["preferences"];
      boundaries?: string[];
      privateNotes?: string;
    }): Promise<string> {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const scenario = this.getScenario(input.scenarioId || storyline.scenarioIds[0]);
      if (!scenario) throw new Error("scenario_not_found");
      const existingPersona = input.personaId ? this.envelope.entities.personas[input.personaId] : undefined;
      const now = nowIso();
      const persona: Persona = existingPersona
        ? { ...existingPersona, updatedAt: now }
        : {
            id: createId("persona"),
            name: input.name.trim() || "旅人",
            pronouns: input.pronouns,
            description: input.description.trim() || storyline.playerRole,
            preferences: input.preferences?.length ? input.preferences : [{ key: "pace", value: "balanced" }],
            boundaries: input.boundaries?.length ? input.boundaries : ["保持 SFW 默认边界", "不使用竞品角色或素材"],
            privateNotes: input.privateNotes?.trim() || undefined,
            createdAt: now,
            updatedAt: now,
          };
      const { chat, openingMessages } = createChatSession(
        storyline,
        scenario,
        persona,
        this.envelope.settings.provider.type,
        this.envelope.settings.provider.model,
        this.storylineCharacters(storyline),
      );
      const arc = createInitialArc(chat.id, scenario.title, openingMessages.map((message) => message.id));
      chat.activeArcId = arc.id;
      this.envelope.entities.personas[persona.id] = persona;
      this.envelope.entities.chats[chat.id] = chat;
      this.envelope.entities.arcs[arc.id] = arc;
      for (const message of openingMessages) {
        this.envelope.entities.messages[message.id] = message;
      }
      recordEngagementStats(this.envelope.entities, [
        storyline.id,
        scenario.id,
        ...this.storylineCharacters(storyline).map((character) => character.id),
      ], { starts: 1, playedAt: now });
      await this.persist("chat_start");
      return chat.id;
    },
    estimateChatTurn(chatId: string, content: string) {
      return estimateTurnCost(this.chatMessages(chatId), content, this.envelope.settings.budget.maxOutputTokens);
    },
    checkChatBudget(chatId: string, content: string) {
      const messages = this.chatMessages(chatId);
      const estimate = estimateTurnCost(messages, content, this.envelope.settings.budget.maxOutputTokens);
      const check = checkBudget(estimate, this.envelope.settings.budget);
      if (this.canRecoverContextOverflow(check, messages, content)) {
        return {
          ok: true,
          reasons: [`Input context ${estimate.inputTokens} tokens will be summarized before generation.`],
        };
      }
      return check;
    },
    canRecoverContextOverflow(check: ReturnType<typeof checkBudget>, messages: Message[], content: string) {
      if (!isRecoverableInputOverflow(check)) return false;
      const plan = compactMessagesForBudget(messages, content, this.envelope.settings.budget, this.envelope.settings.budget.maxOutputTokens);
      const userOnly = estimateTurnCost([], content, this.envelope.settings.budget.maxOutputTokens);
      const droppedNarratable = plan.droppedMessages.filter((message) => message.role !== "system").length;
      return plan.estimate.inputTokens <= this.envelope.settings.budget.maxInputTokens
        && userOnly.inputTokens <= this.envelope.settings.budget.maxInputTokens
        && droppedNarratable >= 4;
    },
    async sendMessage(chatId: string, content: string, mode: MessageMode = "say"): Promise<{ ok: boolean; reason?: string }> {
      const chat = this.getChat(chatId);
      if (!chat || !content.trim()) return { ok: false, reason: "empty_or_missing_chat" };
      if (chat.status !== "active") return { ok: false, reason: "chat_not_active" };
      const storyline = this.getStoryline(chat.storylineId);
      const scenario = this.getScenario(chat.scenarioId);
      const persona = this.envelope.entities.personas[chat.personaId];
      if (!storyline || !scenario || !persona) throw new Error("chat_context_missing");

      const previousMessages = this.chatMessages(chatId);
      const budgetCheck = checkBudget(estimateTurnCost(previousMessages, content.trim(), this.envelope.settings.budget.maxOutputTokens), this.envelope.settings.budget);
      const canCompactContext = this.canRecoverContextOverflow(budgetCheck, previousMessages, content.trim());
      if (!budgetCheck.ok && !canCompactContext) {
        this.lastBudgetWarning = budgetCheck.reasons.join(" ");
        const warning = createMessage(chat.id, "system", `预算拦截：${this.lastBudgetWarning}`, "ooc", undefined, {
          safetyFlags: ["none"],
        });
        this.envelope.entities.messages[warning.id] = warning;
        this.envelope.entities.chats[chat.id] = {
          ...chat,
          messageIds: [...chat.messageIds, warning.id],
          updatedAt: nowIso(),
        };
        await this.persist("budget_blocked");
        return { ok: false, reason: this.lastBudgetWarning };
      }
      this.lastBudgetWarning = undefined;
      const safetyFlags = precheckContent(content, this.envelope.settings.adultContentUnlocked);
      const { chat: chatWithUser, message: userMessage, checkpoint } = appendUserMessage(chat, content.trim(), mode, previousMessages);
      userMessage.safetyFlags = safetyFlags;
      this.envelope.entities.chats[chat.id] = chatWithUser;
      this.envelope.entities.chatCheckpoints[checkpoint.id] = checkpoint;
      this.envelope.entities.messages[userMessage.id] = userMessage;
      await this.persist("before_ai_request");

      if (safetyFlags.includes("blocked")) {
        const blocked = createMessage(chat.id, "system", "当前内容被本地安全边界拦截。你可以调整输入或在设置中查看分级选项。", "ooc", undefined, {
          safetyFlags,
        });
        this.envelope.entities.messages[blocked.id] = blocked;
        this.envelope.entities.chats[chat.id] = {
          ...chatWithUser,
          messageIds: [...chatWithUser.messageIds, blocked.id],
          updatedAt: nowIso(),
        };
        await this.persist("content_blocked");
        return { ok: false, reason: "content_blocked" };
      }

      this.generating = true;
      try {
        const generationMessages = this.prepareMessagesForGeneration(chat.id, userMessage.id, content.trim());
        const rawResponse = await generateNarrative({
          storyline,
          scenario,
          persona,
          characters: this.storylineCharacters(storyline),
          messages: generationMessages,
          summaryChapters: this.chatSummaries(chatId),
          activeArc: this.chatArc(chatId),
          fateChecks: this.chatFateChecks(chatId),
          provider: this.envelope.settings.provider,
          mode,
          userInput: content.trim(),
          adultContentUnlocked: this.envelope.settings.adultContentUnlocked,
        });
        const checkedResponse = postcheckNarrativeResponse(rawResponse, this.envelope.settings.adultContentUnlocked);
        const merged = mergeNarrativeResponse(this.envelope.entities.chats[chat.id], checkedResponse.response);
        this.envelope.entities.chats[chat.id] = merged.chat;
        for (const message of merged.messages) this.envelope.entities.messages[message.id] = message;
        recordEngagementStats(this.envelope.entities, [
          storyline.id,
          scenario.id,
          ...this.storylineCharacters(storyline).map((character) => character.id),
        ], { messages: 1 + merged.messages.length, playedAt: nowIso() });
        const activeArc = this.chatArc(chat.id);
        let activeArcAfter = activeArc;
        const firstAiMessage = merged.messages[0];
        if (activeArc && firstAiMessage && !checkedResponse.blocked) {
          activeArcAfter = advanceArc(activeArc, firstAiMessage.id);
          this.envelope.entities.arcs[activeArc.id] = activeArcAfter;
        }
        if (checkedResponse.blocked) {
          const caseId = createId("modcase");
          this.envelope.entities.moderationCases[caseId] = {
            id: caseId,
            targetType: "chat",
            targetId: chat.id,
            reason: `AI output post-check blocked: ${checkedResponse.flags.join(", ")}`,
            status: "open",
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
        }
        if (checkedResponse.response.usage) {
          const ledgerId = createId("ledger");
          this.envelope.entities.creditLedger[ledgerId] = {
            id: ledgerId,
            chatId,
            provider: this.envelope.settings.provider.type,
            model: this.envelope.settings.provider.model,
            operation: "chat",
            estimatedTokens: checkedResponse.response.usage.inputTokens + checkedResponse.response.usage.outputTokens,
            estimatedCost: checkedResponse.response.usage.estimatedCost,
            status: "estimated",
            adjustmentIds: [],
            currency: checkedResponse.response.usage.currency,
            createdAt: nowIso(),
          };
        }
        this.maybeCreateAutoSummary(chat.id, activeArc, activeArcAfter);
      } catch (error) {
        const failed = createMessage(chat.id, "system", `AI provider 暂时失败：${error instanceof Error ? error.message : String(error)}。已保留你的输入，可切换 mock 或重试。`, "ooc", undefined, {
          safetyFlags: ["none"],
        });
        const current = this.envelope.entities.chats[chat.id];
        this.envelope.entities.messages[failed.id] = failed;
        this.envelope.entities.chats[chat.id] = { ...current, status: "error", messageIds: [...current.messageIds, failed.id], updatedAt: nowIso() };
      } finally {
        this.generating = false;
        await this.persist("after_ai_request");
      }
      return { ok: true };
    },
    prepareMessagesForGeneration(chatId: string, currentUserMessageId: string, userInput: string): Message[] {
      const messagesForHistory = this.chatMessages(chatId).filter((message) => message.id !== currentUserMessageId);
      const estimate = estimateTurnCost(messagesForHistory, userInput, this.envelope.settings.budget.maxOutputTokens);
      const check = checkBudget(estimate, this.envelope.settings.budget);
      if (!isRecoverableInputOverflow(check)) return messagesForHistory;

      const plan = compactMessagesForBudget(messagesForHistory, userInput, this.envelope.settings.budget, this.envelope.settings.budget.maxOutputTokens);
      if (plan.estimate.inputTokens > this.envelope.settings.budget.maxInputTokens) {
        throw new Error("context_overflow");
      }
      if (!plan.compacted) return plan.messages;

      const latestSummary = this.chatSummaries(chatId).at(-1);
      const lastSummarizedIndex = latestSummary
        ? plan.droppedMessages.findIndex((message) => message.id === latestSummary.range.toMessageId)
        : -1;
      const droppedToSummarize = lastSummarizedIndex >= 0
        ? plan.droppedMessages.slice(lastSummarizedIndex + 1)
        : plan.droppedMessages;
      if (droppedToSummarize.filter((message) => message.role !== "system").length >= 4) {
        const summary = this.recordSummaryChapter(chatId, droppedToSummarize);
        if (summary) {
          this.lastBudgetWarning = `Context summarized before generation: ${summary.title}.`;
          this.envelope.audit = [
            ...this.envelope.audit,
            {
              id: createId("audit"),
              type: "context_compacted",
              message: `Compacted ${droppedToSummarize.length} older messages before AI generation.`,
              createdAt: nowIso(),
            },
          ].slice(-80);
        }
      }
      return plan.messages;
    },
    async continueChat(chatId: string) {
      const chat = this.getChat(chatId);
      if (!chat || chat.status !== "active") return;
      await this.sendMessage(chatId, "请根据当前局势自然推进下一幕，并给我一个可以选择的行动线索。", "ask");
    },
    async summarizeChat(chatId: string) {
      const messages = this.chatMessages(chatId);
      if (!messages.length) return;
      this.recordSummaryChapter(chatId, messages);
      await this.persist("summary_created");
    },
    recordSummaryChapter(chatId: string, messages: Message[]) {
      if (!messages.length) return;
      const chapterNumber = this.chatSummaries(chatId).length + 1;
      const summary = createSummaryChapter(chatId, messages, chapterNumber);
      this.envelope.entities.summaryChapters[summary.id] = summary;
      const ledgerId = createId("ledger");
      this.envelope.entities.creditLedger[ledgerId] = {
        id: ledgerId,
        chatId,
        provider: this.envelope.settings.provider.type,
        model: this.envelope.settings.provider.model,
        operation: "summary",
        estimatedTokens: summary.summary.length,
        estimatedCost: 0,
        status: "estimated",
        adjustmentIds: [],
        currency: "local_estimate",
        createdAt: nowIso(),
      };
      return summary;
    },
    async updateSummaryChapter(summaryId: string, input: { title?: string; summary?: string; facts?: string[]; unresolvedThreads?: string[] }) {
      const chapter = this.envelope.entities.summaryChapters[summaryId];
      if (!chapter) throw new Error("summary_not_found");
      this.envelope.entities.summaryChapters[summaryId] = editSummaryChapter(chapter, {
        ...input,
        note: "Manual summary edit from Chat",
      });
      await this.persist("summary_updated");
    },
    async revertSummaryChapter(summaryId: string) {
      const chapter = this.envelope.entities.summaryChapters[summaryId];
      if (!chapter) throw new Error("summary_not_found");
      this.envelope.entities.summaryChapters[summaryId] = revertSummaryChapter(chapter);
      await this.persist("summary_reverted");
    },
    async updateArc(arcId: string, input: ArcEditInput) {
      const arc = this.envelope.entities.arcs[arcId];
      if (!arc) throw new Error("arc_not_found");
      this.envelope.entities.arcs[arcId] = editArc(arc, input);
      const chat = this.envelope.entities.chats[arc.chatId];
      if (chat) {
        this.envelope.entities.chats[chat.id] = {
          ...chat,
          updatedAt: nowIso(),
        };
      }
      await this.persist("arc_updated");
    },
    maybeCreateAutoSummary(chatId: string, activeArcBefore?: Arc, activeArcAfter?: Arc) {
      const before = activeArcBefore ?? this.chatArc(chatId);
      const after = activeArcAfter ?? this.chatArc(chatId);
      const messages = this.chatMessages(chatId);
      const decision = shouldCreateAutoSummary({
        messages,
        summaries: this.chatSummaries(chatId),
        estimatedContext: estimateTurnCost(messages, "", this.envelope.settings.budget.maxOutputTokens),
        maxInputTokens: this.envelope.settings.budget.maxInputTokens,
        activeArcBefore: before,
        activeArcAfter: after,
      });
      if (!decision.shouldSummarize) return;
      const summary = this.recordSummaryChapter(chatId, decision.messages);
      if (summary) {
        this.envelope.audit = [
          ...this.envelope.audit,
          {
            id: createId("audit"),
            type: "auto_summary_created",
            message: `Created ${summary.title} by ${decision.reason}.`,
            createdAt: nowIso(),
          },
        ].slice(-80);
      }
    },
    async performFateCheck(chatId: string, intent?: string) {
      const chat = this.getChat(chatId);
      if (!chat || chat.status !== "active") return;
      const storyline = this.getStoryline(chat.storylineId);
      if (!storyline?.dungeonMindConfigId) return;
      const config = this.envelope.entities.dungeonMindConfigs[storyline.dungeonMindConfigId];
      if (!config?.enabled) return;
      const messages = this.chatMessages(chatId);
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const check = runFateCheck({
        chatId,
        actorId: chat.personaId,
        intent: intent?.trim() || lastUser?.content || "尝试推进当前行动",
        config,
        seed: `${chatId}:${messages.length}:${lastUser?.id ?? "manual"}`,
      });
      const message = createMessage(chatId, "fate", fateCheckToText(check), "act", undefined, {
        safetyFlags: ["none"],
      });
      this.envelope.entities.fateChecks[check.id] = check;
      this.envelope.entities.messages[message.id] = message;
      this.envelope.entities.chats[chatId] = {
        ...chat,
        messageIds: [...chat.messageIds, message.id],
        updatedAt: nowIso(),
      };
      const activeArc = this.chatArc(chatId);
      if (activeArc) {
        this.envelope.entities.arcs[activeArc.id] = advanceArc(activeArc, message.id);
      }
      await this.persist("fate_check_created");
    },
    async retryLast(chatId: string) {
      const chat = this.getChat(chatId);
      if (!chat || chat.status === "archived") return;
      const messages = this.chatMessages(chatId);
      const last = lastAssistantMessage(messages);
      const previousUser = [...messages].reverse().find((message) => message.role === "user");
      if (!last || !previousUser) return;
      const storyline = this.getStoryline(chat.storylineId);
      const scenario = this.getScenario(chat.scenarioId);
      const persona = this.envelope.entities.personas[chat.personaId];
      if (!storyline || !scenario || !persona) return;
      this.generating = true;
      try {
        const rawResponse = await generateNarrative({
          storyline,
          scenario,
          persona,
          characters: this.storylineCharacters(storyline),
          messages: messages.filter((message) => message.id !== last.id),
          summaryChapters: this.chatSummaries(chatId),
          activeArc: this.chatArc(chatId),
          fateChecks: this.chatFateChecks(chatId),
          provider: this.envelope.settings.provider,
          mode: previousUser.mode ?? "say",
          userInput: `${previousUser.content}\n\n请换一种走向重试，但保留已经发生的事实。`,
          adultContentUnlocked: this.envelope.settings.adultContentUnlocked,
        });
        const checkedResponse = postcheckNarrativeResponse(rawResponse, this.envelope.settings.adultContentUnlocked);
        const merged = mergeNarrativeResponse({ ...chat, status: "active" }, checkedResponse.response, last?.id);
        this.envelope.entities.chats[chat.id] = { ...merged.chat, status: "active" };
        for (const message of merged.messages) this.envelope.entities.messages[message.id] = message;
        recordEngagementStats(this.envelope.entities, [
          storyline.id,
          scenario.id,
          ...this.storylineCharacters(storyline).map((character) => character.id),
        ], { messages: merged.messages.length, playedAt: nowIso() });
        this.maybeCreateAutoSummary(chat.id);
        if (checkedResponse.blocked) {
          const caseId = createId("modcase");
          this.envelope.entities.moderationCases[caseId] = {
            id: caseId,
            targetType: "chat",
            targetId: chat.id,
            reason: `AI retry output post-check blocked: ${checkedResponse.flags.join(", ")}`,
            status: "open",
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
        }
      } catch (error) {
        const failed = createMessage(chat.id, "system", `重试仍然失败：${error instanceof Error ? error.message : String(error)}。可切换 mock 后再试。`, "ooc", undefined, {
          safetyFlags: ["none"],
        });
        const current = this.envelope.entities.chats[chat.id];
        this.envelope.entities.messages[failed.id] = failed;
        this.envelope.entities.chats[chat.id] = { ...current, status: "error", messageIds: [...current.messageIds, failed.id], updatedAt: nowIso() };
      } finally {
        this.generating = false;
        await this.persist("retry_ai_response");
      }
    },
    async rollbackToCheckpoint(chatId: string, checkpointId: string) {
      const chat = this.getChat(chatId);
      const checkpoint = this.envelope.entities.chatCheckpoints[checkpointId];
      if (!chat || !checkpoint || checkpoint.chatId !== chatId) return;
      const rollbackMessage = createMessage(
        chatId,
        "system",
        `已回滚到 checkpoint：${checkpoint.label}。后续消息仍保留在存档实体中，但已从当前分支移除。`,
        "ooc",
        undefined,
        { safetyFlags: ["none"] },
      );
      const retainedIds = new Set(chat.messageIds.slice(0, checkpoint.messageIndex));
      retainedIds.add(rollbackMessage.id);
      this.envelope.entities.messages[rollbackMessage.id] = rollbackMessage;
      this.envelope.entities.chats[chatId] = rollbackChatToCheckpoint(chat, checkpoint, rollbackMessage.id);
      pruneChatDerivedState(this.envelope, chatId, checkpoint.createdAt, retainedIds);
      await this.persist("chat_rolled_back");
    },
    async toggleMessageBookmark(messageId: string) {
      const message = this.envelope.entities.messages[messageId];
      if (!message) return;
      this.envelope.entities.messages[messageId] = message.bookmarkedAt
        ? { ...message, bookmarkedAt: undefined, bookmarkNote: undefined }
        : { ...message, bookmarkedAt: nowIso() };
      await this.persist("message_bookmark_toggled");
    },
    async updateMessageSceneHint(messageId: string, input: SceneHintEditInput) {
      const message = this.envelope.entities.messages[messageId];
      if (!message) throw new Error("message_not_found");
      this.envelope.entities.messages[messageId] = updateMessageSceneHintDomain(message, input);
      const chat = this.envelope.entities.chats[message.chatId];
      if (chat) {
        this.envelope.entities.chats[chat.id] = {
          ...chat,
          updatedAt: nowIso(),
        };
      }
      await this.persist("scene_hint_updated");
    },
    async archiveChat(chatId: string) {
      const chat = this.getChat(chatId);
      if (!chat || chat.status === "archived") return;
      await this.backup(`archive_${chatId}`);
      const message = createMessage(
        chatId,
        "system",
        "Chat archived. It remains recoverable from Saves and is no longer treated as the active Continue session.",
        "ooc",
        undefined,
        { safetyFlags: ["none"] },
      );
      this.envelope.entities.messages[message.id] = message;
      this.envelope.entities.chats[chatId] = {
        ...chat,
        status: "archived",
        messageIds: [...chat.messageIds, message.id],
        updatedAt: nowIso(),
      };
      await this.persist("chat_archived");
    },
    async restoreChat(chatId: string) {
      const chat = this.getChat(chatId);
      if (!chat || chat.status === "active") return;
      this.envelope.entities.chats[chatId] = {
        ...chat,
        status: "active",
        updatedAt: nowIso(),
      };
      await this.persist("chat_restored");
    },
    async exportChatExcerpt(chatId: string, messageIds?: string[]) {
      const chat = this.getChat(chatId);
      if (!chat) return;
      const storyline = this.getStoryline(chat.storylineId);
      const persona = this.envelope.entities.personas[chat.personaId];
      const selected = messageIds?.length
        ? messageIds.map((id) => this.envelope.entities.messages[id]).filter((message): message is Message => Boolean(message))
        : this.chatMessages(chatId);
      const markdown = formatChatExcerptMarkdown({
        title: chat.title,
        storylineTitle: storyline?.title,
        personaName: persona?.name,
        messages: selected,
      });
      const fileName = `${chat.title.replace(/[^\w\u4e00-\u9fa5-]+/g, "-")}-excerpt.md`;
      downloadTextFile(fileName, markdown, "text/markdown;charset=utf-8");
      this.lastChatExportPath = fileName;
      await this.persist("chat_excerpt_exported");
    },
    async createStorylineDraft(input: { title: string; tagline: string; summary: string; characterName: string; opening: string }): Promise<string> {
      const now = nowIso();
      const characterId = createId("char");
      const scenarioId = createId("scenario");
      const storylineId = createId("story");
      const character: Character = {
        id: characterId,
        type: "character",
        name: input.characterName.trim() || "未命名角色",
        subtitle: "本地草稿角色",
        summary: "由 Creator Studio 创建的原创角色。",
        profile: "这是一个本地原创角色。请在后续编辑中补充动机、边界和说话风格。",
        voice: {
          tone: "自然、克制、有叙事感。",
          cadence: "中等长度句子。",
          catchphrases: [],
          forbiddenPhrases: ["我是一个 AI"],
          language: "zh-CN",
        },
        goals: ["推动故事开场"],
        boundaries: ["保持原创，不复制第三方角色"],
        tags: ["草稿"],
        mediaIds: [],
        defaultScenarioIds: [scenarioId],
        moderation: createModerationStatus("SFW", "draft"),
        visibility: "private",
        createdBy: { id: "creator_local", name: "Local Creator" },
        createdAt: now,
        updatedAt: now,
      };
      const storyline: Storyline = {
        id: storylineId,
        type: "storyline",
        title: input.title.trim() || "未命名故事线",
        tagline: input.tagline.trim() || "一个等待开场的原创故事。",
        summary: input.summary.trim() || "这是由本地创作者创建的故事线草稿。",
        premise: input.summary.trim() || "玩家即将进入一个由你定义的世界。",
        playerRole: "可自定义的玩家身份",
        worldRules: ["保持原创设定", "重要事实必须通过消息和摘要保存"],
        tags: ["原创", "草稿"],
        language: "zh-CN",
        rating: "SFW",
        cast: [{ characterId, role: "主要角色", relationshipSeed: "等待玩家建立关系。", visibility: "always" }],
        scenarioIds: [scenarioId],
        mediaIds: [],
        supportedModes: ["chat"],
        moderation: createModerationStatus("SFW", "draft"),
        visibility: "private",
        version: { version: "0.1.0", changelog: "本地草稿创建。", status: "draft" },
        createdBy: { id: "creator_local", name: "Local Creator" },
        createdAt: now,
        updatedAt: now,
      };
      const scenario: Scenario = {
        id: scenarioId,
        storylineId,
        title: "初始场景",
        summary: "本地创作的开场。",
        opening: input.opening.trim() || "场景尚未完全写好，但故事已经准备回应你。",
        participatingCharacterIds: [characterId],
        trigger: { type: "default" },
        initialState: {},
        order: 1,
        createdAt: now,
        updatedAt: now,
      };
      localContentRepository.saveCharacter(this.envelope, character);
      localContentRepository.saveStoryline(this.envelope, storyline);
      localContentRepository.saveScenario(this.envelope, scenario);
      await this.persist("creator_draft_created");
      return storylineId;
    },
    async duplicateStorylineAsDraft(storylineId: string): Promise<string> {
      const duplicated = duplicateStorylinePackage(this.envelope.entities, storylineId);
      for (const character of duplicated.characters) {
        localContentRepository.saveCharacter(this.envelope, character);
      }
      for (const scenario of duplicated.scenarios) {
        localContentRepository.saveScenario(this.envelope, scenario);
      }
      if (duplicated.dungeonMindConfig) {
        this.envelope.entities.dungeonMindConfigs[duplicated.dungeonMindConfig.id] = duplicated.dungeonMindConfig;
      }
      localContentRepository.saveStoryline(this.envelope, duplicated.storyline);
      await this.persist("storyline_duplicated");
      return duplicated.storyline.id;
    },
    async trashStorylinePackage(storylineId: string) {
      const deletedAt = nowIso();
      const storyline = localContentRepository.softDeleteStorylinePackage(this.envelope, storylineId, deletedAt);
      if (!storyline) throw new Error("storyline_not_found");
      await this.queueSyncOperation("storylines", storylineId, "delete", { deletedAt });
      await this.persist("storyline_trashed");
    },
    async restoreStorylinePackage(storylineId: string) {
      const restoredAt = nowIso();
      const storyline = localContentRepository.restoreStorylinePackage(this.envelope, storylineId, restoredAt);
      if (!storyline) throw new Error("storyline_not_found");
      await this.queueSyncOperation("storylines", storylineId, "update", { deletedAt: null, restoredAt });
      await this.persist("storyline_restored");
    },
    async updateStorylineDraft(input: {
      id: string;
      title: string;
      tagline: string;
      summary: string;
      premise: string;
      playerRole: string;
      worldRules: string;
      tags: string;
      rating: ContentRating;
      version?: string;
      changelog?: string;
    }) {
      const storyline = this.getStoryline(input.id);
      if (!storyline) throw new Error("storyline_not_found");
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        title: input.title.trim() || storyline.title,
        tagline: input.tagline.trim(),
        summary: input.summary.trim(),
        premise: input.premise.trim() || input.summary.trim(),
        playerRole: input.playerRole.trim() || storyline.playerRole,
        worldRules: splitList(input.worldRules),
        tags: splitList(input.tags),
        rating: input.rating,
        moderation: resetModerationForDraftEdit(storyline.moderation, input.rating),
        version: prepareVersionForDraftEdit(storyline.version, { version: input.version, changelog: input.changelog }),
        updatedAt: nowIso(),
      });
      await this.persist("storyline_draft_updated");
    },
    async updateDungeonMindConfig(input: {
      storylineId: string;
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
    }) {
      const storyline = this.getStoryline(input.storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const existing = storyline.dungeonMindConfigId ? this.envelope.entities.dungeonMindConfigs[storyline.dungeonMindConfigId] : undefined;
      const now = nowIso();
      const configId = existing?.id ?? createId("dm");
      const attributeId = existing?.attributes[0]?.id ?? createId("attr");
      const skillId = existing?.skills[0]?.id ?? createId("skill");
      const consequenceId = existing?.consequenceRules[0]?.id ?? createId("consequence");
      const config: DungeonMindConfig = {
        id: configId,
        storylineId: storyline.id,
        enabled: input.enabled,
        dice: input.dice,
        visibility: input.visibility,
        attributes: [
          {
            id: attributeId,
            name: input.attributeName.trim() || existing?.attributes[0]?.name || "Resolve",
            description: input.attributeDescription.trim() || existing?.attributes[0]?.description || "General pressure, focus, and risk handling.",
            defaultValue: Number.isFinite(input.attributeDefaultValue) ? Number(input.attributeDefaultValue) : existing?.attributes[0]?.defaultValue ?? 1,
          },
        ],
        skills: [
          {
            id: skillId,
            name: input.skillName.trim() || existing?.skills[0]?.name || "Read the Scene",
            attributeId,
            description: input.skillDescription.trim() || existing?.skills[0]?.description || "Notice details before acting.",
          },
        ],
        difficultyTable: [
          { label: "容易", target: clampDifficulty(input.difficultyEasy, 2, 100, existing?.difficultyTable[0]?.target ?? 8) },
          { label: "标准", target: clampDifficulty(input.difficultyStandard, 2, 100, existing?.difficultyTable[1]?.target ?? 12) },
          { label: "困难", target: clampDifficulty(input.difficultyHard, 2, 100, existing?.difficultyTable[2]?.target ?? 16) },
        ],
        consequenceRules: [
          {
            id: consequenceId,
            label: input.consequenceLabel.trim() || existing?.consequenceRules[0]?.label || "Pressure Clock",
            description: input.consequenceDescription.trim() || existing?.consequenceRules[0]?.description || "On a miss, advance a local danger or cost.",
          },
        ],
      };
      this.envelope.entities.dungeonMindConfigs[configId] = config;
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        dungeonMindConfigId: configId,
        supportedModes: input.enabled
          ? [...new Set([...storyline.supportedModes, "fate" as const])]
          : storyline.supportedModes.filter((mode) => mode !== "fate"),
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : "Updated Fate Engine rules.",
        }),
        updatedAt: now,
      });
      await this.persist("dungeon_mind_config_updated");
    },
    async updatePrimaryCharacter(input: { storylineId: string; name: string; summary: string; profile: string; tone: string; goals: string }) {
      const storyline = this.getStoryline(input.storylineId);
      const characterId = storyline?.cast[0]?.characterId;
      const character = characterId ? this.getCharacter(characterId) : undefined;
      if (!storyline || !character) throw new Error("character_not_found");
      localContentRepository.saveCharacter(this.envelope, {
        ...character,
        name: input.name.trim() || character.name,
        summary: input.summary.trim() || character.summary,
        profile: input.profile.trim() || character.profile,
        voice: {
          ...character.voice,
          tone: input.tone.trim() || character.voice.tone,
        },
        goals: splitList(input.goals),
        moderation: resetModerationForDraftEdit(character.moderation, storyline.rating),
        updatedAt: nowIso(),
      });
      await this.persist("character_draft_updated");
    },
    async addCharacterToStoryline(input: {
      storylineId: string;
      name: string;
      subtitle?: string;
      summary: string;
      profile: string;
      tone: string;
      goals: string;
      role: string;
      relationshipSeed: string;
    }) {
      const storyline = this.getStoryline(input.storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const now = nowIso();
      const id = createId("char");
      const character: Character = {
        id,
        type: "character",
        name: input.name.trim() || "未命名角色",
        subtitle: input.subtitle?.trim() || "本地新增角色",
        summary: input.summary.trim() || "由 Creator Studio 添加的原创角色。",
        profile: input.profile.trim() || "这是一个本地原创角色。请补充身份、动机、冲突和边界。",
        voice: {
          tone: input.tone.trim() || "自然、有辨识度。",
          cadence: "中等长度句子。",
          catchphrases: [],
          forbiddenPhrases: ["我是一个 AI", "作为语言模型"],
          language: storyline.language,
        },
        goals: splitList(input.goals),
        boundaries: ["保持原创，不复制第三方角色", "尊重故事线分级"],
        tags: ["原创", "草稿"],
        mediaIds: [],
        defaultScenarioIds: [...storyline.scenarioIds],
        moderation: createModerationStatus(storyline.rating, "draft"),
        visibility: "private",
        createdBy: storyline.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      localContentRepository.saveCharacter(this.envelope, character);
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        cast: [
          ...storyline.cast,
          {
            characterId: id,
            role: input.role.trim() || "配角",
            relationshipSeed: input.relationshipSeed.trim() || "等待玩家在故事中建立关系。",
            visibility: "always",
          },
        ],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : "Added a new local character draft.",
        }),
        updatedAt: now,
      });
      for (const scenarioId of storyline.scenarioIds) {
        const scenario = this.envelope.entities.scenarios[scenarioId];
        if (!scenario || scenario.participatingCharacterIds.includes(id)) continue;
        localContentRepository.saveScenario(this.envelope, {
          ...scenario,
          participatingCharacterIds: [...scenario.participatingCharacterIds, id],
          updatedAt: now,
        });
      }
      await this.persist("character_added");
      return id;
    },
    async updatePrimaryScenario(input: { storylineId: string; title: string; summary: string; opening: string; location: string }) {
      const storyline = this.getStoryline(input.storylineId);
      const scenarioId = storyline?.scenarioIds[0];
      const scenario = scenarioId ? this.getScenario(scenarioId) : undefined;
      if (!scenario) throw new Error("scenario_not_found");
      localContentRepository.saveScenario(this.envelope, {
        ...scenario,
        title: input.title.trim() || scenario.title,
        summary: input.summary.trim() || scenario.summary,
        opening: input.opening.trim() || scenario.opening,
        location: input.location.trim() || scenario.location,
        updatedAt: nowIso(),
      });
      await this.persist("scenario_draft_updated");
    },
    async addScenarioToStoryline(input: { storylineId: string; title: string; summary: string; opening: string; location?: string }) {
      const storyline = this.getStoryline(input.storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const id = createId("scenario");
      const now = nowIso();
      const scenario: Scenario = {
        id,
        storylineId: storyline.id,
        title: input.title.trim() || `Scenario ${storyline.scenarioIds.length + 1}`,
        summary: input.summary.trim() || "A new playable entrance for this storyline.",
        opening: input.opening.trim() || "新的场景入口已经准备好回应玩家。",
        location: input.location?.trim() || undefined,
        participatingCharacterIds: storyline.cast.map((cast) => cast.characterId),
        trigger: { type: "manual" },
        initialState: {},
        order: storyline.scenarioIds.length + 1,
        createdAt: now,
        updatedAt: now,
      };
      localContentRepository.saveScenario(this.envelope, scenario);
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        scenarioIds: [...storyline.scenarioIds, id],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : "Added a new local scenario draft.",
        }),
        updatedAt: now,
      });
      await this.persist("scenario_added");
      return id;
    },
    async importMediaForStoryline(storylineId: string, file: File, purpose: MediaAsset["purpose"] = "cover") {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const asset = await importBrowserMedia(file, purpose);
      this.envelope.entities.mediaAssets[asset.id] = asset;
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        mediaIds: [...new Set([...storyline.mediaIds, asset.id])],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : "Imported local media asset.",
        }),
        updatedAt: nowIso(),
      });
      await this.persist("media_imported");
      return asset.id;
    },
    async importNativeMediaForStoryline(storylineId: string, path: string, purpose: MediaAsset["purpose"] = "cover"): Promise<string | undefined> {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const asset = await importTauriMedia(this.envelope.workspace.id, path.trim(), purpose);
      if (!asset) return undefined;
      await this.attachMediaAssetToStoryline(storyline, asset, "native_media_imported", "Imported native media asset.");
      return asset.id;
    },
    async pickNativeMediaForStoryline(storylineId: string, purpose: MediaAsset["purpose"] = "cover"): Promise<string | undefined> {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      const asset = await pickAndImportTauriMedia(this.envelope.workspace.id, purpose);
      if (!asset) return undefined;
      await this.attachMediaAssetToStoryline(storyline, asset, "native_media_picked", "Picked native media asset.");
      return asset.id;
    },
    async attachMediaAssetToStoryline(storyline: Storyline, asset: MediaAsset, persistReason: string, changelog: string) {
      this.envelope.entities.mediaAssets[asset.id] = asset;
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        mediaIds: [...new Set([...storyline.mediaIds, asset.id])],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : changelog,
        }),
        updatedAt: nowIso(),
      });
      await this.persist(persistReason);
    },
    mediaGenerationJobsForMessage(messageId: string): MediaGenerationJob[] {
      return Object.values(this.envelope.entities.mediaGenerationJobs)
        .filter((job) => job.messageId === messageId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async queueMediaGenerationJob(input: {
      kind: MediaGenerationKind;
      storylineId: string;
      chatId?: string;
      messageId?: string;
      speakerId?: string;
      prompt: string;
      style?: string;
      voiceText?: string;
    }) {
      const storyline = this.getStoryline(input.storylineId, true);
      if (!storyline) throw new Error("storyline_not_found");
      const textForSafety = [input.prompt, input.style, input.voiceText].filter(Boolean).join("\n");
      const safetyFlags = storyline.rating === "AdultLocked" && !this.envelope.settings.adultContentUnlocked
        ? ["adult_locked" as const, "blocked" as const]
        : precheckContent(textForSafety, this.envelope.settings.adultContentUnlocked);
      const job = createMediaGenerationJob({
        ...input,
        provider: this.envelope.settings.provider.type,
        model: this.envelope.settings.provider.model,
        safetyFlags,
      });
      this.envelope.entities.mediaGenerationJobs[job.id] = job;
      await this.persist("media_generation_queued");
      return job.id;
    },
    async runMockMediaGenerationJob(jobId: string) {
      const job = this.envelope.entities.mediaGenerationJobs[jobId];
      if (!job || job.status === "blocked") return;
      const running = startMediaGenerationJob(job);
      this.envelope.entities.mediaGenerationJobs[jobId] = running;
      try {
        const completed = completeMockMediaGenerationJob(running);
        this.envelope.entities.mediaGenerationJobs[jobId] = completed.job;
        this.envelope.entities.mediaAssets[completed.asset.id] = completed.asset;
        this.envelope.entities.creditLedger[completed.ledgerEntry.id] = completed.ledgerEntry;
        this.attachGeneratedAssetToStoryline(completed.job, completed.asset);
        this.attachGeneratedAssetToScene(completed.job, completed.asset);
        await this.persist("media_generation_completed");
        return completed.asset.id;
      } catch (error) {
        this.envelope.entities.mediaGenerationJobs[jobId] = failMediaGenerationJob(running, error instanceof Error ? error.message : String(error));
        await this.persist("media_generation_failed");
      }
    },
    attachGeneratedAssetToStoryline(job: MediaGenerationJob, asset: MediaAsset) {
      const storyline = this.getStoryline(job.storylineId, true);
      if (!storyline) return;
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        mediaIds: [...new Set([...storyline.mediaIds, asset.id])],
        supportedModes: [...new Set([...storyline.supportedModes, job.kind])],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : `Added generated ${job.kind} placeholder.`,
        }),
        updatedAt: nowIso(),
      });
    },
    attachGeneratedAssetToScene(job: MediaGenerationJob, asset: MediaAsset) {
      if (!job.messageId) return;
      const message = this.envelope.entities.messages[job.messageId];
      if (!message) return;
      const [hint = {}, ...rest] = message.sceneHints ?? [];
      if (job.kind === "image") {
        this.envelope.entities.messages[message.id] = {
          ...message,
          sceneHints: [{ ...hint, backgroundAssetId: asset.id }, ...rest],
        };
        return;
      }
      const cues = hint.voice?.length ? [...hint.voice] : [{
        speakerId: job.speakerId,
        text: job.voiceText || message.content.slice(0, 180),
        voiceModel: job.model,
        status: "planned" as const,
      }];
      const targetIndex = Math.max(0, cues.findIndex((cue) => !job.speakerId || cue.speakerId === job.speakerId));
      cues[targetIndex] = {
        ...cues[targetIndex],
        speakerId: cues[targetIndex].speakerId ?? job.speakerId,
        text: job.voiceText || cues[targetIndex].text,
        voiceModel: job.model,
        assetId: asset.id,
        status: "generated",
      };
      this.envelope.entities.messages[message.id] = {
        ...message,
        sceneHints: [{ ...hint, voice: cues }, ...rest],
      };
    },
    async importVoiceReferenceForCharacter(storylineId: string, characterId: string, file: File) {
      const storyline = this.getStoryline(storylineId);
      const character = this.getCharacter(characterId);
      if (!storyline || !character) throw new Error("voice_reference_context_missing");
      const asset = await importBrowserMedia(file, "voice");
      const updatedAsset: MediaAsset = {
        ...asset,
        purpose: "voice",
        altText: `${character.name} voice reference: ${file.name}`,
        source: { ...asset.source, label: `Voice reference for ${character.name}` },
        license: { kind: "unknown", note: "Confirm this voice reference is original or licensed before publishing." },
      };
      this.envelope.entities.mediaAssets[updatedAsset.id] = updatedAsset;
      localContentRepository.saveCharacter(this.envelope, {
        ...character,
        mediaIds: [...new Set([...character.mediaIds, updatedAsset.id])],
        voice: {
          ...character.voice,
          referenceAssetId: updatedAsset.id,
        },
        moderation: resetModerationForDraftEdit(character.moderation, storyline.rating),
        updatedAt: nowIso(),
      });
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        mediaIds: [...new Set([...storyline.mediaIds, updatedAsset.id])],
        supportedModes: [...new Set([...storyline.supportedModes, "voice" as const])],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : "Added a voice reference asset.",
        }),
        updatedAt: nowIso(),
      });
      await this.persist("voice_reference_imported");
      return updatedAsset.id;
    },
    async importNativeVoiceReferenceForCharacter(storylineId: string, characterId: string, path: string): Promise<string | undefined> {
      const storyline = this.getStoryline(storylineId);
      const character = this.getCharacter(characterId);
      if (!storyline || !character) throw new Error("voice_reference_context_missing");
      const asset = await importTauriMedia(this.envelope.workspace.id, path.trim(), "voice");
      if (!asset) return undefined;
      await this.attachVoiceReferenceAsset(storyline, character, asset, "native_voice_reference_imported", "Imported native voice reference.");
      return asset.id;
    },
    async pickNativeVoiceReferenceForCharacter(storylineId: string, characterId: string): Promise<string | undefined> {
      const storyline = this.getStoryline(storylineId);
      const character = this.getCharacter(characterId);
      if (!storyline || !character) throw new Error("voice_reference_context_missing");
      const asset = await pickAndImportTauriMedia(this.envelope.workspace.id, "voice");
      if (!asset) return undefined;
      await this.attachVoiceReferenceAsset(storyline, character, asset, "native_voice_reference_picked", "Picked native voice reference.");
      return asset.id;
    },
    async attachVoiceReferenceAsset(storyline: Storyline, character: Character, asset: MediaAsset, persistReason: string, changelog: string) {
      const updatedAsset: MediaAsset = {
        ...asset,
        purpose: "voice",
        altText: `${character.name} native voice reference`,
        source: { ...asset.source, label: `Native voice reference for ${character.name}` },
        license: { kind: "unknown", note: "Confirm this voice reference is original or licensed before publishing." },
      };
      this.envelope.entities.mediaAssets[updatedAsset.id] = updatedAsset;
      localContentRepository.saveCharacter(this.envelope, {
        ...character,
        mediaIds: [...new Set([...character.mediaIds, updatedAsset.id])],
        voice: {
          ...character.voice,
          referenceAssetId: updatedAsset.id,
        },
        moderation: resetModerationForDraftEdit(character.moderation, storyline.rating),
        updatedAt: nowIso(),
      });
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        mediaIds: [...new Set([...storyline.mediaIds, updatedAsset.id])],
        supportedModes: [...new Set([...storyline.supportedModes, "voice" as const])],
        moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
        version: prepareVersionForDraftEdit(storyline.version, {
          changelog: storyline.version.status === "draft" ? storyline.version.changelog : changelog,
        }),
        updatedAt: nowIso(),
      });
      await this.persist(persistReason);
    },
    async confirmMediaLicense(assetId: string, note = "Confirmed original or licensed by local creator.") {
      const asset = this.envelope.entities.mediaAssets[assetId];
      if (!asset) return;
      this.envelope.entities.mediaAssets[assetId] = {
        ...asset,
        license: { kind: "owned", note },
        source: { ...asset.source, label: asset.source.label || "Local creator owned asset" },
        safety: { ...asset.safety, state: "local_ready" },
      };
      await this.persist("media_license_confirmed");
    },
    async updateMediaAssetMetadata(assetId: string, input: {
      altText: string;
      sourceKind: MediaAsset["source"]["kind"];
      sourceLabel: string;
      sourceUrl?: string;
      licenseKind: MediaAsset["license"]["kind"];
      licenseNote: string;
    }) {
      const asset = this.envelope.entities.mediaAssets[assetId];
      if (!asset) return;
      const licenseKind = input.licenseKind;
      this.envelope.entities.mediaAssets[assetId] = {
        ...asset,
        altText: input.altText.trim() || asset.altText,
        source: {
          kind: input.sourceKind,
          label: input.sourceLabel.trim() || asset.source.label || "Unspecified local source",
          url: input.sourceUrl?.trim() || undefined,
        },
        license: {
          kind: licenseKind,
          note: input.licenseNote.trim() || (licenseKind === "unknown" ? "Ownership still needs confirmation." : "Confirmed by local creator."),
        },
        safety: {
          ...asset.safety,
          state: licenseKind === "unknown" ? "draft" : asset.safety.state,
        },
      };

      const now = nowIso();
      for (const storyline of Object.values(this.envelope.entities.storylines)) {
        if (!storyline.mediaIds.includes(assetId)) continue;
        localContentRepository.saveStoryline(this.envelope, {
          ...storyline,
          moderation: resetModerationForDraftEdit(storyline.moderation, storyline.rating),
          version: prepareVersionForDraftEdit(storyline.version, {
            changelog: storyline.version.status === "draft" ? storyline.version.changelog : "Updated media metadata.",
          }),
          updatedAt: now,
        });
      }
      await this.persist("media_metadata_updated");
    },
    async generateMediaThumbnail(assetId: string, size = 320): Promise<MediaVariant | undefined> {
      const asset = this.envelope.entities.mediaAssets[assetId];
      if (!asset || asset.kind !== "image") return undefined;
      const variant = await generateTauriMediaThumbnail(this.envelope.workspace.id, assetId, size);
      if (!variant) return undefined;
      this.envelope.entities.mediaAssets[assetId] = {
        ...asset,
        variants: [
          ...asset.variants.filter((item) => !(item.purpose === "thumbnail" && item.width === variant.width)),
          variant,
        ],
      };
      await this.persist("media_thumbnail_generated");
      return variant;
    },
    async markStorylineLocalReady(storylineId: string): Promise<ValidationIssue[]> {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) return [{ field: "storyline", severity: "error", message: "Storyline not found." }];
      const issues = this.validateStoryline(storylineId);
      if (!canMarkLocalReady(issues)) return issues;
      const characterIds = storyline.cast.map((cast) => cast.characterId);
      const scenarioIds = storyline.scenarioIds;
      const mediaIds = storyline.mediaIds;
      const readyAt = nowIso();
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        moderation: { ...storyline.moderation, state: "local_ready", reasons: [] },
        version: { ...storyline.version, status: "local_ready" },
        updatedAt: readyAt,
      });
      for (const id of characterIds) {
        const character = this.envelope.entities.characters[id];
        if (character) localContentRepository.saveCharacter(this.envelope, { ...character, moderation: { ...character.moderation, state: "local_ready" }, updatedAt: readyAt });
      }
      for (const id of scenarioIds) {
        const scenario = this.envelope.entities.scenarios[id];
        if (scenario) localContentRepository.saveScenario(this.envelope, { ...scenario, updatedAt: readyAt });
      }
      for (const id of mediaIds) {
        const asset = this.envelope.entities.mediaAssets[id];
        if (asset) this.envelope.entities.mediaAssets[id] = { ...asset, safety: { ...asset.safety, state: "local_ready" } };
      }
      await this.persist("storyline_local_ready");
      return [];
    },
    async importWorkspaceEnvelope(envelope: SaveEnvelope, report = verifyWorkspacePackage(envelope)) {
      if (!report.ok) {
        this.lastPackageReport = report;
        throw new Error(`workspace_package_invalid: ${report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" ")}`);
      }
      const importedId = `${envelope.workspace.id}_browser_import_${Date.now().toString(36)}`;
      this.envelope = {
        ...normalizeEnvelope(envelope),
        workspace: {
          ...envelope.workspace,
          id: importedId,
          name: `${envelope.workspace.name} Imported`,
          updatedAt: nowIso(),
        },
      };
      await this.persist("workspace_imported");
      this.lastPackageReport = report;
      this.lastImportMessage = `Imported JSON workspace as ${this.envelope.workspace.name}. Package check ${report.ok ? "passed" : "failed"}.`;
    },
    async importWorkspaceFile(file: File) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".zip") || name.endsWith(".evolvria")) {
        this.envelope = await importWorkspaceZip(file);
        const report = verifyWorkspacePackage(this.envelope);
        if (!report.ok) {
          this.lastPackageReport = report;
          throw new Error(`workspace_package_invalid: ${report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" ")}`);
        }
        await this.persist("workspace_zip_imported");
        this.lastPackageReport = report;
        this.lastImportMessage = `Imported zip workspace as ${this.envelope.workspace.name}. Package check passed.`;
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const packageInput = readWorkspacePackage(parsed);
        if (!packageInput.envelope) throw new Error("workspace_package_missing_save");
        const report = verifyWorkspacePackage(parsed as SaveEnvelope);
        await this.importWorkspaceEnvelope(packageInput.envelope, report);
        return;
      } catch (error) {
        if (name.endsWith(".json")) {
          throw error;
        }
      }
      throw new Error("unsupported_workspace_import");
    },
    async updateProvider(provider: AIProviderSettings, apiKey?: string): Promise<SecretWriteResult | undefined> {
      this.envelope.settings.provider = provider;
      let secretResult: SecretWriteResult | undefined;
      if (apiKey !== undefined) {
        secretResult = await saveSecret("openai-compatible-api-key", apiKey);
      }
      await this.persist("settings_provider_updated");
      return secretResult;
    },
    async clearProviderKey(): Promise<SecretDeleteResult> {
      const result = await deleteSecret("openai-compatible-api-key");
      await this.persist("settings_provider_key_deleted");
      return result;
    },
    async updateBudgetSettings(budget: BudgetSettings) {
      this.envelope.settings.budget = {
        maxInputTokens: Math.max(1, Number(budget.maxInputTokens)),
        maxOutputTokens: Math.max(1, Number(budget.maxOutputTokens)),
        maxEstimatedCostPerTurn: Math.max(0, Number(budget.maxEstimatedCostPerTurn)),
      };
      await this.persist("settings_budget_updated");
    },
    async updateAdultUnlock(unlocked: boolean) {
      const account = this.envelope.settings.cloudAccount;
      this.envelope.settings.adultContentUnlocked = Boolean(unlocked && account?.ageGate !== "minor");
      await this.persist("settings_rating_updated");
    },
    async updateSyncSettings(input: { enabled: boolean; endpoint?: string }) {
      if (input.enabled && !this.envelope.settings.cloudAccount) {
        localSyncRepository.updateSettings(this.envelope, {
          enabled: false,
          endpoint: input.endpoint,
        });
        this.envelope.settings.sync.status = "error";
        await this.persist("sync_settings_requires_account");
        return;
      }
      localSyncRepository.updateSettings(this.envelope, input);
      await this.persist("sync_settings_updated");
    },
    async signInLocalAccount(input: { displayName: string; email?: string; ageGate: AccountAgeGate }) {
      const signedAt = nowIso();
      this.envelope.settings.cloudAccount = createLocalAccountSession(input, signedAt);
      if (input.ageGate === "minor") this.envelope.settings.adultContentUnlocked = false;
      await this.persist("account_local_signed_in");
    },
    async updateLocalAccountAgeGate(ageGate: AccountAgeGate) {
      const account = this.envelope.settings.cloudAccount;
      if (!account) return;
      this.envelope.settings.cloudAccount = updateAccountAgeGate(account, ageGate, nowIso());
      if (ageGate === "minor") this.envelope.settings.adultContentUnlocked = false;
      await this.persist("account_age_gate_updated");
    },
    async signOutLocalAccount() {
      this.envelope.settings.cloudAccount = undefined;
      localSyncRepository.updateSettings(this.envelope, {
        enabled: false,
        endpoint: this.envelope.settings.sync.endpoint,
      });
      await this.persist("account_local_signed_out");
    },
    async queueSyncOperation(entityType: SyncOperationEntity, entityId: string, op: SyncOperationKind = "update", patch: unknown = {}) {
      const operation = localSyncRepository.queueOperation(this.envelope, {
        entityType,
        entityId,
        op,
        patch,
      });
      await this.persist("sync_operation_queued");
      return operation.id;
    },
    async queueStorylineSyncOperation(storylineId: string) {
      const storyline = this.getStoryline(storylineId);
      if (!storyline) throw new Error("storyline_not_found");
      return this.queueSyncOperation("storylines", storylineId, "update", {
        title: storyline.title,
        version: storyline.version.version,
        updatedAt: storyline.updatedAt,
      });
    },
    async simulateSyncPush() {
      const result = localSyncRepository.push(this.envelope);
      await this.persist(`sync_push_simulated_${result.pushedCount}`);
      return result.pushedCount;
    },
    async simulateStorylineConflict(storylineId: string) {
      const result = localSyncRepository.createStorylineConflict(this.envelope, storylineId);
      await this.persist("sync_conflict_simulated");
      return result.conflictId;
    },
    async resolveSyncConflict(conflictId: string, resolution: ConflictResolution) {
      const result = localSyncRepository.resolveConflict(this.envelope, conflictId, resolution);
      if (!result.resolved) return;
      await this.persist("sync_conflict_resolved");
    },
    async submitLocalModerationCase(targetType: "storyline" | "character" | "media" | "chat" | "creator", targetId: string, reason: string) {
      const id = createId("mod");
      this.envelope.entities.moderationCases[id] = {
        id,
        targetType,
        targetId,
        reason,
        status: "open",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await this.persist("moderation_case_created");
    },
    async submitStorylineForReview(storylineId: string) {
      const issues = await this.markStorylineLocalReady(storylineId);
      if (issues.length) return issues;
      const storyline = this.getStoryline(storylineId);
      if (!storyline) return [{ field: "storyline", severity: "error" as const, message: "Storyline not found." }];
      const packageReport = verifyWorkspacePackage(createWorkspacePackage(createStorylineReviewEnvelope(this.envelope, storyline)));
      this.lastPackageReport = packageReport;
      const packageIssues = packageReportToValidationIssues(packageReport);
      if (packageIssues.length) {
        await this.persist("storyline_review_package_blocked");
        return packageIssues;
      }
      localContentRepository.saveStoryline(this.envelope, {
        ...storyline,
        moderation: { ...storyline.moderation, state: "submitted" },
        version: { ...storyline.version, status: "submitted" },
        updatedAt: nowIso(),
      });
      await this.submitLocalModerationCase("storyline", storylineId, "Submitted for local cloud-readiness review.");
      return [];
    },
    async resolveModerationCase(caseId: string, status: "actioned" | "dismissed", outcome?: ModerationReviewOutcome) {
      const moderationCase = this.envelope.entities.moderationCases[caseId];
      if (!moderationCase) return;
      const reviewedAt = nowIso();
      const reviewOutcome: ModerationReviewOutcome = outcome ?? (status === "dismissed" ? "approved" : "needs_changes");
      this.envelope.entities.moderationCases[caseId] = {
        ...moderationCase,
        status,
        updatedAt: reviewedAt,
      };
      if (moderationCase.targetType === "storyline") {
        const storyline = this.getStoryline(moderationCase.targetId);
        if (storyline) {
          const approved = reviewOutcome === "approved";
          localContentRepository.saveStoryline(this.envelope, {
            ...storyline,
            visibility: approved ? "public" : "private",
            moderation: applyModerationReview(storyline.moderation, reviewOutcome, reviewedAt, moderationCase.reason),
            version: { ...storyline.version, status: approved ? "published" : reviewOutcome },
            updatedAt: reviewedAt,
          });
          if (approved) await this.addCreatorEarningEstimate(storyline.id, 0);
        }
      }
      if (moderationCase.targetType === "character") {
        const character = this.getCharacter(moderationCase.targetId);
        if (character) {
          localContentRepository.saveCharacter(this.envelope, {
            ...character,
            visibility: reviewOutcome === "approved" ? character.visibility : "private",
            moderation: applyModerationReview(character.moderation, reviewOutcome, reviewedAt, moderationCase.reason),
            updatedAt: reviewedAt,
          });
        }
      }
      if (moderationCase.targetType === "media") {
        const asset = this.envelope.entities.mediaAssets[moderationCase.targetId];
        if (asset) {
          this.envelope.entities.mediaAssets[asset.id] = {
            ...asset,
            safety: applyModerationReview(asset.safety, reviewOutcome, reviewedAt, moderationCase.reason),
          };
        }
      }
      await this.persist("moderation_case_resolved");
    },
    async appealModerationCase(caseId: string, reason: string) {
      const moderationCase = this.envelope.entities.moderationCases[caseId];
      if (!moderationCase) return;
      const appealedAt = nowIso();
      this.envelope.entities.moderationCases[caseId] = createModerationAppeal(moderationCase, reason, appealedAt);
      if (moderationCase.targetType === "storyline") {
        const storyline = this.getStoryline(moderationCase.targetId);
        if (storyline && ["rejected", "needs_changes"].includes(storyline.moderation.state)) {
          localContentRepository.saveStoryline(this.envelope, {
            ...storyline,
            moderation: { ...storyline.moderation, state: "appealed" },
            version: { ...storyline.version, status: "appealed" },
            updatedAt: appealedAt,
          });
        }
      }
      await this.persist("moderation_case_appealed");
    },
    async resolveModerationCaseAppeal(caseId: string, outcome: ModerationAppealOutcome, note = "Local appeal simulation decision.") {
      const moderationCase = this.envelope.entities.moderationCases[caseId];
      if (!moderationCase) return;
      const resolvedAt = nowIso();
      this.envelope.entities.moderationCases[caseId] = resolveModerationAppeal(moderationCase, outcome, resolvedAt, note);
      if (moderationCase.targetType === "storyline") {
        const storyline = this.getStoryline(moderationCase.targetId, true);
        if (storyline) {
          if (outcome === "upheld") {
            localContentRepository.saveStoryline(this.envelope, {
              ...storyline,
              visibility: "public",
              moderation: applyModerationReview(storyline.moderation, "approved", resolvedAt, note),
              version: { ...storyline.version, status: "published" },
              updatedAt: resolvedAt,
            });
            await this.addCreatorEarningEstimate(storyline.id, 0);
          } else {
            localContentRepository.saveStoryline(this.envelope, {
              ...storyline,
              visibility: "private",
              moderation: applyModerationReview(storyline.moderation, "rejected", resolvedAt, note),
              version: { ...storyline.version, status: "rejected" },
              updatedAt: resolvedAt,
            });
          }
        }
      }
      await this.persist("moderation_appeal_resolved");
    },
    async addCreatorEarningEstimate(sourceEntityId: string, amount = 0) {
      const id = createId("earning");
      this.envelope.entities.creatorEarnings[id] = {
        id,
        creatorId: "creator_local",
        sourceEntityId,
        status: "estimated",
        amount,
        currency: "credit",
        note: "Local estimate only. Cloud payout is not enabled.",
        createdAt: nowIso(),
      };
      await this.persist("creator_earning_estimated");
    },
    async addCreditLedgerEstimate(amount = 1.2) {
      const id = createId("ledger");
      this.envelope.entities.creditLedger[id] = {
        id,
        provider: "cloud-proxy-preview",
        model: "evolvria-billing-sim",
        operation: "chat",
        estimatedTokens: 1200,
        estimatedCost: amount,
        status: "pending",
        adjustmentIds: [],
        currency: "credit",
        createdAt: nowIso(),
      };
      await this.persist("credit_ledger_estimated");
      return id;
    },
    async adjustCreditLedger(entryId: string, kind: CreditAdjustment["kind"], reason = "Local billing simulation adjustment.") {
      const entry = this.envelope.entities.creditLedger[entryId];
      if (!entry) return;
      const id = createId("adjustment");
      const adjustment = createCreditAdjustment(entry, {
        id,
        kind,
        reason,
        createdAt: nowIso(),
      });
      this.envelope.entities.creditAdjustments[id] = adjustment;
      this.envelope.entities.creditLedger[entryId] = applyCreditAdjustment(entry, adjustment);
      await this.persist(`credit_${kind}_created`);
      return id;
    },
    async backup(reason = "manual") {
      const meta = await backupWorkspace(this.envelope, reason);
      this.lastBackupMessage = `Backup created: ${meta.id}`;
      await this.refreshBackups();
      return meta;
    },
    async refreshBackups() {
      this.backupMetas = await listWorkspaceBackups(this.envelope.workspace.id);
    },
    async restoreWorkspaceFromBackup(backupId: string) {
      this.envelope = await restoreWorkspaceBackup(this.envelope, backupId);
      this.lastBackupMessage = `Restored workspace from ${backupId}. A pre-restore backup was created when possible.`;
      await this.refreshBackups();
      await this.verifyCurrentWorkspacePackage();
    },
    async exportCurrentWorkspace() {
      const result = await exportWorkspace(this.envelope);
      this.lastExportPath = result.path;
      await this.verifyCurrentWorkspacePackage();
    },
    async verifyCurrentWorkspacePackage() {
      this.lastPackageReport = await verifyWorkspacePackageNative(this.envelope.workspace.id) ?? verifyWorkspacePackage(this.envelope);
      return this.lastPackageReport;
    },
    async resetToSeed() {
      this.envelope = await resetWorkspace();
      await this.refreshBackups();
    },
  },
});

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampDifficulty(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function createStorylineReviewEnvelope(envelope: SaveEnvelope, storyline: Storyline): SaveEnvelope {
  const characterIds = new Set(storyline.cast.map((cast) => cast.characterId));
  const scenarioIds = new Set(storyline.scenarioIds);
  const mediaIds = new Set(storyline.mediaIds);
  const characters = Object.fromEntries(
    [...characterIds]
      .map((id) => envelope.entities.characters[id])
      .filter((character): character is Character => Boolean(character))
      .map((character) => {
        for (const mediaId of character.mediaIds) mediaIds.add(mediaId);
        if (character.voice.referenceAssetId) mediaIds.add(character.voice.referenceAssetId);
        return [character.id, character];
      }),
  );
  const scenarios = Object.fromEntries(
    [...scenarioIds]
      .map((id) => envelope.entities.scenarios[id])
      .filter((scenario): scenario is Scenario => Boolean(scenario))
      .map((scenario) => [scenario.id, scenario]),
  );
  const mediaAssets = Object.fromEntries(
    [...mediaIds]
      .map((id) => envelope.entities.mediaAssets[id])
      .filter((asset): asset is MediaAsset => Boolean(asset))
      .map((asset) => [asset.id, asset]),
  );
  const dungeonMindConfigs = storyline.dungeonMindConfigId && envelope.entities.dungeonMindConfigs[storyline.dungeonMindConfigId]
    ? { [storyline.dungeonMindConfigId]: envelope.entities.dungeonMindConfigs[storyline.dungeonMindConfigId] }
    : {};
  const entities: SaveEnvelope["entities"] = {
    characters,
    storylines: { [storyline.id]: storyline },
    scenarios,
    mediaAssets,
    personas: {},
    chats: {},
    chatCheckpoints: {},
    messages: {},
    summaryChapters: {},
    arcs: {},
    dungeonMindConfigs,
    fateChecks: {},
    creditLedger: {},
    creditAdjustments: {},
    moderationCases: {},
    creatorEarnings: {},
    engagementStats: {},
    mediaGenerationJobs: {},
    syncOperations: {},
    syncConflicts: {},
  };
  return {
    ...envelope,
    workspace: {
      ...envelope.workspace,
      name: `${storyline.title} Review Package`,
    },
    entities,
    indexes: buildIndexes(entities),
    audit: [],
  };
}

function packageReportToValidationIssues(report: PackageVerificationReport): ValidationIssue[] {
  const issues: ValidationIssue[] = report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({
      field: issue.field,
      severity: "error",
      message: `Package verification failed: ${issue.message}`,
    }));
  for (const assetId of report.assetRefs.browserOnly) {
    issues.push({
      field: `assets.${assetId}`,
      severity: "error",
      message: `Package verification failed: browser-only asset ${assetId} must be reimported with the Tauri desktop importer before submission.`,
    });
  }
  return issues;
}

function pruneChatDerivedState(envelope: SaveEnvelope, chatId: string, checkpointCreatedAt: string, retainedMessageIds: Set<string>) {
  for (const [id, summary] of Object.entries(envelope.entities.summaryChapters)) {
    if (summary.chatId === chatId && summary.createdAt > checkpointCreatedAt) {
      delete envelope.entities.summaryChapters[id];
    }
  }
  for (const [id, check] of Object.entries(envelope.entities.fateChecks)) {
    if (check.chatId === chatId && check.createdAt > checkpointCreatedAt) {
      delete envelope.entities.fateChecks[id];
    }
  }
  for (const arc of Object.values(envelope.entities.arcs)) {
    if (arc.chatId !== chatId) continue;
    envelope.entities.arcs[arc.id] = {
      ...arc,
      beats: arc.beats.map((beat) => ({
        ...beat,
        status: beat.evidenceMessageIds.some((id) => retainedMessageIds.has(id)) ? beat.status : "open",
        evidenceMessageIds: beat.evidenceMessageIds.filter((id) => retainedMessageIds.has(id)),
      })),
      updatedAt: nowIso(),
    };
  }
}

function downloadTextFile(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

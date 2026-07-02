import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLocalAccountSession, updateAccountAgeGate } from "@/domain/account";
import { AI_MODEL_IDS, GLOSC_ONE_BASE_URL, modelForMediaGenerationKind, resolveProviderForModelRole } from "@/domain/ai-routing";
import {
  applyCreditAdjustment,
  applyPayoutRequestToEarnings,
  applyPayoutResolutionToEarnings,
  calculateCreatorEarningTotals,
  createCreditAdjustment,
  createCreatorPayoutRequest,
  resolveCreatorPayoutRequest,
  updateCreatorEarningStatus,
} from "@/domain/billing";
import {
  appendUserMessage,
  createChatSession,
  createMessageWindow,
  formatChatExcerptMarkdown,
  mergeNarrativeResponse,
  rollbackChatToCheckpoint,
  searchChatMessages,
  updateMessageSceneHint,
} from "@/domain/chat-reducer";
import { prepareVersionForDraftEdit, resetModerationForDraftEdit } from "@/domain/content-version";
import { createSeedEnvelope } from "@/domain/fixtures";
import { checkBudget, compactMessagesForBudget, estimateTurnCost, isRecoverableInputOverflow } from "@/domain/cost";
import { recordEngagementStats } from "@/domain/engagement";
import { validateStorylinePackage } from "@/domain/creator-validation";
import { buildLibraryItems, filterLibraryItems, libraryFacetValues, publicCatalogStats } from "@/domain/library";
import { createStorylineWorkspacePackage, createWorkspacePackage, readWorkspacePackage, verifyWorkspacePackage } from "@/domain/package-verification";
import { fateCheckToText, rollConfiguredDice, rollD20, runFateCheck } from "@/domain/fate-engine";
import { completeMediaGenerationJobWithAsset, completeMockMediaGenerationJob, createMediaGenerationJob, startMediaGenerationJob } from "@/domain/media-generation";
import { applyModerationReview, createModerationAppeal, postcheckNarrativeResponse, precheckContent, resolveModerationAppeal } from "@/domain/moderation";
import { duplicateStorylinePackage } from "@/domain/storyline-duplicate";
import { createInitialArc, createSummaryChapter, advanceArc, editArc, editSummaryChapter, messagesSinceLastSummary, revertSummaryChapter, shouldCreateAutoSummary } from "@/domain/summary";
import {
  buildSyncDeviceSnapshot,
  countOpenSyncConflicts,
  createFieldConflict,
  createSyncOperation,
  createSyncOperationLogPackage,
  disableSyncRetainingLocalData,
  importSyncOperationLogPackage,
  resolveConflictRecord,
} from "@/domain/sync";
import { LocalContentRepository } from "@/services/repositories/content";
import { buildNarrativePromptBundle, buildOpenAIChatMessages, NARRATIVE_PROMPT_CONTRACT_VERSION, redactPromptPreviewContent } from "@/services/ai/context";
import { generateOpenAICompatible, normalizeProviderBaseUrl, parseProviderContent } from "@/services/ai/openai-compatible";
import { BUILT_IN_AI_SKILLS, buildSkillPromptBlock, skillForModelRole } from "@/services/ai/skill-catalog";
import { LocalSyncRepository } from "@/services/repositories/sync";
import { backupWorkspace, buildAssetMaintenancePlan, buildBrowserAssetInventory, buildBrowserMessagePage, deleteSecret, listWorkspaceBackups, normalizeEnvelope, restoreWorkspaceBackup, saveSecret } from "@/services/repositories/workspace";

describe("Evolvria domain", () => {
  it("creates seed content with original storylines", () => {
    const envelope = createSeedEnvelope();
    expect(Object.keys(envelope.entities.storylines)).toContain("story_starbloom_frontier");
    expect(Object.values(envelope.entities.storylines).some((story) => story.title.includes("ISEKAI"))).toBe(false);
    expect(envelope.entities.personas.persona_default_traveler.name).toBe("默认旅人");
    expect(envelope.settings.provider.baseUrl).toBe(GLOSC_ONE_BASE_URL);
    expect(envelope.settings.provider.model).toBe(AI_MODEL_IDS.chat);
  });

  it("routes Glosc One models and built-in AI skills by operation", () => {
    const provider = createSeedEnvelope().settings.provider;
    const narrativeProvider = resolveProviderForModelRole(provider, "narrative");
    const customProvider = resolveProviderForModelRole({
      ...provider,
      baseUrl: "https://custom.example.test/v1",
      model: "custom/model",
    }, "narrative");

    expect(narrativeProvider.model).toBe(AI_MODEL_IDS.narrative);
    expect(customProvider.model).toBe("custom/model");
    expect(modelForMediaGenerationKind("image")).toBe(AI_MODEL_IDS.image);
    expect(modelForMediaGenerationKind("video")).toBe(AI_MODEL_IDS.video);
    expect(modelForMediaGenerationKind("voice")).toBe(AI_MODEL_IDS.voice);
    expect(skillForModelRole("narrative").id).toBe("evolvria-narrative-turn");
    expect(buildSkillPromptBlock("evolvria-narrative-turn")).toContain(AI_MODEL_IDS.narrative);
  });

  it("publishes built-in AI skill files and manifest entries", () => {
    const manifestPath = resolve(process.cwd(), "public/skills/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      baseUrl: string;
      skills: Array<{ id: string; model: string; path: string; openaiMetadata: string }>;
    };

    expect(manifest.baseUrl).toBe(GLOSC_ONE_BASE_URL);
    expect(manifest.skills).toHaveLength(BUILT_IN_AI_SKILLS.length);
    for (const skill of BUILT_IN_AI_SKILLS) {
      const entry = manifest.skills.find((item) => item.id === skill.id);
      expect(entry?.model).toBe(skill.model);
      expect(existsSync(resolve(process.cwd(), `public${entry?.path}`))).toBe(true);
      expect(existsSync(resolve(process.cwd(), `public${entry?.openaiMetadata}`))).toBe(true);
    }
  });

  it("creates local account preview sessions with age-gated permissions", () => {
    const adult = createLocalAccountSession({
      displayName: "Local Creator",
      email: "CREATOR@EXAMPLE.TEST",
      ageGate: "adult",
    }, "2026-07-02T00:00:00.000Z");
    const minor = updateAccountAgeGate(adult, "minor", "2026-07-02T01:00:00.000Z");

    expect(adult.email).toBe("creator@example.test");
    expect(adult.permissions).toEqual(["sync", "publish", "billing", "adult_content"]);
    expect(minor.permissions).toEqual(["sync"]);
    expect(minor.updatedAt).toBe("2026-07-02T01:00:00.000Z");
    expect(() => createLocalAccountSession({ displayName: "", ageGate: "unknown" }, "2026-07-02T00:00:00.000Z")).toThrow("account_display_name_required");
  });

  it("creates a chat session and appends a user message checkpoint", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = {
      id: "persona_test",
      name: "测试旅人",
      description: "谨慎的调查员",
      preferences: [],
      boundaries: [],
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    };
    const { chat, openingMessages } = createChatSession(storyline, scenario, persona);
    const result = appendUserMessage(chat, "我检查坐标片。", "act", openingMessages);
    expect(result.chat.messageIds).toHaveLength(3);
    expect(result.chat.checkpointIds).toHaveLength(1);
    expect(result.checkpoint.messageIndex).toBe(2);
    expect(result.message.mode).toBe("act");
  });

  it("updates the first message scene hint while preserving media cues", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = envelope.entities.personas.persona_default_traveler;
    const { openingMessages } = createChatSession(storyline, scenario, persona);
    const opening = openingMessages[1];

    const updated = updateMessageSceneHint(opening, {
      mood: "紧张黎明",
      camera: "close",
      choices: [
        { id: "opening_observe", label: "环顾灯塔", message: "我环顾灯塔，确认异常来源。" },
        { label: "询问莉拉", message: "我询问莉拉她刚才听见了什么。" },
        { label: "  ", message: "忽略空标签。" },
      ],
    });

    expect(updated.sceneHints?.[0].mood).toBe("紧张黎明");
    expect(updated.sceneHints?.[0].camera).toBe("close");
    expect(updated.sceneHints?.[0].characterSprites).toEqual(opening.sceneHints?.[0].characterSprites);
    expect(updated.sceneHints?.[0].voice).toEqual(opening.sceneHints?.[0].voice);
    expect(updated.sceneHints?.[0].choices).toHaveLength(2);
    expect(updated.sceneHints?.[0].choices?.[0]).toEqual({
      id: "opening_observe",
      label: "环顾灯塔",
      message: "我环顾灯塔，确认异常来源。",
    });
    expect(updated.sceneHints?.[0].choices?.[1].id).toMatch(/^choice_/);
  });

  it("merges narrative retry as a branch instead of overwriting", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = {
      id: "persona_test",
      name: "测试旅人",
      description: "谨慎的调查员",
      preferences: [],
      boundaries: [],
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    };
    const { chat } = createChatSession(storyline, scenario, persona);
    const merged = mergeNarrativeResponse(chat, {
      promptContractVersion: NARRATIVE_PROMPT_CONTRACT_VERSION,
      messages: [{ role: "assistant", content: "新的分支。", safetyFlags: ["none"] }],
      relationshipDeltas: [{ sourceId: "persona_test", targetId: "char_test", summary: "信任上升。", weight: 1 }],
    }, "msg_old");
    expect(merged.messages[0].retryOfMessageId).toBe("msg_old");
    expect(merged.messages[0].promptContractVersion).toBe(NARRATIVE_PROMPT_CONTRACT_VERSION);
    expect(merged.messages[0].relationshipDeltas?.[0].summary).toBe("信任上升。");
    expect(merged.chat.messageIds).toContain(merged.messages[0].id);
  });

  it("blocks adult-locked input when local unlock is off", () => {
    expect(precheckContent("adult scene", false)).toContain("blocked");
    expect(precheckContent("adult scene", true)).not.toContain("blocked");
  });

  it("post-checks and filters unsafe AI output", () => {
    const checked = postcheckNarrativeResponse({
      messages: [
        {
          role: "assistant",
          content: "This reply mentions ISEKAI ZERO copyright material.",
          safetyFlags: ["none"],
        },
      ],
    }, false);

    expect(checked.blocked).toBe(true);
    expect(checked.flags).toContain("copyright");
    expect(checked.response.relationshipDeltas).toEqual([]);
    expect(checked.response.messages).toHaveLength(1);
    expect(checked.response.messages[0].role).toBe("system");
    expect(checked.response.messages[0].content).toContain("后置检查过滤");
  });

  it("applies explicit moderation review outcomes to target status", () => {
    const base = {
      rating: "SFW" as const,
      state: "submitted" as const,
      reasons: [],
      safetyFlags: ["none" as const],
    };

    const needsChanges = applyModerationReview(base, "needs_changes", "2026-07-02T00:00:00.000Z", "Missing source notes.");
    const rejected = applyModerationReview(needsChanges, "rejected", "2026-07-02T00:01:00.000Z", "Copyright risk.");
    const approved = applyModerationReview(rejected, "approved", "2026-07-02T00:02:00.000Z");

    expect(needsChanges.state).toBe("needs_changes");
    expect(needsChanges.reasons).toContain("Missing source notes.");
    expect(rejected.state).toBe("rejected");
    expect(rejected.reasons).toContain("Copyright risk.");
    expect(approved.state).toBe("approved");
    expect(approved.reasons).toEqual([]);
  });

  it("creates and resolves moderation appeals with decision history", () => {
    const moderationCase = {
      id: "mod_appeal",
      targetType: "storyline" as const,
      targetId: "story_test",
      reason: "Rejected for missing source notes.",
      status: "actioned" as const,
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    };

    const appealed = createModerationAppeal(moderationCase, "I added source notes and request a second review.", "2026-07-02T01:00:00.000Z");
    const upheld = resolveModerationAppeal(appealed, "upheld", "2026-07-02T02:00:00.000Z", "Sources verified.");

    expect(appealed.status).toBe("appealed");
    expect(appealed.appeal?.status).toBe("open");
    expect(appealed.appeal?.reason).toContain("second review");
    expect(upheld.status).toBe("dismissed");
    expect(upheld.appeal?.status).toBe("upheld");
    expect(upheld.appeal?.resolutionNote).toBe("Sources verified.");
  });

  it("creates payout previews from available creator earnings and resolves risk outcomes", () => {
    const envelope = createSeedEnvelope();
    const base = envelope.entities.creatorEarnings.earning_seed_preview;
    const available = updateCreatorEarningStatus({ ...base, amount: 12.5 }, "available", "Ready for payout.");
    const withheld = updateCreatorEarningStatus({ ...base, id: "earning_withheld", amount: 3 }, "withheld", "Risk hold.");
    const earnings = {
      [available.id]: available,
      [withheld.id]: withheld,
    };
    const request = createCreatorPayoutRequest(Object.values(earnings), {
      id: "payout_test",
      creatorId: "creator_local",
      note: "Creator requests payout.",
      requestedAt: "2026-07-02T00:00:00.000Z",
    });
    const pending = applyPayoutRequestToEarnings(earnings, request);
    const blocked = resolveCreatorPayoutRequest(request, "block", "2026-07-02T01:00:00.000Z", "Risk review hold.");
    const afterBlock = applyPayoutResolutionToEarnings(pending, blocked);
    const totals = calculateCreatorEarningTotals(Object.values(afterBlock));

    expect(request.amount).toBe(12.5);
    expect(request.earningIds).toEqual([available.id]);
    expect(pending[available.id].status).toBe("pending");
    expect(blocked.status).toBe("blocked");
    expect(blocked.riskFlags).toContain("withheld_for_review");
    expect(afterBlock[available.id].status).toBe("withheld");
    expect(afterBlock[withheld.id].status).toBe("withheld");
    expect(totals.withheld).toBe(15.5);
    expect(() => createCreatorPayoutRequest([withheld], {
      id: "payout_empty",
      creatorId: "creator_local",
      note: "",
      requestedAt: "2026-07-02T00:00:00.000Z",
    })).toThrow("payout_no_available_earnings");
  });

  it("blocks risky creator package text from local_ready validation", () => {
    const envelope = createSeedEnvelope();
    const storyline = {
      ...envelope.entities.storylines.story_starbloom_frontier,
      summary: "这是一个足够长的原创简介，用于测试本地审核会拦截竞品和版权风险。",
      premise: "This package copies ISEKAI ZERO characters and copyright content.",
    };
    const issues = validateStorylinePackage({
      storyline,
      characters: storyline.cast.map((cast) => envelope.entities.characters[cast.characterId]),
      scenarios: storyline.scenarioIds.map((id) => envelope.entities.scenarios[id]),
      mediaAssets: storyline.mediaIds.map((id) => envelope.entities.mediaAssets[id]),
    });
    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("版权"))).toBe(true);
  });

  it("requires media alt text, source and license before local_ready", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const media = {
      ...envelope.entities.mediaAssets.media_starbloom_cover,
      altText: "",
      source: { ...envelope.entities.mediaAssets.media_starbloom_cover.source, label: "" },
      license: { kind: "unknown" as const, note: "" },
    };

    const issues = validateStorylinePackage({
      storyline,
      characters: storyline.cast.map((cast) => envelope.entities.characters[cast.characterId]),
      scenarios: storyline.scenarioIds.map((id) => envelope.entities.scenarios[id]),
      mediaAssets: [media],
    });

    expect(issues.some((issue) => issue.message.includes("alt text"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("素材来源"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("明确版权许可"))).toBe(true);
  });

  it("blocks turns that exceed budget guardrails", () => {
    const estimate = estimateTurnCost([], "我检查坐标片。", 380);
    expect(checkBudget(estimate, { maxInputTokens: 1, maxOutputTokens: 100, maxEstimatedCostPerTurn: 0 }).ok).toBe(false);
    expect(checkBudget(estimate, { maxInputTokens: 1000, maxOutputTokens: 1000, maxEstimatedCostPerTurn: 1 }).ok).toBe(true);
  });

  it("compacts older messages for recoverable context overflow", () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({
      id: `msg_context_${index}`,
      chatId: "chat_context_pressure",
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `第 ${index} 条长上下文记录，灯塔、坐标片、逆潮、莉拉与远处钟声都在反复出现，迫使客户端压缩旧上下文。`,
      safetyFlags: ["none" as const],
      createdAt: "2026-07-02T00:00:00.000Z",
    }));
    const budget = { maxInputTokens: 190, maxOutputTokens: 320, maxEstimatedCostPerTurn: 1 };
    const strict = checkBudget(estimateTurnCost(messages, "继续。", budget.maxOutputTokens), budget);
    const plan = compactMessagesForBudget(messages, "继续。", budget, budget.maxOutputTokens);

    expect(isRecoverableInputOverflow(strict)).toBe(true);
    expect(plan.compacted).toBe(true);
    expect(plan.droppedMessages.length).toBeGreaterThan(0);
    expect(plan.estimate.inputTokens).toBeLessThanOrEqual(budget.maxInputTokens);
    expect(plan.messages.at(-1)?.id).toBe("msg_context_13");
  });

  it("queues and completes local mock media generation jobs", () => {
    const job = createMediaGenerationJob({
      kind: "voice",
      storylineId: "story_starbloom_frontier",
      chatId: "chat_media",
      messageId: "msg_media",
      speakerId: "char_lyra",
      prompt: "生成安全的中文语音占位。",
      voiceText: "灯还亮着，就还有路。",
      provider: "mock",
      model: "evolvria-mock",
    }, "2026-07-02T00:00:00.000Z");
    const running = startMediaGenerationJob(job, "2026-07-02T00:01:00.000Z");
    const completed = completeMockMediaGenerationJob(running, "2026-07-02T00:02:00.000Z");

    expect(job.status).toBe("queued");
    expect(running.status).toBe("running");
    expect(completed.job.status).toBe("completed");
    expect(completed.asset.kind).toBe("audio");
    expect(completed.asset.source.kind).toBe("generated");
    expect(completed.ledgerEntry.operation).toBe("voice");
    expect(completed.job.assetId).toBe(completed.asset.id);

    const video = completeMockMediaGenerationJob(createMediaGenerationJob({
      kind: "video",
      storylineId: "story_starbloom_frontier",
      prompt: "Animate the beacon light sweeping over the harbor.",
      provider: "glosc-one",
      model: AI_MODEL_IDS.video,
    }), "2026-07-02T00:03:00.000Z");
    expect(video.asset.kind).toBe("video");
    expect(video.asset.mimeType).toBe("video/mock-placeholder");
    expect(video.ledgerEntry.operation).toBe("video");
  });

  it("completes provider media generation with returned assets", () => {
    const job = startMediaGenerationJob(createMediaGenerationJob({
      kind: "image",
      storylineId: "story_starbloom_frontier",
      chatId: "chat_media",
      messageId: "msg_media",
      prompt: "Generate an original harbor background.",
      provider: "glosc-one",
      model: AI_MODEL_IDS.image,
    }, "2026-07-02T00:00:00.000Z"), "2026-07-02T00:01:00.000Z");
    const asset = {
      id: "media_provider_image",
      kind: "image" as const,
      purpose: "background" as const,
      relativePath: "assets/images/media_provider_image.png",
      mimeType: "image/png",
      sizeBytes: 1234,
      variants: [],
      altText: "Generated harbor background.",
      source: { kind: "generated" as const, label: "Glosc One image generation" },
      license: { kind: "owned" as const, note: "Generated and reviewed locally." },
      safety: { rating: "SFW" as const, state: "draft" as const, reasons: [], safetyFlags: ["none" as const] },
      createdAt: "2026-07-02T00:02:00.000Z",
    };
    const completed = completeMediaGenerationJobWithAsset(job, asset, "2026-07-02T00:03:00.000Z");

    expect(completed.job.status).toBe("completed");
    expect(completed.job.assetId).toBe(asset.id);
    expect(completed.ledgerEntry.operation).toBe("image");
    expect(completed.ledgerEntry.provider).toBe("glosc-one");
    expect(completed.ledgerEntry.model).toBe(AI_MODEL_IDS.image);
  });

  it("builds a unified searchable library", () => {
    const envelope = createSeedEnvelope();
    const items = buildLibraryItems(envelope.entities);
    expect(items.some((item) => item.kind === "storyline" && item.title === "星烬边境")).toBe(true);
    expect(items.some((item) => item.kind === "scenario" && item.title === "逆潮靠岸")).toBe(true);
    expect(filterLibraryItems(items, { query: "逆潮", kind: "scenario" })).toHaveLength(1);
    expect(filterLibraryItems(items, { mode: "fate" }).every((item) => item.modes.includes("fate"))).toBe(true);
    expect(libraryFacetValues(items).tags).toContain("悬疑");
  });

  it("filters local public catalog and review queue items", () => {
    const envelope = createSeedEnvelope();
    envelope.entities.storylines.story_starbloom_frontier = {
      ...envelope.entities.storylines.story_starbloom_frontier,
      visibility: "public",
      moderation: { ...envelope.entities.storylines.story_starbloom_frontier.moderation, state: "approved" },
      version: { ...envelope.entities.storylines.story_starbloom_frontier.version, status: "published" },
    };
    envelope.entities.storylines.story_mist_harbor = {
      ...envelope.entities.storylines.story_mist_harbor,
      visibility: "private",
      moderation: { ...envelope.entities.storylines.story_mist_harbor.moderation, state: "submitted" },
      version: { ...envelope.entities.storylines.story_mist_harbor.version, status: "submitted" },
    };

    const items = buildLibraryItems(envelope.entities);
    const publicItems = filterLibraryItems(items, { catalog: "public", kind: "storyline" });
    const reviewItems = filterLibraryItems(items, { catalog: "review", kind: "storyline" });
    const stats = publicCatalogStats(items);

    expect(publicItems.map((item) => item.id)).toContain("story_starbloom_frontier");
    expect(publicItems.map((item) => item.id)).not.toContain("story_mist_harbor");
    expect(reviewItems.map((item) => item.id)).toContain("story_mist_harbor");
    expect(stats.publicCount).toBeGreaterThanOrEqual(1);
    expect(stats.reviewCount).toBeGreaterThanOrEqual(1);
    expect(stats.recommended[0].visibility).toBe("public");
  });

  it("searches and saves content through the local repository boundary", () => {
    const envelope = createSeedEnvelope();
    const contentRepository = new LocalContentRepository();
    const result = contentRepository.search(envelope, {
      kind: "scenario",
      query: "逆潮",
      mode: "chat",
      page: 1,
      pageSize: 1,
    });

    expect(result.source).toBe("local");
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe("逆潮靠岸");
    expect(result.facets.modes).toContain("fate");

    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    contentRepository.saveStoryline(envelope, { ...storyline, title: "Repository Saved Story" });
    expect(contentRepository.getStoryline(envelope, storyline.id)?.title).toBe("Repository Saved Story");
  });

  it("soft-deletes and restores storyline packages through the content repository", () => {
    const envelope = createSeedEnvelope();
    const contentRepository = new LocalContentRepository();
    const storyId = "story_starbloom_frontier";

    const trashed = contentRepository.softDeleteStorylinePackage(envelope, storyId, "2026-07-02T02:00:00.000Z");
    expect(trashed?.deletedAt).toBe("2026-07-02T02:00:00.000Z");
    expect(contentRepository.getStoryline(envelope, storyId)).toBeUndefined();
    expect(envelope.entities.characters.char_lyra.deletedAt).toBe("2026-07-02T02:00:00.000Z");
    expect(buildLibraryItems(envelope.entities).some((item) => item.id === storyId)).toBe(false);
    expect(normalizeEnvelope(envelope).indexes.storylinesByUpdatedAt).not.toContain(storyId);

    const restored = contentRepository.restoreStorylinePackage(envelope, storyId, "2026-07-02T03:00:00.000Z");
    expect(restored?.deletedAt).toBeUndefined();
    expect(contentRepository.getStoryline(envelope, storyId)?.title).toBe("星烬边境");
    expect(envelope.entities.characters.char_lyra.deletedAt).toBeUndefined();
    expect(buildLibraryItems(envelope.entities).some((item) => item.id === storyId)).toBe(true);
  });

  it("records local engagement stats for starts, messages and played sorting", () => {
    const envelope = createSeedEnvelope();
    recordEngagementStats(envelope.entities, ["story_starbloom_frontier", "scenario_starbloom_beacon", "story_starbloom_frontier"], {
      starts: 1,
      messages: 3,
      playedAt: "2026-07-02T04:00:00.000Z",
    });
    recordEngagementStats(envelope.entities, ["story_starbloom_frontier"], {
      messages: 2,
      playedAt: "2026-07-02T04:05:00.000Z",
    });

    expect(envelope.entities.engagementStats.story_starbloom_frontier.starts).toBe(1);
    expect(envelope.entities.engagementStats.story_starbloom_frontier.messages).toBe(5);
    expect(envelope.entities.engagementStats.story_starbloom_frontier.lastPlayedAt).toBe("2026-07-02T04:05:00.000Z");
    expect(filterLibraryItems(buildLibraryItems(envelope.entities), { sort: "played" })[0].id).toBe("story_starbloom_frontier");
  });

  it("saves and clears browser-preview provider keys outside the workspace", async () => {
    localStorage.clear();
    const saved = await saveSecret("openai-compatible-api-key", "sk-browser-preview");
    expect(saved.backend).toBe("browser_local_storage");
    expect(localStorage.getItem("evolvria:secret:openai-compatible-api-key")).toBe("sk-browser-preview");

    const deleted = await deleteSecret("openai-compatible-api-key");
    expect(deleted.backend).toBe("browser_local_storage");
    expect(deleted.deleted).toBe(true);
    expect(localStorage.getItem("evolvria:secret:openai-compatible-api-key")).toBeNull();
  });

  it("lists and restores browser-preview workspace backups", async () => {
    localStorage.clear();
    const envelope = createSeedEnvelope();
    const backup = await backupWorkspace(envelope, "unit_test");
    const changed = {
      ...envelope,
      workspace: {
        ...envelope.workspace,
        name: "Changed Workspace",
      },
    };

    const restored = await restoreWorkspaceBackup(changed, backup.id);
    const backups = await listWorkspaceBackups(envelope.workspace.id);

    expect(restored.workspace.name).toBe(envelope.workspace.name);
    expect(backups.some((item) => item.id === backup.id && item.reason === "unit_test")).toBe(true);
    expect(backups.some((item) => item.reason === "pre_restore")).toBe(true);
    expect(localStorage.getItem("evolvria:workspace:active")).toContain(envelope.workspace.name);
  });

  it("duplicates a storyline package as a private local draft", () => {
    const envelope = createSeedEnvelope();
    const counters = new Map<string, number>();
    const duplicated = duplicateStorylinePackage(envelope.entities, "story_starbloom_frontier", {
      now: "2026-07-02T01:00:00.000Z",
      idFactory: (prefix) => {
        const next = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, next);
        return `${prefix}_copy_${next}`;
      },
    });

    expect(duplicated.storyline.id).toBe("story_copy_1");
    expect(duplicated.storyline.title).toBe("星烬边境 本地副本");
    expect(duplicated.storyline.visibility).toBe("private");
    expect(duplicated.storyline.moderation.state).toBe("draft");
    expect(duplicated.storyline.version.status).toBe("draft");
    expect(duplicated.storyline.mediaIds).toEqual(["media_starbloom_cover"]);
    expect(duplicated.characters.map((character) => character.id)).toEqual(["char_copy_1", "char_copy_2"]);
    expect(duplicated.scenarios[0].storylineId).toBe("story_copy_1");
    expect(duplicated.scenarios[0].participatingCharacterIds).toEqual(["char_copy_1", "char_copy_2"]);
    expect(duplicated.dungeonMindConfig?.storylineId).toBe("story_copy_1");
    expect(envelope.entities.storylines.story_starbloom_frontier.title).toBe("星烬边境");
  });

  it("resets local-ready package state when a creator edits a versioned draft", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const nextVersion = prepareVersionForDraftEdit(storyline.version, {
      version: "0.2.0 beta",
      changelog: "Expanded scenario entrances.",
    });
    const nextModeration = resetModerationForDraftEdit(storyline.moderation, "M17");
    const changeRequestReset = resetModerationForDraftEdit({
      ...storyline.moderation,
      state: "needs_changes",
      reasons: ["Missing media source notes."],
      reviewedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(nextVersion.status).toBe("draft");
    expect(nextVersion.version).toBe("0.2.0-beta");
    expect(nextVersion.changelog).toBe("Expanded scenario entrances.");
    expect(nextVersion.baseVersionId).toBe("0.1.0");
    expect(nextModeration.state).toBe("draft");
    expect(nextModeration.rating).toBe("M17");
    expect(nextModeration.reviewedAt).toBeUndefined();
    expect(changeRequestReset.state).toBe("draft");
    expect(changeRequestReset.reasons).toEqual([]);
    expect(changeRequestReset.reviewedAt).toBeUndefined();
  });

  it("rolls deterministic Fate checks", () => {
    expect(rollD20("same-seed")).toEqual(rollD20("same-seed"));
  });

  it("uses configured Fate dice, visibility and consequence rules", () => {
    const envelope = createSeedEnvelope();
    const config = {
      ...envelope.entities.dungeonMindConfigs.dm_starbloom,
      dice: "2d6" as const,
      visibility: "full" as const,
      difficultyTable: [
        { label: "容易", target: 6 },
        { label: "标准", target: 9 },
        { label: "困难", target: 12 },
      ],
      consequenceRules: [
        { id: "consequence_custom", label: "压力钟", description: "失败时推进一格危险。" },
      ],
    };
    const roll = rollConfiguredDice("fate-config-test", "2d6", 9, 0);
    const check = runFateCheck({
      chatId: "chat_test",
      actorId: "persona_test",
      intent: "尝试稳住星门",
      config,
      seed: "fate-config-test",
    });

    expect(roll.die).toBeGreaterThanOrEqual(2);
    expect(roll.die).toBeLessThanOrEqual(12);
    expect(check.visibility).toBe("full");
    expect(check.difficulty).toBe(9);
    expect(check.consequences.join(" ")).toContain("压力钟");
  });

  it("runs configurable Fate checks with selected attribute, skill, difficulty, modifier and seed", () => {
    const envelope = createSeedEnvelope();
    const config = {
      ...envelope.entities.dungeonMindConfigs.dm_starbloom,
      visibility: "full" as const,
    };
    const first = runFateCheck({
      chatId: "chat_test",
      actorId: "persona_test",
      intent: "用读势判断灯塔裂隙",
      config,
      attributeId: "attr_will",
      skillId: "skill_read",
      difficulty: 16,
      modifier: 3,
      seed: "manual-fate-seed",
    });
    const second = runFateCheck({
      chatId: "chat_test",
      actorId: "persona_test",
      intent: "用读势判断灯塔裂隙",
      config,
      attributeId: "attr_will",
      skillId: "skill_read",
      difficulty: 16,
      modifier: 3,
      seed: "manual-fate-seed",
    });

    expect(first.attribute).toBe("attr_will");
    expect(first.skill).toBe("skill_read");
    expect(first.difficulty).toBe(16);
    expect(first.roll.modifier).toBe(3);
    expect(first.roll).toEqual(second.roll);
    expect(fateCheckToText(first, config)).toContain("属性 意志 / 技能 读势");
  });

  it("creates summary chapters and advances arcs", () => {
    const message = {
      id: "msg_one",
      chatId: "chat_one",
      role: "user" as const,
      content: "我观察灯塔。",
      safetyFlags: ["none" as const],
      createdAt: "2026-07-02T00:00:00.000Z",
    };
    const summary = createSummaryChapter("chat_one", [message]);
    expect(summary.facts.length).toBeGreaterThanOrEqual(0);
    const arc = createInitialArc("chat_one", "灯塔开场", ["msg_opening"]);
    const advanced = advanceArc(arc, "msg_one");
    expect(advanced.beats.filter((beat) => beat.status === "done")).toHaveLength(2);
  });

  it("edits arc metadata and beat states without losing evidence", () => {
    const arc = createInitialArc("chat_arc_edit", "灯塔开场", ["msg_opening"]);
    const edited = editArc(arc, {
      title: "Arc: 灯塔追踪",
      theme: "调查与信任",
      goal: "确认灯塔异常并保护莉拉。",
      stakes: "拖延会让逆潮靠岸。",
      status: "active",
      beats: [
        { ...arc.beats[0], title: "确认灯塔异常", status: "done" },
        { ...arc.beats[1], title: "改从坐标片追线索", status: "skipped" },
        { title: "询问莉拉听见的钟声", status: "open" },
      ],
    }, "2026-07-02T01:10:00.000Z");

    expect(edited.title).toBe("Arc: 灯塔追踪");
    expect(edited.goal).toContain("保护莉拉");
    expect(edited.beats[0].evidenceMessageIds).toEqual(["msg_opening"]);
    expect(edited.beats[1].status).toBe("skipped");
    expect(edited.beats[2].id).toMatch(/^beat_/);
    expect(edited.updatedAt).toBe("2026-07-02T01:10:00.000Z");
  });

  it("edits and reverts summary chapters with revision history", () => {
    const message = {
      id: "msg_summary_edit",
      chatId: "chat_summary_edit",
      role: "assistant" as const,
      content: "灯塔重新亮起，但钟声仍在继续。",
      safetyFlags: ["none" as const],
      createdAt: "2026-07-02T00:00:00.000Z",
    };
    const summary = createSummaryChapter("chat_summary_edit", [message], 1);
    const edited = editSummaryChapter(summary, {
      summary: "玩家确认灯塔恢复，但钟声仍是未解风险。",
      facts: ["灯塔恢复"],
      unresolvedThreads: ["钟声来源"],
    }, "2026-07-02T01:00:00.000Z");

    expect(edited.summary).toContain("未解风险");
    expect(edited.facts).toEqual(["灯塔恢复"]);
    expect(edited.revisionHistory).toHaveLength(1);

    const reverted = revertSummaryChapter(edited, undefined, "2026-07-02T01:05:00.000Z");
    expect(reverted.summary).toBe(summary.summary);
    expect(reverted.revisionHistory).toHaveLength(2);
    expect(reverted.updatedAt).toBe("2026-07-02T01:05:00.000Z");
  });

  it("decides when to create automatic summaries without duplicating covered messages", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      id: `msg_auto_${index}`,
      chatId: "chat_auto",
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `自动摘要测试消息 ${index}`,
      safetyFlags: ["none" as const],
      createdAt: `2026-07-02T00:${String(index).padStart(2, "0")}:00.000Z`,
    }));
    const intervalDecision = shouldCreateAutoSummary({
      messages,
      summaries: [],
      maxInputTokens: 8000,
    });
    expect(intervalDecision.shouldSummarize).toBe(true);
    expect(intervalDecision.reason).toBe("message_interval");

    const summary = createSummaryChapter("chat_auto", messages.slice(0, 18), 1);
    const unsummarized = messagesSinceLastSummary(messages, [summary]);
    expect(unsummarized.map((message) => message.id)).toEqual(["msg_auto_18", "msg_auto_19"]);
    expect(shouldCreateAutoSummary({ messages, summaries: [summary], maxInputTokens: 8000 }).shouldSummarize).toBe(false);

    const contextDecision = shouldCreateAutoSummary({
      messages: messages.slice(0, 4),
      summaries: [],
      estimatedContext: { inputTokens: 701, outputTokens: 100, estimatedCost: 0, currency: "local_estimate" },
      maxInputTokens: 1000,
    });
    expect(contextDecision.reason).toBe("context_pressure");

    const beforeArc = createInitialArc("chat_auto", "自动摘要 Arc", ["msg_auto_0"]);
    const afterArc = advanceArc(beforeArc, "msg_auto_1");
    const arcDecision = shouldCreateAutoSummary({
      messages: messages.slice(0, 8),
      summaries: [],
      maxInputTokens: 8000,
      activeArcBefore: beforeArc,
      activeArcAfter: afterArc,
    });
    expect(arcDecision.reason).toBe("arc_state_change");
  });

  it("builds layered AI narrative context with memory, arc and fate facts", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = envelope.entities.personas.persona_default_traveler;
    const characters = storyline.cast.map((cast) => envelope.entities.characters[cast.characterId]);
    const messages = [
      {
        id: "msg_user_context",
        chatId: "chat_context",
        role: "user" as const,
        content: "我检查灯塔下的坐标片。",
        safetyFlags: ["none" as const],
        createdAt: "2026-07-02T00:00:00.000Z",
      },
      {
        id: "msg_assistant_context",
        chatId: "chat_context",
        role: "assistant" as const,
        speakerId: characters[0].id,
        content: "坐标片微微发烫。",
        safetyFlags: ["none" as const],
        createdAt: "2026-07-02T00:01:00.000Z",
      },
      {
        id: "msg_system_context",
        chatId: "chat_context",
        role: "system" as const,
        content: "预算提示：旧消息已由本地摘要接管。",
        safetyFlags: ["none" as const],
        createdAt: "2026-07-02T00:02:00.000Z",
      },
    ];
    const summary = createSummaryChapter("chat_context", messages);
    const arc = advanceArc(createInitialArc("chat_context", scenario.title, ["msg_open"]), "msg_assistant_context");
    const fateCheck = runFateCheck({
      chatId: "chat_context",
      actorId: persona.id,
      intent: "解读坐标片",
      config: envelope.entities.dungeonMindConfigs.dm_starbloom,
      seed: "context-test",
    });

    const bundle = buildNarrativePromptBundle({
      storyline,
      scenario,
      persona,
      characters,
      messages,
      summaryChapters: [summary],
      activeArc: arc,
      fateChecks: [fateCheck],
      provider: envelope.settings.provider,
      mode: "act",
      userInput: "我把坐标片贴近灯塔核心。",
      adultContentUnlocked: false,
    });

    expect(bundle.contractVersion).toBe(NARRATIVE_PROMPT_CONTRACT_VERSION);
    expect(bundle.layers.map((layer) => layer.name)).toEqual(expect.arrayContaining([
      "system_policy",
      "product_safety",
      "storyline_world",
      "character_voices",
      "memory",
      "active_arc",
      "fate_results",
      "output_contract",
    ]));
    expect(bundle.layers.find((layer) => layer.name === "product_safety")?.content).toContain("成人内容未解锁");
    expect(bundle.layers.find((layer) => layer.name === "memory")?.content).toContain(summary.title);
    expect(bundle.layers.find((layer) => layer.name === "fate_results")?.content).toContain("叙事模型不得推翻");
    const openAiMessages = buildOpenAIChatMessages({
      storyline,
      scenario,
      persona,
      characters,
      messages,
      summaryChapters: [summary],
      activeArc: arc,
      fateChecks: [fateCheck],
      provider: envelope.settings.provider,
      mode: "act",
      userInput: "我把坐标片贴近灯塔核心。",
    });
    expect(openAiMessages[0].content).toContain(`Prompt-Contract-Version: ${NARRATIVE_PROMPT_CONTRACT_VERSION}`);
    expect(openAiMessages[0].content).toContain("Skill: evolvria-narrative-turn");
    expect(openAiMessages.slice(1).every((message) => message.role !== "system")).toBe(true);
    expect(openAiMessages.some((message) => message.content.includes("Local System Note: 预算提示"))).toBe(true);
    expect(openAiMessages.at(-1)?.content).toContain("玩家动作");
  });

  it("parses structured provider output and falls back to plain text", () => {
    const parsed = parseProviderContent("```json\n{\"promptContractVersion\":\"external-v1\",\"messages\":[{\"role\":\"assistant\",\"content\":\"结构化回应\",\"safetyFlags\":[\"none\"]}]}\n```");
    expect(parsed.promptContractVersion).toBe("external-v1");
    expect(parsed.messages[0].content).toBe("结构化回应");

    const fallback = parseProviderContent("普通叙事文本");
    expect(fallback.messages[0].role).toBe("assistant");
    expect(fallback.messages[0].content).toBe("普通叙事文本");
  });

  it("redacts provider secrets from prompt previews", () => {
    expect(redactPromptPreviewContent("key sk-live_secret_123456789 and Bearer token.value.123456789")).toBe(
      "key [redacted-secret] and Bearer [redacted-secret]",
    );
  });

  it("validates provider base URLs and calls local-http without an API key", async () => {
    expect(() => normalizeProviderBaseUrl("ftp://localhost:11434/v1", "local-http")).toThrow("provider_invalid_base_url");
    expect(() => normalizeProviderBaseUrl("https://api.example.test/v1", "local-http")).toThrow("provider_local_http_only");
    expect(normalizeProviderBaseUrl("http://localhost:11434/v1/", "local-http")).toBe("http://localhost:11434/v1");

    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = envelope.entities.personas.persona_default_traveler;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
      return new Response(JSON.stringify({ choices: [{ message: { content: "本机模型回应。" } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await generateOpenAICompatible({
        storyline,
        scenario,
        persona,
        characters: storyline.cast.map((cast) => envelope.entities.characters[cast.characterId]),
        messages: [],
        provider: {
          type: "local-http",
          baseUrl: "http://localhost:11434/v1",
          model: "local-test",
          temperature: 0.2,
          maxTokens: 256,
        },
        mode: "say",
        userInput: "你好。",
      });
      expect(response.messages[0].content).toBe("本机模型回应。");
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/v1/chat/completions", expect.objectContaining({
        method: "POST",
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps aborted provider requests to provider_timeout", async () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = envelope.entities.personas.persona_default_traveler;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    ));
    try {
      const request = generateOpenAICompatible({
        storyline,
        scenario,
        persona,
        characters: storyline.cast.map((cast) => envelope.entities.characters[cast.characterId]),
        messages: [],
        provider: {
          type: "local-http",
          baseUrl: "http://localhost:11434/v1",
          model: "local-test",
          temperature: 0.2,
          maxTokens: 256,
        },
        mode: "say",
        userInput: "你好。",
      });
      const assertion = expect(request).rejects.toThrow("provider_timeout");
      await vi.advanceTimersByTimeAsync(45_000);
      await assertion;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("tracks sync operations and resolves conflicts", () => {
    const envelope = createSeedEnvelope();
    const operation = createSyncOperation({
      id: "syncop_test",
      workspaceId: envelope.workspace.id,
      entityType: "storylines",
      entityId: "story_starbloom_frontier",
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    envelope.entities.syncOperations[operation.id] = operation;
    const conflict = createFieldConflict({
      id: "conflict_test",
      operationId: operation.id,
      entityType: "storylines",
      entityId: "story_starbloom_frontier",
      field: "title",
      localValue: "星烬边境",
      remoteValue: "星烬边境 - Cloud Revision",
      createdAt: "2026-07-02T00:01:00.000Z",
    });
    envelope.entities.syncConflicts[conflict.id] = conflict;
    expect(countOpenSyncConflicts(envelope)).toBe(1);
    envelope.entities.syncConflicts[conflict.id] = resolveConflictRecord(conflict, "remote", "2026-07-02T00:02:00.000Z");
    expect(countOpenSyncConflicts(envelope)).toBe(0);
    expect(envelope.entities.syncConflicts[conflict.id].status).toBe("resolved_remote");
  });

  it("pushes and resolves sync changes through the local repository boundary", () => {
    const envelope = createSeedEnvelope();
    let idCount = 0;
    const syncRepository = new LocalSyncRepository({
      now: () => "2026-07-02T00:00:00.000Z",
      id: (prefix) => `${prefix}_test_${++idCount}`,
    });

    const operation = syncRepository.queueOperation(envelope, {
      entityType: "storylines",
      entityId: "story_starbloom_frontier",
      patch: { title: envelope.entities.storylines.story_starbloom_frontier.title },
    });
    expect(operation.status).toBe("queued");
    expect(syncRepository.status(envelope).pendingOperationCount).toBe(1);

    const pushResult = syncRepository.push(envelope);
    expect(pushResult.pushedCount).toBe(1);
    expect(envelope.entities.syncOperations[operation.id].status).toBe("acked");
    expect(pushResult.status.pendingOperationCount).toBe(0);

    const conflictResult = syncRepository.createStorylineConflict(envelope, "story_starbloom_frontier");
    expect(conflictResult.status.status).toBe("conflict");
    expect(conflictResult.status.openConflictCount).toBe(1);

    const remoteResolve = syncRepository.resolveConflict(envelope, conflictResult.conflictId, "remote");
    expect(remoteResolve.resolved).toBe(true);
    expect(remoteResolve.status.status).toBe("ready");
    expect(envelope.entities.storylines.story_starbloom_frontier.title).toContain("Cloud Revision");

    const copyConflict = syncRepository.createStorylineConflict(envelope, "story_starbloom_frontier");
    const beforeStorylineCount = Object.keys(envelope.entities.storylines).length;
    const copyResolve = syncRepository.resolveConflict(envelope, copyConflict.conflictId, "copy");
    expect(copyResolve.resolved).toBe(true);
    expect(Object.keys(envelope.entities.storylines)).toHaveLength(beforeStorylineCount + 1);
  });

  it("exports, imports and disables local sync operation logs without deleting data", () => {
    const source = createSeedEnvelope();
    const target = createSeedEnvelope();
    const operation = createSyncOperation({
      id: "syncop_export_test",
      workspaceId: source.workspace.id,
      entityType: "storylines",
      entityId: "story_starbloom_frontier",
      patch: { title: source.entities.storylines.story_starbloom_frontier.title },
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    const conflict = createFieldConflict({
      id: "conflict_export_test",
      operationId: operation.id,
      entityType: "storylines",
      entityId: "story_starbloom_frontier",
      field: "title",
      localValue: "星烬边境",
      remoteValue: "星烬边境 - Device B",
      createdAt: "2026-07-02T00:01:00.000Z",
    });
    source.entities.syncOperations[operation.id] = operation;
    source.entities.syncConflicts[conflict.id] = conflict;

    const snapshot = buildSyncDeviceSnapshot(source, "2026-07-02T00:02:00.000Z");
    const operationLog = createSyncOperationLogPackage(source, "2026-07-02T00:03:00.000Z");
    const imported = importSyncOperationLogPackage(target, operationLog, "2026-07-02T00:04:00.000Z");
    const skipped = importSyncOperationLogPackage(target, operationLog, "2026-07-02T00:05:00.000Z");
    const disabled = disableSyncRetainingLocalData(target);

    expect(snapshot.privacy.includesChats).toBe(false);
    expect(snapshot.privacy.includesApiKeys).toBe(false);
    expect(snapshot.entityCounts.storylines).toBeGreaterThan(0);
    expect(operationLog.format).toBe("evolvria_sync_operation_log");
    expect(operationLog.summary.operationCount).toBe(1);
    expect(operationLog.privacy.includesApiKeys).toBe(false);
    expect(imported.importedOperations).toBe(1);
    expect(imported.importedConflicts).toBe(1);
    expect(skipped.skippedOperations).toBe(1);
    expect(skipped.skippedConflicts).toBe(1);
    expect(target.entities.syncOperations.syncop_export_test.patch).toEqual({ title: "星烬边境" });
    expect(disabled.status).toBe("local_only");
    expect(disabled.enabled).toBe(false);
    expect(target.entities.syncOperations.syncop_export_test).toBeTruthy();
    expect(() => importSyncOperationLogPackage({ ...target, workspace: { ...target.workspace, id: "other_workspace" } }, operationLog, "2026-07-02T00:06:00.000Z")).toThrow("sync_log_workspace_mismatch");
  });

  it("applies credit ledger adjustments", () => {
    const envelope = createSeedEnvelope();
    const entry = {
      id: "ledger_test",
      provider: "mock",
      model: "evolvria-mock",
      operation: "chat" as const,
      estimatedTokens: 100,
      estimatedCost: 1.2,
      status: "pending" as const,
      adjustmentIds: [],
      currency: "credit" as const,
      createdAt: "2026-07-02T00:00:00.000Z",
    };
    const adjustment = createCreditAdjustment(entry, {
      id: "adjustment_test",
      kind: "refund",
      reason: "test",
      createdAt: "2026-07-02T00:01:00.000Z",
    });
    envelope.entities.creditLedger[entry.id] = applyCreditAdjustment(entry, adjustment);
    envelope.entities.creditAdjustments[adjustment.id] = adjustment;
    expect(envelope.entities.creditLedger[entry.id].status).toBe("refunded");
    expect(envelope.entities.creditLedger[entry.id].adjustmentIds).toContain("adjustment_test");
  });

  it("builds and verifies a manifest-backed workspace package", () => {
    const envelope = createSeedEnvelope();
    const workspacePackage = createWorkspacePackage(envelope, "2026-07-02T00:00:00.000Z");
    const parsed = readWorkspacePackage(workspacePackage);
    const report = verifyWorkspacePackage(workspacePackage);

    expect(parsed.envelope?.workspace.id).toBe(envelope.workspace.id);
    expect(workspacePackage.manifest.assetRefs.referenced).toContain("media_starbloom_cover");
    expect(report.ok).toBe(true);
    expect(report.format).toBe("evolvria_workspace_package");
    expect(report.entityCounts.storylines).toBeGreaterThan(0);
  });

  it("exports scoped storyline packages with dependencies only", () => {
    const envelope = createSeedEnvelope();
    const storylinePackage = createStorylineWorkspacePackage(envelope, "story_starbloom_frontier", "2026-07-02T00:00:00.000Z");
    const report = verifyWorkspacePackage(storylinePackage);

    expect(storylinePackage.manifest.workspaceName).toBe("星烬边境 Package");
    expect(storylinePackage.manifest.entityCounts.storylines).toBe(1);
    expect(storylinePackage.manifest.entityCounts.characters).toBe(2);
    expect(storylinePackage.manifest.entityCounts.chats).toBe(0);
    expect(storylinePackage.save.entities.storylines.story_starbloom_frontier).toBeTruthy();
    expect(Object.keys(storylinePackage.save.entities.personas)).toHaveLength(0);
    expect(report.ok).toBe(true);
  });

  it("builds browser asset inventory from workspace metadata", () => {
    const envelope = createSeedEnvelope();
    const inventory = buildBrowserAssetInventory(envelope);

    expect(inventory.rootPath).toBe("browser_local_storage");
    expect(inventory.stats.declaredAssets).toBe(Object.keys(envelope.entities.mediaAssets).length);
    expect(inventory.stats.referencedAssets).toBeGreaterThan(0);
    expect(inventory.stats.physicalFiles).toBe(0);
    expect(inventory.assets.some((asset) => asset.id === "media_starbloom_cover" && asset.referenced)).toBe(true);
  });

  it("builds browser message pages matching the native SQLite window contract", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = envelope.entities.personas.persona_default_traveler;
    const { chat, openingMessages } = createChatSession(storyline, scenario, persona);
    envelope.entities.chats[chat.id] = chat;
    for (const message of openingMessages) envelope.entities.messages[message.id] = message;
    for (let index = 0; index < 12; index += 1) {
      const id = `msg_page_unit_${index}`;
      envelope.entities.messages[id] = {
        id,
        chatId: chat.id,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `分页消息 ${index}`,
        safetyFlags: ["none"],
        createdAt: `2026-07-02T00:${String(index).padStart(2, "0")}:00.000Z`,
      };
      chat.messageIds.push(id);
    }
    envelope.entities.chats[chat.id] = chat;

    const latest = buildBrowserMessagePage(envelope, chat.id, 5, 0);
    const older = buildBrowserMessagePage(envelope, chat.id, 5, latest.nextOffsetFromEnd);

    expect(latest.totalCount).toBe(chat.messageIds.length);
    expect(latest.messages.map((message) => message.content)).toEqual(["分页消息 7", "分页消息 8", "分页消息 9", "分页消息 10", "分页消息 11"]);
    expect(latest.hasOlder).toBe(true);
    expect(older.endIndex).toBe(latest.startIndex);
    expect(older.hasNewer).toBe(true);
  });

  it("builds a non-destructive asset maintenance plan", () => {
    const envelope = createSeedEnvelope();
    const inventory = buildBrowserAssetInventory(envelope);
    inventory.assets.push({
      id: "media_browser_temp",
      kind: "image",
      purpose: "cover",
      relativePath: "browser://temp.png",
      sourceKind: "imported",
      referenced: true,
      physicalStatus: "browser_only",
      declaredSizeBytes: 1024,
      variantCount: 0,
    });
    inventory.assets.push({
      id: "media_missing",
      kind: "video",
      purpose: "background",
      relativePath: "assets/video/missing.mp4",
      sourceKind: "generated",
      referenced: true,
      physicalStatus: "missing",
      declaredSizeBytes: 2048,
      variantCount: 0,
    });
    inventory.untrackedFiles.push({
      relativePath: "assets/video/orphan.mp4",
      sizeBytes: 4096,
      folder: "video",
      supported: true,
      tracked: false,
    });

    const plan = buildAssetMaintenancePlan(inventory);

    expect(plan.summary.publishBlockers).toBe(2);
    expect(plan.actions.some((action) => action.kind === "replace_placeholder_asset")).toBe(true);
    expect(plan.actions.some((action) => action.kind === "reimport_browser_asset" && action.publishBlocker)).toBe(true);
    expect(plan.actions.some((action) => action.kind === "restore_missing_asset" && action.severity === "error")).toBe(true);
    expect(plan.summary.estimatedRecoverableBytes).toBeGreaterThanOrEqual(4096);
  });

  it("rejects packages with missing assets or leaked secrets", () => {
    const envelope = createSeedEnvelope();
    const broken = {
      ...envelope,
      entities: {
        ...envelope.entities,
        storylines: {
          ...envelope.entities.storylines,
          story_starbloom_frontier: {
            ...envelope.entities.storylines.story_starbloom_frontier,
            mediaIds: ["media_missing"],
            premise: "Leaked token sk-test-12345678901234567890",
          },
        },
      },
    };
    const report = verifyWorkspacePackage(createWorkspacePackage(broken));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.field === "assets.media_missing")).toBe(true);
    expect(report.issues.some((issue) => issue.field === "secrets")).toBe(true);
  });

  it("normalizes older save envelopes with new sync and billing maps", () => {
    const envelope = createSeedEnvelope();
    const legacy = {
      ...envelope,
      entities: {
        ...envelope.entities,
        creditLedger: {
          legacy_ledger: {
            id: "legacy_ledger",
            provider: "mock",
            model: "evolvria-mock",
            operation: "chat",
            estimatedTokens: 12,
            estimatedCost: 0,
            currency: "local_estimate",
            createdAt: "2026-07-02T00:00:00.000Z",
          },
        },
        creditAdjustments: undefined,
        syncOperations: undefined,
        syncConflicts: undefined,
      },
    };
    const normalized = normalizeEnvelope(legacy as never);
    expect(normalized.entities.creditLedger.legacy_ledger.status).toBe("estimated");
    expect(normalized.entities.creditLedger.legacy_ledger.adjustmentIds).toEqual([]);
    expect(normalized.entities.creditAdjustments).toEqual({});
    expect(normalized.entities.syncOperations).toEqual({});
    expect(normalized.entities.syncConflicts).toEqual({});
  });

  it("windows long chat messages while search still scans the full chat", () => {
    const messages = Array.from({ length: 95 }, (_, index) => ({
      id: `msg_window_${index}`,
      chatId: "chat_window",
      role: index % 2 ? "assistant" as const : "user" as const,
      content: index === 3 ? "隐藏的坐标片线索" : `消息 ${index}`,
      safetyFlags: ["none" as const],
      createdAt: "2026-07-02T00:00:00.000Z",
    }));

    const latest = createMessageWindow(messages, 80);
    const expanded = createMessageWindow(messages, 160);
    const searched = createMessageWindow(messages, 80, "坐标片");

    expect(latest.messages).toHaveLength(80);
    expect(latest.hiddenCount).toBe(15);
    expect(latest.messages[0].id).toBe("msg_window_15");
    expect(expanded.hiddenCount).toBe(0);
    expect(searched.messages).toHaveLength(1);
    expect(searched.messages[0].id).toBe("msg_window_3");
  });

  it("searches, exports and rolls back chat messages", () => {
    const envelope = createSeedEnvelope();
    const storyline = envelope.entities.storylines.story_starbloom_frontier;
    const scenario = envelope.entities.scenarios.scenario_starbloom_beacon;
    const persona = {
      id: "persona_test",
      name: "测试旅人",
      description: "谨慎的调查员",
      preferences: [],
      boundaries: [],
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    };
    const { chat, openingMessages } = createChatSession(storyline, scenario, persona);
    const result = appendUserMessage(chat, "我检查坐标片。", "act", openingMessages);
    const messages = [...openingMessages, result.message];
    expect(searchChatMessages(messages, "坐标片")).toHaveLength(2);
    const markdown = formatChatExcerptMarkdown({
      title: chat.title,
      storylineTitle: storyline.title,
      personaName: persona.name,
      messages: searchChatMessages(messages, "坐标片"),
    });
    expect(markdown).toContain("# 星烬边境 / 灯塔第一次熄灭");
    expect(markdown).toContain("我检查坐标片。");
    const rolledBack = rollbackChatToCheckpoint(result.chat, result.checkpoint, "msg_rollback");
    expect(rolledBack.messageIds).toEqual([...openingMessages.map((message) => message.id), "msg_rollback"]);
  });
});

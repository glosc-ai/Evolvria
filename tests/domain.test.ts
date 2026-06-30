import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { defaultSeed, mockPlayerAction } from "@/domain/fixtures";
import {
  addCustomLocation,
  addRoute,
  aiUsageSummary,
  applyPlayerAction,
  applyStatePatch,
  applyWorldExpansion,
  createInitialPayload,
  currentLocation,
  retrieveMemories,
  timelineFiltered,
  validatePayloadSchema,
  validateWorldConsistency,
} from "@/domain/world";
import { estimateUsage, normalizeGloscPlayerAction, normalizeGloscWorldExpansion } from "@/services/ai";
import { DEFAULT_SETTINGS } from "@/services/settings";

describe("world domain", () => {
  it("creates a schema-valid local-first world", () => {
    const payload = createInitialPayload(defaultSeed());
    expect(validatePayloadSchema(payload)).toBe(true);
    expect(payload.characters.length).toBeGreaterThanOrEqual(3);
    expect(payload.locations.length).toBeGreaterThanOrEqual(4);
    expect(payload.factions.length).toBeGreaterThanOrEqual(3);
    expect(payload.threads.length).toBeGreaterThanOrEqual(2);
    expect(payload.world.map_image.generator?.source_project).toBe("Azgaar/Fantasy-Map-Generator");
  });

  it("uses custom key character names in local guidance", () => {
    const seed = defaultSeed();
    seed.key_characters[0] = { ...seed.key_characters[0], name: "Mira" };
    const payload = createInitialPayload(seed);
    expect(payload.suggested_actions).toContain("询问Mira旧档案");

    const result = mockPlayerAction("调查公告板徽记", {
      characters: payload.characters.map((character) => ({
        id: character.id,
        name: character.name,
        companion: character.companion,
      })),
    });
    expect(result.narrative).toContain("Mira提醒你");
    expect(result.suggested_actions).toContain("询问Mira旧档案");
    expect(result.relationship_updates[0]?.source_id).toBe("char_001");
  });

  it("rejects patches that overwrite confirmed player facts", () => {
    const payload = createInitialPayload(defaultSeed());
    expect(
      applyStatePatch(payload, {
        target_type: "character",
        target_id: "char_001",
        op: "set",
        path: "name",
        value: "改名",
      }),
    ).toBe(false);
    expect(
      applyStatePatch(payload, {
        target_type: "location",
        target_id: "loc_start",
        op: "set",
        path: "description",
        value: "覆盖描述",
      }),
    ).toBe(false);
  });

  it("applies player action without breaking consistency", () => {
    const payload = createInitialPayload(defaultSeed());
    const next = applyPlayerAction(payload, mockPlayerAction("调查驿站公告上的徽记"), "调查驿站公告上的徽记");
    expect(next.timeline.length).toBe(payload.timeline.length + 1);
    expect(next.memories.length).toBeGreaterThan(payload.memories.length);
    expect(next.threads.some((thread) => thread.progress.length > 0)).toBe(true);
    expect(validateWorldConsistency(next)).toEqual([]);
  });

  it("accepts Vue reactive payloads from runtime stores", () => {
    const payload = reactive(createInitialPayload(defaultSeed()));
    const next = applyPlayerAction(payload, mockPlayerAction("调查公告板徽记"), "调查公告板徽记");
    expect(next.timeline.length).toBe(2);
    expect(next.suggested_actions.length).toBeGreaterThan(0);
  });

  it("filters timeline and retrieves relevant memories", () => {
    let payload = createInitialPayload(defaultSeed());
    payload = applyPlayerAction(payload, mockPlayerAction("调查徽记"), "调查徽记");
    expect(timelineFiltered(payload, "player_action", "char_hero", "loc_start")).toHaveLength(1);
    expect(retrieveMemories(payload, "徽记", "loc_start", ["char_hero"], 4).length).toBeGreaterThan(0);
  });

  it("edits map annotations and routes", () => {
    let payload = createInitialPayload(defaultSeed());
    payload = addCustomLocation(payload, "风铃渡口", "harbor", "新标注地点", { x: 0.7, y: 0.7 });
    expect(payload.locations.some((location) => location.name === "风铃渡口")).toBe(true);
    payload = addRoute(payload, currentLocation(payload)!.id, payload.locations.at(-1)!.id);
    expect(payload.world.map_routes.length).toBeGreaterThan(3);
  });

  it("estimates AI usage and aggregates logs", () => {
    const estimate = estimateUsage("world_expand", defaultSeed(), DEFAULT_SETTINGS);
    expect(estimate.purpose_label).toBe("世界扩写");
    expect(estimate.total_tokens).toBeGreaterThan(estimate.output_tokens);
    const payload = createInitialPayload(defaultSeed());
    expect(aiUsageSummary(payload.ai_logs).calls).toBe(0);
  });

  it("normalizes wrapped Glosc player-action responses", () => {
    const remoteResult = mockPlayerAction("确认白塔徽记");
    const normalized = normalizeGloscPlayerAction({
      status: "ok",
      parsed: remoteResult,
      content: JSON.stringify(remoteResult),
      usage: { input_tokens: 123, output_tokens: 45 },
    });
    expect(normalized?.narrative).toContain("确认白塔徽记");
    expect(normalized?.usage?.input_tokens).toBe(123);
    expect(normalizeGloscPlayerAction({ status: "ok", parsed: { narrative: "缺字段" } })).toBeNull();
  });

  it("normalizes wrapped Glosc world-expand responses", () => {
    const seed = defaultSeed();
    const normalized = normalizeGloscWorldExpansion(
      {
        status: "ok",
        parsed: {
          world: { summary: "远端生成的苍星纪元摘要。" },
          opening: {
            title: "远端开局",
            description: "远端开局叙事让白塔徽记立刻可感。",
            suggested_actions: ["追问远端线索", "记录白塔徽记"],
          },
        },
        content: "{\"world\":{\"summary\":\"远端生成的苍星纪元摘要。\"}}",
        usage: { input_tokens: 321, output_tokens: 654 },
      },
      seed,
    );
    expect(normalized.summary).toBe("远端生成的苍星纪元摘要。");
    expect(normalized.openingTitle).toBe("远端开局");
    expect(normalized.openingNarrative).toContain("远端开局叙事");
    expect(normalized.suggestedActions).toEqual(["追问远端线索", "记录白塔徽记"]);
  });

  it("applies world expansion to visible summary and opening state", () => {
    const payload = createInitialPayload(defaultSeed());
    const next = applyWorldExpansion(payload, {
      summary: "远端摘要已经写入世界状态。",
      openingTitle: "远端开局事件",
      openingNarrative: "远端叙事替换了固定开场，玩家能立刻看到结果。",
      suggestedActions: ["查看远端摘要"],
    });
    expect(next.world.summary).toBe("远端摘要已经写入世界状态。");
    expect(next.timeline[0].title).toBe("远端开局事件");
    expect(next.timeline[0].description).toContain("远端叙事");
    expect(next.memories[0].text).toBe("远端摘要已经写入世界状态。");
    expect(next.suggested_actions).toEqual(["查看远端摘要"]);
    expect(payload.world.summary).not.toBe(next.world.summary);
  });
});

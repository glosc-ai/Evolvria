import { describe, expect, it } from "vitest";
import { defaultSeed, mockPlayerAction } from "@/domain/fixtures";
import {
  addCustomLocation,
  addRoute,
  aiUsageSummary,
  applyPlayerAction,
  applyStatePatch,
  createInitialPayload,
  currentLocation,
  retrieveMemories,
  timelineFiltered,
  validatePayloadSchema,
  validateWorldConsistency,
} from "@/domain/world";
import { estimateUsage } from "@/services/ai";
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
});

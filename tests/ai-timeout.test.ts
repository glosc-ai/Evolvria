import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSeed } from "@/domain/fixtures";
import { createInitialPayload } from "@/domain/world";
import { remoteTimeoutSecondsForPurpose, resolvePlayerAction } from "@/services/ai";
import { DEFAULT_SETTINGS } from "@/services/settings";

vi.mock("@/services/ai-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ai-sdk")>();
  return {
    ...actual,
    callAiSdkJson: vi.fn(() => new Promise(() => undefined)),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("AI remote timeout fallback", () => {
  it("caps player-action remote waits below the user setting", () => {
    expect(remoteTimeoutSecondsForPurpose("player_action", 180)).toBe(20);
    expect(remoteTimeoutSecondsForPurpose("player_action", 3)).toBe(5);
    expect(remoteTimeoutSecondsForPurpose("world_expand", 180)).toBe(180);
  });

  it("falls back to the local mock when the player-action SDK call never settles", async () => {
    vi.useFakeTimers();
    const seed = defaultSeed();
    const payload = createInitialPayload(seed);
    const settings = {
      ...DEFAULT_SETTINGS,
      glosc_token: "test-token",
      timeout_seconds: 180,
    };
    const action = "在银潮港找到镜潮核心并打破轮回";
    const resultPromise = resolvePlayerAction(
      action,
      {
        scene_state: {
          current_location: payload.locations.find((location) => location.id === "loc_harbor"),
        },
        characters: payload.characters.map((character) => ({
          id: character.id,
          name: character.name,
          companion: character.companion,
        })),
      },
      settings,
    );

    await vi.advanceTimersByTimeAsync(remoteTimeoutSecondsForPurpose("player_action", settings.timeout_seconds) * 1000 + 251);

    const result = await resultPromise;
    expect(result.status).toBe("ok");
    expect(result.narrative).toContain("镜潮核心");
    expect(result.warnings?.join("")).toContain("已使用本地模拟结果");
    expect(result.warnings?.join("")).toContain("20 秒");
  });
});

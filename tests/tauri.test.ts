import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { jsonSafeInvokeArgs } from "@/services/tauri";

describe("tauri service", () => {
  it("converts reactive invoke args into cloneable JSON values", () => {
    const args = reactive({
      request: {
        payload: {
          action: "调查公告板徽记",
          context: {
            world: { id: "world_001", name: "烟测世界" },
            recent_events: [{ id: "evt_001", title: "开局事件" }],
          },
        },
      },
    });

    expect(() => structuredClone(args)).toThrow();

    const plain = jsonSafeInvokeArgs(args);

    expect(() => structuredClone(plain)).not.toThrow();
    expect(plain).toEqual({
      request: {
        payload: {
          action: "调查公告板徽记",
          context: {
            world: { id: "world_001", name: "烟测世界" },
            recent_events: [{ id: "evt_001", title: "开局事件" }],
          },
        },
      },
    });
  });
});

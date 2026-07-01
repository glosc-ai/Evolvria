import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { asSchema, type FlexibleSchema } from "ai";
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
  findTravelActionTarget,
  retrieveMemories,
  timelineFiltered,
  validatePayloadSchema,
  validateWorldConsistency,
} from "@/domain/world";
import { completeSeedCharacter, estimateUsage, generateWorld, normalizeGloscPlayerAction, normalizeGloscWorldExpansion, normalizeSeedCharacterCompletion } from "@/services/ai";
import { normalizeOpenAiBaseUrl, parseAiJsonish } from "@/services/ai-sdk";
import { createEvolvriaBuiltInSkills, createEvolvriaSkillRuntime, loadPublicSkillDefinitions, parsePublicSkillMarkdown, skillManifest } from "@/services/ai-skills";
import { importWorldFromText } from "@/services/save";
import { DEFAULT_SETTINGS } from "@/services/settings";
import { buildSeedWorkspaceAiContext, buildWorkspaceAiContext, buildWorldWorkspaceFiles } from "@/services/world-workspace";
import { useWorldStore } from "@/stores/world";
import type { Character, PlayerActionResult, SavePayload } from "@/types/domain";

describe("world domain", () => {
  it("creates a schema-valid local-first world", () => {
    const payload = createInitialPayload(defaultSeed());
    expect(validatePayloadSchema(payload)).toBe(true);
    expect(payload.characters.length).toBeGreaterThanOrEqual(3);
    expect(payload.characters.find((character) => character.id === "char_001")?.gender).toBe("女");
    expect(payload.locations.length).toBeGreaterThanOrEqual(4);
    expect(payload.world.map_regions?.length).toBeGreaterThanOrEqual(4);
    expect(payload.world.map_locked).toBe(true);
    expect(payload.locations.every((location) => Boolean(location.region_id))).toBe(true);
    expect(payload.locations.some((location) => location.connected_location_ids.length > 0)).toBe(true);
    expect(payload.factions.length).toBeGreaterThanOrEqual(3);
    expect(payload.threads.length).toBeGreaterThanOrEqual(2);
    expect(payload.world.map_image.generator?.source_project).toBe("Azgaar/Fantasy-Map-Generator");
    expect(payload.world.map_image.generator?.mode).toBe("azgaar_adapter");
    expect(payload.world.map_image.generator?.creation_only).toBe(true);
  });

  it("matches exact travel action text to location targets", () => {
    const payload = createInitialPayload(defaultSeed());
    expect(findTravelActionTarget("前往白塔遗迹", payload.locations)?.id).toBe("loc_ruin");
    expect(findTravelActionTarget("前往 白塔遗迹。", payload.locations)?.id).toBe("loc_ruin");
    expect(findTravelActionTarget("前往白塔遗迹调查墙面", payload.locations)).toBeUndefined();
  });

  it("routes explicit travel actions through movement instead of AI resolution", async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const store = useWorldStore();
    store.payload = createInitialPayload(defaultSeed());
    const timelineLength = store.timeline.length;

    await store.submitPlayerAction("前往白塔遗迹");

    expect(store.current?.id).toBe("loc_ruin");
    expect(store.timeline).toHaveLength(timelineLength);
    expect(store.aiLogs).toHaveLength(0);
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

  it("keeps local fallback clues specific to the current story beat", () => {
    const payload = createInitialPayload(defaultSeed());
    const result = mockPlayerAction("询问璃安旧档案", {
      scene_state: { current_location: payload.locations.find((location) => location.id === "loc_ruin") },
      characters: payload.characters.map((character) => ({
        id: character.id,
        name: character.name,
        companion: character.companion,
      })),
    });

    expect(result.narrative).toContain("白塔坍塌前的巡检页");
    expect(result.narrative).toContain("银潮港转运簿");
    expect(result.events[0]?.location_id).toBe("loc_ruin");
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

  it("completes the main story when the final goal action resolves the core", () => {
    let payload = createInitialPayload(defaultSeed());
    payload = applyPlayerAction(payload, mockPlayerAction("调查公告板徽记"), "调查公告板徽记");
    payload = applyPlayerAction(payload, mockPlayerAction("调查白塔残墙徽记"), "调查白塔残墙徽记");
    payload = applyPlayerAction(payload, mockPlayerAction("在银潮港找到镜潮核心并打破轮回"), "在银潮港找到镜潮核心并打破轮回");

    expect(payload.world.ending?.title).toBe("镜潮核心结局");
    expect(payload.timeline.at(-1)?.type).toBe("story_ending");
    expect(payload.threads.every((thread) => thread.status === "resolved")).toBe(true);
    expect(payload.suggested_actions).toContain("回顾结局");
    expect(validateWorldConsistency(payload)).toEqual([]);
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

  it("locks map structure after world creation", () => {
    let payload = createInitialPayload(defaultSeed());
    payload = addCustomLocation(payload, "风铃渡口", "harbor", "新标注地点", { x: 0.7, y: 0.7 });
    expect(payload.locations.some((location) => location.name === "风铃渡口")).toBe(false);
    const routeCount = payload.world.map_routes.length;
    payload = addRoute(payload, currentLocation(payload)!.id, payload.locations.at(-1)!.id);
    expect(payload.world.map_routes.length).toBe(routeCount);
    expect(
      applyStatePatch(payload, {
        target_type: "world",
        target_id: payload.world.id,
        op: "set",
        path: "map_regions",
        value: [],
      }),
    ).toBe(false);
    expect(
      applyStatePatch(payload, {
        target_type: "location",
        target_id: "loc_start",
        op: "set",
        path: "type",
        value: "city",
      }),
    ).toBe(false);
    expect(
      applyStatePatch(payload, {
        target_type: "location",
        target_id: "loc_harbor",
        op: "set",
        path: "visibility",
        value: "known_to_player",
      }),
    ).toBe(true);
  });

  it("estimates AI usage and aggregates logs", () => {
    const estimate = estimateUsage("world_expand", defaultSeed(), DEFAULT_SETTINGS);
    expect(estimate.purpose_label).toBe("世界扩写");
    expect(estimate.total_tokens).toBeGreaterThan(estimate.output_tokens);
    const payload = createInitialPayload(defaultSeed());
    expect(aiUsageSummary(payload.ai_logs).calls).toBe(0);
  });

  it("falls back to local world expansion with a user-facing warning", async () => {
    const result = await generateWorld(defaultSeed(), DEFAULT_SETTINGS);
    expect(result.status).toBe("ok");
    expect(result.fallback).toBe(true);
    expect(result.warnings?.[0]).toContain("未配置远端 AI");
    expect(result.summary).toContain("本地扩写");
  });

  it("normalizes OpenAI-compatible base URLs for AI SDK", () => {
    expect(normalizeOpenAiBaseUrl("https://one.gloscai.com")).toBe("https://one.gloscai.com/v1");
    expect(normalizeOpenAiBaseUrl("https://one.gloscai.com/v1")).toBe("https://one.gloscai.com/v1");
    expect(normalizeOpenAiBaseUrl("https://one.gloscai.com/v1/chat/completions")).toBe("https://one.gloscai.com/v1");
  });

  it("parses fenced JSON from OpenAI-compatible response envelopes", () => {
    const parsed = parseAiJsonish({
      choices: [
        {
          message: {
            content: '```json\n{"status":"OK","character":{"name":"测试者"},"used_skills":["generateCharacter","createCharacterCard"]}\n```',
            reasoning_content: "模型的思考内容不会被当作最终 JSON。",
          },
        },
      ],
    }) as { status?: string; character?: { name?: string }; used_skills?: string[] };
    expect(parsed.status).toBe("OK");
    expect(parsed.character?.name).toBe("测试者");
    expect(parsed.used_skills).toEqual(["generateCharacter", "createCharacterCard"]);
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

  it("builds a folder-style world workspace with AGENTS.md as the entrypoint", () => {
    const payload = createInitialPayload(defaultSeed());
    const files = buildWorldWorkspaceFiles(payload);
    const paths = files.map((file) => file.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("state/payload.json");
    expect(paths).toContain("world/OVERVIEW.md");
    expect(paths).toContain("memory/MEMORY.md");
    expect(paths).toContain("maps/MAP.md");
    expect(paths).toContain("history/TIMELINE.md");
    expect(paths).toContain("threads/THREADS.md");
    expect(paths).toContain("characters/char_hero.md");
    expect(paths).toContain("locations/loc_start.md");
    expect(files.find((file) => file.path === "AGENTS.md")?.content).toContain("每次处理世界模拟");
  });

  it("loads AGENTS.md and scoped workspace files into AI context", () => {
    const payload = createInitialPayload(defaultSeed());
    const context = buildWorkspaceAiContext(payload, {
      currentLocationId: "loc_start",
      participantIds: ["char_hero"],
    });
    expect(context.instructions_path).toBe("AGENTS.md");
    expect(context.loaded_files[0].path).toBe("AGENTS.md");
    expect(context.loaded_files.map((file) => file.path)).toContain("locations/loc_start.md");
    expect(context.loaded_files.map((file) => file.path)).toContain("characters/char_hero.md");
    expect(context.available_files.length).toBeGreaterThan(context.loaded_files.length);
  });

  it("wraps new-world expansion in seed workspace instructions", () => {
    const context = buildSeedWorkspaceAiContext(defaultSeed());
    expect(context.loaded_files.map((file) => file.path)).toEqual(["AGENTS.md", "world/SEED.md"]);
    expect(context.instructions).toContain("新世界创建请求");
  });

  it("exposes runtime-bound AI SDK skills for world operations", async () => {
    const seed = defaultSeed();
    const payload = createInitialPayload(seed);
    const runtime = createEvolvriaSkillRuntime("player_action", {
      action: "调查徽记",
      context: { characters: payload.characters },
    });
    const skills = createEvolvriaBuiltInSkills({ ...runtime, seed, payload });

    const initialized = (await runTool(skills.initializeWorld.execute, {})) as SavePayload;
    expect(validatePayloadSchema(initialized)).toBe(true);

    const created = (await runTool(skills.createWorld.execute, {})) as SavePayload;
    expect(validatePayloadSchema(created)).toBe(true);

    const progressed = (await runTool(skills.advanceWorldProgress.execute, {
      description: "远方势力推进了计划。",
    })) as SavePayload;
    expect(progressed.timeline.at(-1)?.type).toBe("world_progress");

    const actionResult = (await runTool(skills.triggerPlayerAction.execute, {})) as PlayerActionResult;
    expect(actionResult.narrative).toContain("调查徽记");

    const recorded = (await runTool(skills.recordEvent.execute, {
      event: {
        title: "测试事件",
        description: "记录事件 skill 被调用。",
      },
    })) as SavePayload;
    expect(recorded.timeline.at(-1)?.title).toBe("测试事件");

    const character = (await runTool(skills.generateCharacter.execute, {
      name: "洛安",
      gender: "男",
      role: "档案员",
      description: "在边境驿站整理旧档案的年轻学者。",
    })) as Character;
    expect(character.id).toMatch(/^char_/);
    expect(character.appearance_description).toContain("洛安");

    const card = (await runTool(skills.createCharacterCard.execute, {
      name: "洛安",
      gender: "男",
      role: "档案员",
      description: "在边境驿站整理旧档案的年轻学者。",
      world_name: seed.world_name,
      genre: seed.genre,
      tone: seed.tone,
    })) as { appearance_description: string; portrait_prompt: string };
    expect(card.appearance_description).toContain("洛安");
    expect(card.portrait_prompt).toContain("洛安");

    const mcpInfo = (await runTool(skills.evolvriaGameMcp.execute, {})) as { server_script?: string };
    expect(mcpInfo.server_script).toBe("scripts/evolvria-mcp.mjs");

    const fileList = (await runTool(skills.readWorkspaceFile.execute, {})) as { files?: string[] };
    expect(fileList.files).toContain("AGENTS.md");

    const agentsFile = (await runTool(skills.readWorkspaceFile.execute, { path: "AGENTS.md" })) as { content?: string };
    expect(agentsFile.content).toContain("Evolvria 世界工作区");

    const editedPayload = (await runTool(skills.editWorkspaceFile.execute, {
      path: "state/payload.json",
      content: JSON.stringify(payload),
    })) as { payload?: SavePayload };
    expect(validatePayloadSchema(editedPayload.payload)).toBe(true);

    const characterUpdated = (await runTool(skills.modifyCharacterData.execute, {
      character_id: "char_001",
      updates: {
        player_notes: "MCP 工具写入的角色备注。",
        visibility: "met",
      },
    })) as SavePayload;
    expect(characterUpdated.characters.find((item) => item.id === "char_001")?.player_notes).toContain("MCP 工具");

    const backup = (await runTool(skills.backupSave.execute, { reason: "单元测试备份" })) as { status?: string };
    expect(backup.status).toBe("ok");

    const saveFormat = (await runTool(skills.workspaceSaveFormat.execute, { topic: "ai-context" })) as string;
    expect(saveFormat).toContain("AGENTS.md");
    expect(saveFormat).toContain("state/payload.json");
  });

  it("keeps AI SDK tool input schemas JSON Schema compatible", async () => {
    const skills = createEvolvriaBuiltInSkills();
    for (const [name, skill] of Object.entries(skills)) {
      const schema = (skill as { inputSchema?: FlexibleSchema }).inputSchema;
      await expect(Promise.resolve(asSchema(schema).jsonSchema), name).resolves.toEqual(expect.any(Object));
    }
  });

  it("requires configured remote AI for seed character smart generation", async () => {
    const seed = defaultSeed();
    const result = await completeSeedCharacter(
      {
        kind: "key_character",
        seed,
        character: { ...seed.key_characters[0], description: "" },
      },
      DEFAULT_SETTINGS,
    );
    expect(result.status).toBe("error");
    expect(result.fields).toEqual({});
    expect(result.error).toContain("AI 大模型");
    expect(result.used_skills).toEqual([]);
  });

  it("writes seed character completion fields from wrapped AI JSON", () => {
    const seed = defaultSeed();
    const rawResponse = {
      choices: [
        {
          message: {
            content: [
              "```json",
              JSON.stringify({
                status: "OK",
                character: {
                  name: "测试者",
                  gender: "其他",
                  description: "一位穿行在世界裂隙之间的记录员，以冷静目光审视万物运行的法则。",
                  goal: "验证世界循环",
                  ability: "观察,推理",
                  weakness: "过度谨慎",
                  appearance_description: "身形清瘦，中短发利落束于耳后，常穿深灰旅行长袍并随身携带厚重皮质记录本。",
                },
                used_skills: ["generateCharacter"],
                warnings: [],
              }),
              "```",
            ].join("\n"),
          },
        },
      ],
    };
    const result = normalizeSeedCharacterCompletion(
      {
        kind: "hero",
        seed,
        character: { ...seed.hero },
      },
      {
        parsed: rawResponse,
        content: JSON.stringify(rawResponse),
        toolCalls: ["createCharacterCard"],
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    );
    expect(result.status).toBe("ok");
    expect(result.fields.name).toBe(seed.hero.name);
    expect(result.fields.gender).toBe("其他");
    expect(result.fields.description).toContain("世界裂隙");
    expect(result.fields.appearance_description).toContain("深灰旅行长袍");
    expect(result.used_skills).toEqual(["generateCharacter", "createCharacterCard"]);
  });

  it("parses public SKILL.md files for AI skill manifests", () => {
    const parsed = parsePublicSkillMarkdown(
      "initialize-world/SKILL.md",
      [
        "---",
        "name: initialize-world",
        "title: 初始化世界",
        "description: 从 public skill 文件读取的初始化说明。",
        "runtime_context: 可使用当前 seed",
        "---",
        "# 初始化世界",
        "",
        "根据 WorldSeed 生成世界。",
      ].join("\n"),
      "initialize-world",
    );
    const manifest = skillManifest(parsed ? [parsed] : []);
    const initializeSkill = manifest.find((skill) => skill.name === "initialize-world");
    expect(initializeSkill?.tool_name).toBe("initializeWorld");
    expect(initializeSkill?.description).toBe("从 public skill 文件读取的初始化说明。");
    expect(initializeSkill?.content).toContain("根据 WorldSeed");

    const workspaceParsed = parsePublicSkillMarkdown(
      "workspace-save-format/SKILL.md",
      [
        "---",
        "name: workspace-save-format",
        "description: 文件夹式世界存档规则。",
        "---",
        "# Workspace Save Format",
        "",
        "AGENTS.md 是 AI 入口，state/payload.json 是权威状态。",
      ].join("\n"),
      "workspace-save-format",
    );
    const workspaceSkill = skillManifest(workspaceParsed ? [workspaceParsed] : []).find((skill) => skill.name === "workspace-save-format");
    expect(workspaceSkill?.tool_name).toBe("workspaceSaveFormat");
    expect(workspaceSkill?.title).toBe("工作区存档格式");
    expect(workspaceSkill?.content).toContain("AGENTS.md");

    expect(parsePublicSkillMarkdown("log-event/SKILL.md", "---\nname: logEvent\n---\n# 记录日志", "log-event")).toBeNull();
    expect(parsePublicSkillMarkdown("log-event/SKILL.md", "---\nname: record-event\n---\n# 记录日志", "log-event")).toBeNull();
  });

  it("loads skills from the public skills manifest without a fixed whitelist", async () => {
    const files = new Map<string, string>([
      [
        "/skills/manifest.json",
        JSON.stringify({
          skills: [{ name: "custom-lore", path: "custom-lore/SKILL.md" }],
        }),
      ],
      [
        "/skills/custom-lore/SKILL.md",
        [
          "---",
          "name: custom-lore",
          "description: 动态目录中的世界设定 skill。",
          "---",
          "# Custom Lore",
          "",
          "读取项目自定义世界设定规则。",
        ].join("\n"),
      ],
    ]);
    const fetcher = async (input: string) => {
      const pathname = new URL(input, "http://localhost").pathname;
      const body = files.get(pathname);
      return new Response(body ?? "", { status: body ? 200 : 404 });
    };

    const publicSkills = await loadPublicSkillDefinitions(fetcher);
    const customSkill = skillManifest(publicSkills).find((skill) => skill.name === "custom-lore");
    expect(customSkill?.tool_name).toBe("customLore");
    expect(customSkill?.description).toBe("动态目录中的世界设定 skill。");

    const tools = createEvolvriaBuiltInSkills({}, publicSkills) as Record<string, { execute?: unknown }>;
    const loaded = (await runTool(tools.customLore.execute, {})) as { content?: string };
    expect(loaded.content).toContain("自定义世界设定规则");
  });

  it("imports browser workspace bundles through state/payload.json", async () => {
    const payload = createInitialPayload(defaultSeed());
    const imported = await importWorldFromText(
      JSON.stringify({
        workspace_format: "evolvria_workspace_v1",
        files: buildWorldWorkspaceFiles(payload),
      }),
    );
    expect(imported.world.id).toBe(payload.world.id);
  });
});

async function runTool(execute: unknown, input: unknown): Promise<unknown> {
  expect(typeof execute).toBe("function");
  const fn = execute as (input: unknown, options: unknown) => unknown | PromiseLike<unknown>;
  return await Promise.resolve(fn(input, { toolCallId: "test", messages: [] }));
}

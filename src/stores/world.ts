import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";
import {
  addCustomLocation,
  addEvent,
  addRoute,
  aiUsageSummary,
  applyPlayerAction,
  applyWorldExpansion,
  createInitialPayload,
  currentLocation,
  emptyPayload,
  movePlayerTo,
  nearbyLocations,
  recordAiLog,
  retrieveMemories,
  timelineFiltered,
  updateCharacterNote,
  updateCharacterProfile,
  updateLocationNote,
  validatePayloadSchema,
  validateWorldConsistency,
  visibleLocations,
} from "@/domain/world";
import { estimateUsage, generateCharacterImage, generateWorld, resolvePlayerAction } from "@/services/ai";
import { deleteSaveEntry, exportWorld, listSaveEntries, loadActiveWorld, saveAiCheckpoint, saveWorld } from "@/services/save";
import { nowIso } from "@/services/text";
import { buildWorkspaceAiContext } from "@/services/world-workspace";
import { useSettingsStore } from "@/stores/settings";
import type { ExportWorldResult, SaveEntry } from "@/services/save";
import type { Character, Location, SavePayload, TimelineEvent, World, WorldSeed } from "@/types/domain";

export const useWorldStore = defineStore("world", () => {
  const payload = ref<SavePayload>(emptyPayload());
  const busy = ref(false);
  const pendingAction = ref("");
  const streamingNarrative = ref("");
  const lastNarrative = ref("");
  const saveEntries = ref<Awaited<ReturnType<typeof listSaveEntries>>>([]);

  const hasWorld = computed(() => validatePayloadSchema(payload.value) && "id" in payload.value.world);
  const world = computed(() => payload.value.world as World);
  const characters = computed(() => payload.value.characters);
  const locations = computed(() => payload.value.locations);
  const factions = computed(() => payload.value.factions);
  const timeline = computed(() => payload.value.timeline);
  const memories = computed(() => payload.value.memories);
  const threads = computed(() => payload.value.threads);
  const aiLogs = computed(() => payload.value.ai_logs);
  const suggestedActions = computed(() => payload.value.suggested_actions);
  const current = computed(() => currentLocation(payload.value));
  const activeThreads = computed(() => payload.value.threads.filter((thread) => thread.status === "open"));
  const usageSummary = computed(() => aiUsageSummary(payload.value.ai_logs));
  const consistencyIssues = computed(() => validateWorldConsistency(payload.value));

  async function load(): Promise<void> {
    payload.value = await loadActiveWorld();
    await refreshSaveEntries();
    if (hasWorld.value) {
      lastNarrative.value = payload.value.timeline[payload.value.timeline.length - 1]?.description ?? "";
    }
  }

  async function persist(): Promise<void> {
    await saveWorld(payload.value);
    await refreshSaveEntries();
  }

  async function refreshSaveEntries(): Promise<void> {
    saveEntries.value = await listSaveEntries();
  }

  async function deleteEntry(entry: SaveEntry): Promise<void> {
    await deleteSaveEntry(entry);
    if (entry.kind === "active") {
      payload.value = emptyPayload();
      lastNarrative.value = "";
    }
    await refreshSaveEntries();
  }

  async function createWorld(seed: WorldSeed): Promise<void> {
    const settingsStore = useSettingsStore();
    busy.value = true;
    try {
      const aiResult = await generateWorld(seed, settingsStore.settings);
      if (aiResult.status !== "ok") throw new Error(aiResult.summary);
      let next = createInitialPayload(seed);
      next = applyWorldExpansion(next, aiResult);
      next = recordAiLog(next, "world_expand", "ok", aiResult.summary, aiResult.usage, aiResult.raw);
      payload.value = next;
      lastNarrative.value = aiResult.openingNarrative?.trim() || aiResult.summary || next.timeline[0]?.description || "";
      await persist();
    } finally {
      busy.value = false;
    }
  }

  async function submitPlayerAction(action: string): Promise<void> {
    if (!hasWorld.value || !action.trim()) return;
    const settingsStore = useSettingsStore();
    busy.value = true;
    pendingAction.value = action;
    streamingNarrative.value = "";
    try {
      await saveAiCheckpoint(payload.value);
      const result = await resolvePlayerAction(action, buildAiContext(action), settingsStore.settings);
      if (result.narrative) {
        await streamNarrative(result.narrative);
      }
      let next = applyPlayerAction(payload.value, result, action);
      next = recordAiLog(next, "player_action", result.status === "ok" ? "ok" : "error", result.narrative || result.error || action, result.usage);
      payload.value = next;
      lastNarrative.value = result.narrative;
      await persist();
    } finally {
      busy.value = false;
      pendingAction.value = "";
      streamingNarrative.value = "";
    }
  }

  async function streamNarrative(text: string): Promise<void> {
    streamingNarrative.value = "";
    const chunkSize = text.length > 900 ? 6 : text.length > 420 ? 4 : 2;
    for (let index = 0; index < text.length; index += chunkSize) {
      streamingNarrative.value = text.slice(0, index + chunkSize);
      await new Promise((resolve) => window.setTimeout(resolve, 18));
    }
  }

  function buildAiContext(action: string): Record<string, unknown> {
    const location = current.value;
    const participants = ["char_hero", ...payload.value.characters.filter((character) => character.companion).map((character) => character.id)];
    return {
      world: payload.value.world,
      scene_state: {
        current_location: location,
        companion_character_ids: participants.filter((id) => id !== "char_hero"),
        nearby_locations: location ? nearbyLocations(payload.value, location.id, 5) : [],
      },
      workspace_context: buildWorkspaceAiContext(payload.value, {
        currentLocationId: location?.id,
        participantIds: participants,
        recentEventCount: 8,
      }),
      characters: payload.value.characters.map((character) => ({
        id: character.id,
        name: character.name,
        gender: character.gender,
        role: character.role,
        companion: character.companion,
        current_location_id: character.current_location_id,
      })),
      memory_context: retrieveMemories(payload.value, action, location?.id ?? "", participants),
      recent_events: payload.value.timeline.slice(-8),
    };
  }

  function getUsageEstimate(purpose: string, input: unknown) {
    const settingsStore = useSettingsStore();
    return estimateUsage(purpose, input, settingsStore.settings);
  }

  async function goToLocation(locationId: string): Promise<void> {
    payload.value = movePlayerTo(payload.value, locationId);
    await persist();
  }

  async function editCharacterNote(characterId: string, note: string): Promise<void> {
    payload.value = updateCharacterNote(payload.value, characterId, note);
    await persist();
  }

  async function editCharacterProfile(characterId: string, description: string, appearanceDescription: string): Promise<void> {
    payload.value = updateCharacterProfile(payload.value, characterId, {
      description,
      appearance_description: appearanceDescription,
    });
    await persist();
  }

  async function regenerateCharacterImage(characterId: string, appearanceDescription?: string): Promise<void> {
    if (!hasWorld.value) return;
    const settingsStore = useSettingsStore();
    const character = payload.value.characters.find((item) => item.id === characterId);
    if (!character) return;
    busy.value = true;
    try {
      const sourceAppearance = appearanceDescription?.trim() || character.appearance_description || character.description;
      const result = await generateCharacterImage(
        {
          name: character.name,
          gender: character.gender,
          role: character.role,
          description: character.description,
          appearance_description: sourceAppearance,
          personality: character.personality,
          traits: character.traits,
          world_name: world.value.name,
          genre: world.value.genre,
          tone: world.value.tone,
        },
        settingsStore.settings,
      );
      payload.value = updateCharacterProfile(payload.value, characterId, {
        appearance_description: result.appearance_description,
        portrait_prompt: result.prompt,
        portrait_image_url: result.image_url,
      });
      payload.value = recordAiLog(
        payload.value,
        "character_image",
        result.status,
        result.status === "ok"
          ? `${character.name} 形象已生成，角色卡已保存扩写后的形象描写。`
          : `角色形象生成失败，已使用本地占位图：${[result.error, ...result.warnings].filter(Boolean).join("；") || "未知错误"}`,
        result.usage,
      );
      await persist();
    } finally {
      busy.value = false;
    }
  }

  async function editLocationNote(locationId: string, note: string): Promise<void> {
    payload.value = updateLocationNote(payload.value, locationId, note);
    await persist();
  }

  async function createLocation(name: string, type: string, description: string, position: { x: number; y: number }): Promise<void> {
    payload.value = addCustomLocation(payload.value, name, type, description, position);
    await persist();
  }

  async function createRoute(from: string, to: string): Promise<void> {
    payload.value = addRoute(payload.value, from, to);
    await persist();
  }

  async function resolveThread(threadId: string): Promise<void> {
    const next = JSON.parse(JSON.stringify(toRaw(payload.value))) as SavePayload;
    const thread = next.threads.find((item) => item.id === threadId);
    if (thread) thread.status = "resolved";
    next.updated_at = nowIso();
    payload.value = next;
    await persist();
  }

  async function runNpcTick(): Promise<void> {
    if (!hasWorld.value) return;
    const npc = payload.value.characters.find((character) => character.id !== "char_hero" && character.status === "active");
    if (!npc) return;
    payload.value = addEvent(payload.value, {
      type: "npc_simulation",
      title: `${npc.name}的行动`,
      description: `${npc.name}按照自己的目标继续推进：${npc.action_tendency ?? "寻找下一条线索"}。`,
      world_time: { ...world.value.current_time },
      location_id: npc.current_location_id,
      participant_ids: [npc.id],
      cause_event_ids: [],
      effects: [],
      importance: 0.42,
      visibility: npc.visibility === "met" ? "known_to_player" : "hidden",
    });
    payload.value = recordAiLog(payload.value, "npc_simulation", "ok", "本地 NPC tick", { input_tokens: 220, output_tokens: 140 });
    await persist();
  }

  async function exportCurrentWorld(): Promise<ExportWorldResult> {
    return exportWorld(payload.value);
  }

  function filteredTimeline(type = "", characterId = "", locationId = ""): TimelineEvent[] {
    return timelineFiltered(payload.value, type, characterId, locationId);
  }

  function visibleMapLocations(includeUnknown = false): Location[] {
    return visibleLocations(payload.value, includeUnknown);
  }

  function filteredCharacters(filter = "全部"): Character[] {
    if (filter === "同行") return payload.value.characters.filter((character) => character.companion);
    if (filter === "仅听闻") return payload.value.characters.filter((character) => character.visibility === "heard");
    if (filter === "敌对/竞争") return payload.value.characters.filter((character) => Object.values(character.relationships).some((rel) => rel.tension > 0.55 || rel.type === "rival"));
    return payload.value.characters;
  }

  return {
    payload,
    busy,
    pendingAction,
    streamingNarrative,
    lastNarrative,
    saveEntries,
    hasWorld,
    world,
    characters,
    locations,
    factions,
    timeline,
    memories,
    threads,
    aiLogs,
    suggestedActions,
    current,
    activeThreads,
    usageSummary,
    consistencyIssues,
    load,
    persist,
    refreshSaveEntries,
    deleteEntry,
    createWorld,
    submitPlayerAction,
    buildAiContext,
    getUsageEstimate,
    goToLocation,
    editCharacterNote,
    editCharacterProfile,
    regenerateCharacterImage,
    editLocationNote,
    createLocation,
    createRoute,
    resolveThread,
    runNpcTick,
    exportCurrentWorld,
    filteredTimeline,
    visibleMapLocations,
    filteredCharacters,
  };
});

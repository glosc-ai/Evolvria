import { mockFactions, mockLocations } from "@/domain/fixtures";
import { makeId, stableHash } from "@/services/ids";
import { clamp, nowIso, redactSensitive, splitTags } from "@/services/text";
import type {
  AIRequestLog,
  Character,
  Faction,
  Location,
  MapImage,
  MapRoute,
  Memory,
  PlayerActionResult,
  SavePayload,
  StatePatch,
  Thread,
  TimelineEvent,
  World,
  WorldSeed,
} from "@/types/domain";
import { SCHEMA_VERSION } from "@/types/domain";

export function emptyPayload(): SavePayload {
  return {
    schema_version: SCHEMA_VERSION,
    world: {},
    characters: [],
    locations: [],
    factions: [],
    timeline: [],
    memories: [],
    ai_logs: [],
    threads: [],
    suggested_actions: [],
    event_counter: 0,
    memory_counter: 0,
    location_counter: 100,
    thread_counter: 0,
    updated_at: nowIso(),
  };
}

export function validatePayloadSchema(payload: unknown): payload is SavePayload {
  if (!payload || typeof payload !== "object") return false;
  const source = payload as Partial<SavePayload>;
  return (
    source.schema_version === SCHEMA_VERSION &&
    Array.isArray(source.characters) &&
    Array.isArray(source.locations) &&
    Array.isArray(source.factions) &&
    Array.isArray(source.timeline) &&
    Array.isArray(source.memories) &&
    Array.isArray(source.ai_logs) &&
    Array.isArray(source.threads) &&
    Array.isArray(source.suggested_actions) &&
    typeof source.world === "object"
  );
}

export function buildCharacters(seed: WorldSeed): Character[] {
  const hero: Character = {
    id: "char_hero",
    name: seed.hero.name || "主角",
    role: "player",
    description: seed.hero.description || "玩家创建的主角。",
    personality: splitTags(seed.hero.ability),
    goals: splitTags(seed.hero.goal),
    secrets: [],
    current_location_id: "loc_start",
    status: "active",
    traits: splitTags(`${seed.hero.ability},${seed.hero.weakness}`),
    relationships: {},
    memory_summary: "",
    known_event_ids: [],
    player_notes: "",
    player_notes_updated_at: "",
    companion: false,
    visibility: "met",
  };

  const characters = [hero];
  seed.key_characters.forEach((character, index) => {
    const id = makeId("char", index + 1);
    characters.push({
      id,
      name: character.name || `关键角色 ${index + 1}`,
      role: character.role || "关键角色",
      description: character.description,
      personality: splitTags(character.personality),
      goals: splitTags(character.goal),
      secrets: splitTags(character.secret),
      current_location_id: character.relationship.includes("同行") ? "loc_start" : index % 2 === 0 ? "loc_forest" : "loc_ruin",
      status: "active",
      traits: splitTags(character.personality),
      relationships: {},
      memory_summary: "",
      known_event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      action_tendency: character.action_tendency,
      companion: character.relationship.includes("同行"),
      visibility: character.relationship.includes("同行") ? "met" : "heard",
    });
  });
  ensureRelationships(characters, seed);
  return characters;
}

export function ensureRelationships(characters: Character[], seed?: WorldSeed): void {
  const hero = characters.find((character) => character.id === "char_hero");
  for (const character of characters) {
    character.relationships ??= {};
    for (const other of characters) {
      if (character.id === other.id) continue;
      if (!character.relationships[other.id]) {
        const source = seed?.key_characters.find((item) => item.name === character.name);
        const profile = relationshipProfile(source?.relationship ?? "");
        character.relationships[other.id] = {
          type: profile.type,
          trust: profile.trust,
          affection: profile.affection,
          tension: profile.tension,
          notes: profile.notes,
        };
      }
    }
  }
  if (hero) {
    hero.relationships = hero.relationships ?? {};
  }
}

function relationshipProfile(label: string): { type: string; trust: number; affection: number; tension: number; notes: string } {
  if (label.includes("竞争")) return { type: "rival", trust: 0.35, affection: 0.12, tension: 0.62, notes: "存在竞争关系。" };
  if (label.includes("同行") || label.includes("旧友")) return { type: "ally", trust: 0.62, affection: 0.42, tension: 0.08, notes: "愿意同行。" };
  return { type: "known", trust: 0.45, affection: 0.2, tension: 0.18, notes: "关系尚未明确。" };
}

export function createInitialPayload(seed: WorldSeed): SavePayload {
  const now = nowIso();
  const worldId = `world_${Date.now()}`;
  const locations = mockLocations();
  const factions = mockFactions();
  const mapRoutes = buildInitialRoutes();
  const world: World = {
    id: worldId,
    name: seed.world_name || "未命名世界",
    genre: seed.genre || "奇幻",
    tone: [seed.tone || "冒险"],
    current_time: { day: 1, hour: 8, calendar_label: "第一纪元 1001 年 春" },
    summary: `${seed.world_name || "这个世界"}正处在旧秩序松动的阶段。边境线索、角色目标和未知势力会随着玩家行动被持续记录。`,
    phase_summaries: [],
    summary_event_cursor: 0,
    rules: ["已确认的玩家设定不可被 AI 覆盖。", "所有剧情变化必须写入时间线。", "未知信息不能提前剧透给玩家。"],
    themes: [seed.tone || "冒险", seed.genre || "奇幻"],
    content_limits: splitTags(seed.limits),
    narrative_detail: seed.narrative_detail || "适中",
    npc_autonomy_frequency: seed.npc_autonomy_frequency || "中频",
    map_image: generatedMapImage(mapRoutes),
    map_routes: mapRoutes,
    created_at: now,
    schema_version: SCHEMA_VERSION,
  };
  const characters = buildCharacters(seed);
  const opening: TimelineEvent = {
    id: "evt_001",
    type: "world_event",
    title: "开局事件",
    description: `${characters[0]?.name ?? "主角"}抵达${locations[0].name}，公告板上的徽记引出第一条线索。`,
    world_time: { ...world.current_time },
    location_id: "loc_start",
    participant_ids: ["char_hero", "char_001"].filter((id) => characters.some((character) => character.id === id)),
    cause_event_ids: [],
    effects: ["开启主线线索。"],
    importance: 0.9,
    visibility: "known_to_player",
  };
  locations[0].event_ids.push(opening.id);
  return {
    schema_version: SCHEMA_VERSION,
    world,
    characters,
    locations,
    factions,
    timeline: [opening],
    memories: [
      {
        id: "mem_001",
        scope: "world",
        owner_id: worldId,
        text: world.summary,
        facts: ["世界创建", "公告板徽记出现"],
        event_id: opening.id,
        importance: 0.8,
        confidence: 1,
        tags: ["world", "opening"],
        created_world_time: { ...world.current_time },
      },
    ],
    ai_logs: [],
    threads: [
      {
        id: "thread_001",
        title: "徽记来源",
        description: "查清公告板、白塔遗迹和旧档案之间的关系。",
        kind: "main",
        status: "open",
        priority: 0.9,
        tags: ["clue", "main"],
        event_id: opening.id,
        progress: [],
      },
      {
        id: "thread_002",
        title: "角色动机",
        description: "理解关键角色为什么追踪同一组线索。",
        kind: "relationship",
        status: "open",
        priority: 0.64,
        tags: ["character"],
        event_id: opening.id,
        progress: [],
      },
    ],
    suggested_actions: ["调查公告板徽记", "询问璃安旧档案", "前往雾松林"],
    event_counter: 1,
    memory_counter: 1,
    location_counter: 100,
    thread_counter: 2,
    updated_at: now,
  };
}

export function generatedMapImage(routes: MapRoute[]): MapImage {
  return {
    id: "map_001",
    name: "Azgaar 风格大陆地图",
    image_path: "generated://map_001",
    width: 960,
    height: 640,
    scale_label: "未设置比例尺",
    locations: ["loc_start", "loc_forest", "loc_ruin", "loc_harbor"],
    routes,
    generator: {
      source_project: "Azgaar/Fantasy-Map-Generator",
      source_license: "MIT",
      source_url: "https://github.com/Azgaar/Fantasy-Map-Generator",
      mode: "procedural",
      attribution_required: true,
    },
  };
}

export function buildInitialRoutes(): MapRoute[] {
  return [
    { id: "route_001", from_location_id: "loc_start", to_location_id: "loc_forest", name: "雾林旧道", type: "road", danger: 0.28 },
    { id: "route_002", from_location_id: "loc_start", to_location_id: "loc_ruin", name: "白塔石径", type: "road", danger: 0.42 },
    { id: "route_003", from_location_id: "loc_ruin", to_location_id: "loc_harbor", name: "银潮商路", type: "trade", danger: 0.35 },
  ];
}

export function applyPlayerAction(payload: SavePayload, result: PlayerActionResult, action: string): SavePayload {
  if (result.status !== "ok") return payload;
  const next = structuredClone(payload);
  const world = next.world as World;
  saveAiCheckpointInvariant(next);
  const eventId = makeId("evt", next.event_counter + 1);
  const eventSource = result.events[0] ?? {};
  const event: TimelineEvent = {
    id: eventId,
    type: eventSource.type ?? "player_action",
    title: eventSource.title ?? "玩家行动",
    description: eventSource.description ?? result.narrative,
    world_time: advanceWorldTime(world.current_time, result.time_delta_minutes),
    location_id: eventSource.location_id ?? currentLocation(next)?.id ?? "loc_start",
    participant_ids: eventSource.participant_ids ?? ["char_hero"],
    cause_event_ids: [],
    effects: eventSource.effects ?? [],
    importance: eventSource.importance ?? 0.65,
    visibility: eventSource.visibility ?? "known_to_player",
    outcome: eventSource.outcome ?? "success",
    outcome_reason: eventSource.outcome_reason ?? "行动被当前场景接受。",
    consequence: eventSource.consequence ?? "世界状态已更新。",
  };
  world.current_time = { ...event.world_time };
  next.event_counter += 1;
  next.timeline.push(event);
  for (const patch of [...result.character_updates, ...result.location_updates]) {
    applyStatePatch(next, patch);
  }
  for (const update of result.relationship_updates) {
    applyRelationshipDelta(next.characters, update.source_id, update.target_id, update);
  }
  for (const write of result.memory_writes) {
    next.memory_counter += 1;
    next.memories.push({
      id: makeId("mem", next.memory_counter),
      scope: write.scope ?? "world",
      owner_id: write.owner_id ?? world.id,
      text: write.text ?? result.narrative,
      facts: write.facts ?? [action],
      event_id: eventId,
      importance: write.importance ?? 0.5,
      confidence: write.confidence ?? 1,
      tags: write.tags ?? ["event"],
      created_world_time: { ...world.current_time },
    });
  }
  progressOpenThreads(next.threads, eventId, result.narrative);
  next.suggested_actions = result.suggested_actions;
  next.updated_at = nowIso();
  return next;
}

function saveAiCheckpointInvariant(_payload: SavePayload): void {
  // Checkpoints are persisted by the store before this pure state transition runs.
}

export function addEvent(payload: SavePayload, event: Omit<TimelineEvent, "id">): SavePayload {
  const next = structuredClone(payload);
  next.event_counter += 1;
  next.timeline.push({ ...event, id: makeId("evt", next.event_counter) });
  next.updated_at = nowIso();
  return next;
}

export function applyStatePatch(payload: SavePayload, patch: StatePatch): boolean {
  if (!validatePatch(payload, patch)) return false;
  const target = patchTarget(payload, patch.target_type, patch.target_id);
  if (!target) return false;
  if (patch.op === "set") {
    setPath(target, patch.path, patch.value);
    return true;
  }
  if (patch.op === "append") {
    const current = getPath(target, patch.path);
    if (Array.isArray(current)) current.push(patch.value);
    return Array.isArray(current);
  }
  if (patch.op === "increment") {
    const current = Number(getPath(target, patch.path) ?? 0);
    setPath(target, patch.path, current + Number(patch.value ?? 0));
    return true;
  }
  return false;
}

export function validatePatch(payload: SavePayload, patch: StatePatch): boolean {
  if (!patch.target_type || !patch.target_id || !patch.path) return false;
  if (patch.target_type === "character" && patch.path === "name") return false;
  if (patch.target_type === "location" && ["description", "position"].includes(patch.path)) {
    const location = payload.locations.find((item) => item.id === patch.target_id);
    if (location?.known_to_player) return false;
  }
  if (patch.target_type === "world" && patch.path === "current_time") return false;
  return Boolean(patchTarget(payload, patch.target_type, patch.target_id));
}

function patchTarget(payload: SavePayload, type: StatePatch["target_type"], id: string): Record<string, unknown> | null {
  if (type === "world") return payload.world as Record<string, unknown>;
  if (type === "character") return (payload.characters.find((item) => item.id === id) as unknown as Record<string, unknown>) ?? null;
  if (type === "location") return (payload.locations.find((item) => item.id === id) as unknown as Record<string, unknown>) ?? null;
  if (type === "event") return (payload.timeline.find((item) => item.id === id) as unknown as Record<string, unknown>) ?? null;
  if (type === "thread") return (payload.threads.find((item) => item.id === id) as unknown as Record<string, unknown>) ?? null;
  return null;
}

function getPath(target: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), target);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let current = target;
  keys.slice(0, -1).forEach((key) => {
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key] as Record<string, unknown>;
  });
  current[keys[keys.length - 1]] = value;
}

export function currentLocation(payload: SavePayload): Location | undefined {
  const hero = payload.characters.find((character) => character.id === "char_hero");
  return payload.locations.find((location) => location.id === hero?.current_location_id) ?? payload.locations[0];
}

export function visibleLocations(payload: SavePayload, includeUnknown = false): Location[] {
  return includeUnknown ? payload.locations : payload.locations.filter((location) => location.known_to_player || location.visibility !== "unknown");
}

export function nearbyLocations(payload: SavePayload, locationId: string, limit = 5): Location[] {
  const origin = payload.locations.find((location) => location.id === locationId);
  if (!origin) return [];
  return payload.locations
    .filter((location) => location.id !== locationId)
    .map((location) => ({ location, distance: distance(origin.position, location.position) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.location);
}

export function timelineFiltered(payload: SavePayload, type = "", characterId = "", locationId = ""): TimelineEvent[] {
  return payload.timeline.filter((event) => {
    if (type && event.type !== type) return false;
    if (characterId && !event.participant_ids.includes(characterId)) return false;
    if (locationId && event.location_id !== locationId) return false;
    return true;
  });
}

export function retrieveMemories(payload: SavePayload, query: string, locationId: string, participantIds: string[], limit = 8): Memory[] {
  const tokens = splitTags(query).concat(participantIds, locationId).filter(Boolean);
  return payload.memories
    .map((memory) => ({
      memory,
      score:
        memory.importance +
        tokens.reduce((score, token) => score + (memory.text.includes(token) || memory.facts.some((fact) => fact.includes(token)) ? 0.25 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}

export function movePlayerTo(payload: SavePayload, locationId: string): SavePayload {
  const next = structuredClone(payload);
  const target = next.locations.find((location) => location.id === locationId);
  if (!target) return payload;
  const hero = next.characters.find((character) => character.id === "char_hero");
  if (hero) hero.current_location_id = locationId;
  next.characters.filter((character) => character.companion && character.status === "active").forEach((character) => (character.current_location_id = locationId));
  target.known_to_player = true;
  target.visibility = "known_to_player";
  next.updated_at = nowIso();
  return next;
}

export function updateCharacterNote(payload: SavePayload, characterId: string, note: string): SavePayload {
  const next = structuredClone(payload);
  const character = next.characters.find((item) => item.id === characterId);
  if (character) {
    character.player_notes = note;
    character.player_notes_updated_at = nowIso();
  }
  next.updated_at = nowIso();
  return next;
}

export function updateLocationNote(payload: SavePayload, locationId: string, note: string): SavePayload {
  const next = structuredClone(payload);
  const location = next.locations.find((item) => item.id === locationId);
  if (location) {
    location.player_notes = note;
    location.player_notes_updated_at = nowIso();
  }
  next.updated_at = nowIso();
  return next;
}

export function addCustomLocation(payload: SavePayload, name: string, type: string, description: string, position: { x: number; y: number }): SavePayload {
  const next = structuredClone(payload);
  next.location_counter += 1;
  const id = makeId("loc", next.location_counter);
  next.locations.push({
    id,
    name,
    type,
    description,
    map_id: "map_001",
    position: { x: clamp(position.x, 0.05, 0.95), y: clamp(position.y, 0.05, 0.95) },
    connected_location_ids: [],
    controlling_faction_id: null,
    known_to_player: true,
    visibility: "known_to_player",
    state_tags: [],
    event_ids: [],
    player_notes: "",
    player_notes_updated_at: "",
  });
  const world = next.world as World;
  world.map_image.locations = [...(world.map_image.locations ?? []), id];
  next.updated_at = nowIso();
  return next;
}

export function addRoute(payload: SavePayload, from: string, to: string): SavePayload {
  if (from === to) return payload;
  const next = structuredClone(payload);
  const exists = next.world && (next.world as World).map_routes.some((route) => routePairKey(route.from_location_id, route.to_location_id) === routePairKey(from, to));
  if (exists) return payload;
  const route: MapRoute = {
    id: makeId("route", (next.world as World).map_routes.length + 1),
    from_location_id: from,
    to_location_id: to,
    name: "自定义路线",
    type: "road",
    danger: 0.2,
  };
  (next.world as World).map_routes.push(route);
  (next.world as World).map_image.routes = (next.world as World).map_routes;
  next.updated_at = nowIso();
  return next;
}

export function recordAiLog(payload: SavePayload, purpose: string, status: "ok" | "error", summary: string, usage = { input_tokens: 0, output_tokens: 0 }, raw = ""): SavePayload {
  const next = structuredClone(payload);
  const world = next.world as World;
  const started = nowIso();
  const log: AIRequestLog = {
    id: makeId("ai_req", next.ai_logs.length + 1),
    world_id: world.id ?? "",
    purpose,
    prompt_hash: stableHash(summary),
    model: "deepseek/deepseek-v4-pro",
    started_at: started,
    finished_at: started,
    status,
    error: status === "error" ? summary : null,
    usage: { ...usage, total_tokens: usage.input_tokens + usage.output_tokens, cost_estimate: null },
    summary,
    raw_response: raw ? redactSensitive(raw) : undefined,
  };
  next.ai_logs.push(log);
  next.updated_at = nowIso();
  return next;
}

export function aiUsageSummary(logs: AIRequestLog[]): { calls: number; success_count: number; total_tokens: number } {
  return {
    calls: logs.length,
    success_count: logs.filter((log) => log.status === "ok").length,
    total_tokens: logs.reduce((total, log) => total + (log.usage.total_tokens ?? log.usage.input_tokens + log.usage.output_tokens), 0),
  };
}

export function validateWorldConsistency(payload: SavePayload): Array<{ code: string; subject_id: string; message: string }> {
  const issues: Array<{ code: string; subject_id: string; message: string }> = [];
  const characterIds = new Set(payload.characters.map((character) => character.id));
  const locationIds = new Set(payload.locations.map((location) => location.id));
  for (const event of payload.timeline) {
    if (!locationIds.has(event.location_id)) issues.push({ code: "missing_location", subject_id: event.id, message: `事件引用不存在的地点：${event.location_id}` });
    for (const participant of event.participant_ids) {
      if (!characterIds.has(participant)) issues.push({ code: "missing_character", subject_id: event.id, message: `事件引用不存在的角色：${participant}` });
    }
  }
  return issues;
}

function advanceWorldTime(time: { day: number; hour: number; calendar_label?: string }, minutes: number): { day: number; hour: number; calendar_label?: string } {
  const totalHours = time.day * 24 + time.hour + Math.max(0, Math.floor(minutes / 60));
  return { ...time, day: Math.floor(totalHours / 24), hour: totalHours % 24 };
}

function applyRelationshipDelta(
  characters: Character[],
  sourceId: string,
  targetId: string,
  delta: { trust_delta?: number; affection_delta?: number; tension_delta?: number; note: string },
): void {
  const source = characters.find((character) => character.id === sourceId);
  if (!source) return;
  source.relationships[targetId] ??= { type: "known", trust: 0.45, affection: 0.2, tension: 0.18, notes: "" };
  const relationship = source.relationships[targetId];
  relationship.trust = clamp(relationship.trust + (delta.trust_delta ?? 0), 0, 1);
  relationship.affection = clamp(relationship.affection + (delta.affection_delta ?? 0), 0, 1);
  relationship.tension = clamp(relationship.tension + (delta.tension_delta ?? 0), 0, 1);
  relationship.notes = delta.note;
}

function progressOpenThreads(threads: Thread[], eventId: string, text: string): void {
  threads
    .filter((thread) => thread.status === "open")
    .slice(0, 2)
    .forEach((thread) => {
      thread.progress.push({ event_id: eventId, text: text.slice(0, 96), created_at: nowIso() });
      thread.priority = clamp(thread.priority + 0.02, 0, 1);
    });
}

function routePairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

import type { Faction, Location, PlayerActionResult, WorldSeed } from "@/types/domain";

export function defaultSeed(): WorldSeed {
  return {
    world_name: "苍星纪元",
    genre: "奇幻",
    tone: "冒险",
    limits: "保持可读性，避免极端血腥和酷刑描写。",
    narrative_detail: "适中",
    npc_autonomy_frequency: "中频",
    hero: {
      name: "主角",
      gender: "未指定",
      description: "刚抵达边境城镇的旅人。",
      goal: "理解世界背后的异常变化。",
      ability: "观察,交涉",
      weakness: "过度谨慎",
    },
    key_characters: [
      {
        name: "璃安",
        gender: "女",
        role: "旧友",
        relationship: "同行",
        personality: "温和,谨慎",
        goal: "查清徽记来源",
        secret: "知道徽记与旧档案有关",
        action_tendency: "保护主角并暗中确认线索",
        description: "熟悉边境传闻的人。",
      },
      {
        name: "赛拉",
        gender: "女",
        role: "竞争者",
        relationship: "竞争",
        personality: "果断,好胜",
        goal: "抢先得到档案",
        secret: "曾为边境守望工作",
        action_tendency: "主动追踪遗迹并试探玩家",
        description: "推动冲突的人。",
      },
    ],
  };
}

export function mockLocations(): Location[] {
  return [
    {
      id: "loc_start",
      name: "黑石镇",
      type: "town",
      description: "边境贸易镇，公告板上反复出现陌生徽记。",
      map_id: "map_001",
      position: { x: 0.42, y: 0.58 },
      connected_location_ids: ["loc_forest", "loc_ruin"],
      controlling_faction_id: "fac_001",
      known_to_player: true,
      visibility: "known_to_player",
      state_tags: ["safe", "market"],
      event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      biome: "temperate_grassland",
      height: 0.48,
    },
    {
      id: "loc_forest",
      name: "雾松林",
      type: "forest",
      description: "雾气常年不散，旧路标指向一处被遗忘的驿站。",
      map_id: "map_001",
      position: { x: 0.26, y: 0.46 },
      connected_location_ids: ["loc_start", "loc_ruin"],
      controlling_faction_id: "fac_002",
      known_to_player: true,
      visibility: "known_to_player",
      state_tags: ["wild", "mist"],
      event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      biome: "forest",
      height: 0.57,
    },
    {
      id: "loc_ruin",
      name: "白塔遗迹",
      type: "ruin",
      description: "塔身只剩半截，墙面刻着和公告板相似的徽记。",
      map_id: "map_001",
      position: { x: 0.62, y: 0.34 },
      connected_location_ids: ["loc_start", "loc_forest", "loc_harbor"],
      controlling_faction_id: "fac_003",
      known_to_player: true,
      visibility: "known_to_player",
      state_tags: ["ancient", "danger"],
      event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      biome: "highland",
      height: 0.72,
    },
    {
      id: "loc_harbor",
      name: "银潮港",
      type: "harbor",
      description: "商船和密探都在这里交换消息。",
      map_id: "map_001",
      position: { x: 0.74, y: 0.66 },
      connected_location_ids: ["loc_ruin"],
      controlling_faction_id: "fac_001",
      known_to_player: false,
      visibility: "heard",
      state_tags: ["trade", "coast"],
      event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      biome: "coast",
      height: 0.22,
    },
  ];
}

export function mockFactions(): Faction[] {
  return [
    { id: "fac_001", name: "边境议会", agenda: "维持商路和税收", attitude: "谨慎合作", controlled_location_ids: ["loc_start", "loc_harbor"] },
    { id: "fac_002", name: "雾林守望", agenda: "阻止外人破坏旧林契约", attitude: "观察", controlled_location_ids: ["loc_forest"] },
    { id: "fac_003", name: "白塔学社", agenda: "寻找遗迹中的年代断层证据", attitude: "利益交换", controlled_location_ids: ["loc_ruin"] },
  ];
}

export function mockPlayerAction(action: string, context?: unknown): PlayerActionResult {
  const clue = action.includes("徽记") ? "徽记的笔画与白塔遗迹残墙上的符号吻合。" : "行动让周围角色重新评估了你的判断。";
  const companion = readMockCompanion(context);
  return {
    status: "ok",
    narrative: `你决定${action}。线索被重新串联起来：${clue} ${companion.name}提醒你，下一步最好确认消息来源，而不是急着公开结论。`,
    time_delta_minutes: 45,
    events: [
      {
        type: "player_action",
        title: "追查线索",
        description: `玩家行动：${action}。${clue}`,
        participant_ids: ["char_hero", companion.id],
        location_id: "loc_start",
        importance: 0.72,
        visibility: "known_to_player",
        outcome: "success",
        outcome_reason: "行动符合当前场景线索。",
        consequence: "获得指向白塔遗迹的新线索。",
      },
    ],
    character_updates: [],
    location_updates: [
      {
        target_type: "location",
        target_id: "loc_ruin",
        op: "set",
        path: "known_to_player",
        value: true,
        reason: "玩家获得遗迹线索。",
      },
    ],
    relationship_updates: [
      {
        source_id: companion.id,
        target_id: "char_hero",
        trust_delta: 0.04,
        affection_delta: 0.02,
        note: `玩家谨慎处理线索，增加了${companion.name}的信任。`,
      },
    ],
    memory_writes: [
      {
        scope: "character",
        owner_id: companion.id,
        text: `${companion.name}记得主角曾选择${action}，并因此发现徽记线索。`,
        facts: [clue],
        importance: 0.7,
        confidence: 1,
        tags: ["relationship", "clue"],
      },
    ],
    suggested_actions: ["前往白塔遗迹", `询问${companion.name}旧档案`, "在公告板旁等待张贴者"],
    warnings: [],
    usage: { input_tokens: 620, output_tokens: 420, total_tokens: 1040, cost_estimate: null },
  };
}

function readMockCompanion(context: unknown): { id: string; name: string } {
  if (context && typeof context === "object") {
    const characters = (context as { characters?: unknown }).characters;
    if (Array.isArray(characters)) {
      const companion = characters.find((character) => isMockCharacter(character) && character.companion) ?? characters.find(isMockCharacter);
      if (isMockCharacter(companion)) {
        return { id: companion.id, name: companion.name };
      }
    }
  }
  return { id: "char_001", name: "璃安" };
}

function isMockCharacter(value: unknown): value is { id: string; name: string; companion?: boolean } {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && typeof (value as { name?: unknown }).name === "string");
}

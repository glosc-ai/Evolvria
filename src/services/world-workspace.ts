import type { Character, Location, SavePayload, TimelineEvent, World, WorldSeed } from "@/types/domain";

export interface WorldWorkspaceFile {
  path: string;
  content: string;
}

export interface WorkspaceAiContext {
  workspace_format: "evolvria_workspace_v1";
  instructions_path: "AGENTS.md";
  instructions: string;
  loaded_files: WorldWorkspaceFile[];
  available_files: string[];
  loading_policy: string;
}

export function buildWorldWorkspaceFiles(payload: SavePayload): WorldWorkspaceFile[] {
  const files: WorldWorkspaceFile[] = [];
  files.push(file("AGENTS.md", buildAgentsMarkdown(payload)));
  files.push(file("manifest.json", JSON.stringify(buildManifest(payload), null, 2)));
  files.push(file("world/OVERVIEW.md", buildWorldOverview(payload)));
  files.push(file("world/RULES.md", buildWorldRules(payload)));
  files.push(file("memory/MEMORY.md", buildMemoryMarkdown(payload)));
  files.push(file("maps/MAP.md", buildMapMarkdown(payload)));
  files.push(file("history/TIMELINE.md", buildTimelineMarkdown(payload.timeline)));
  files.push(file("threads/THREADS.md", buildThreadsMarkdown(payload)));
  payload.characters.forEach((character) => {
    files.push(file(characterPath(character.id), buildCharacterMarkdown(character, payload)));
  });
  payload.locations.forEach((location) => {
    files.push(file(locationPath(location.id), buildLocationMarkdown(location, payload)));
  });
  files.push(file("state/payload.json", JSON.stringify(payload, null, 2)));
  return files;
}

export function buildWorkspaceAiContext(
  payload: SavePayload,
  options: { currentLocationId?: string; participantIds?: string[]; recentEventCount?: number } = {},
): WorkspaceAiContext {
  const files = buildWorldWorkspaceFiles(payload);
  const fileMap = new Map(files.map((item) => [item.path, item]));
  const paths = new Set<string>(["world/OVERVIEW.md", "world/RULES.md", "memory/MEMORY.md", "maps/MAP.md"]);
  if (options.currentLocationId) paths.add(locationPath(options.currentLocationId));
  options.participantIds?.forEach((id) => paths.add(characterPath(id)));
  paths.add("threads/THREADS.md");
  paths.add("history/TIMELINE.md");

  const agents = fileMap.get("AGENTS.md") ?? file("AGENTS.md", "");
  const loadedFiles = [agents, ...[...paths].map((path) => fileMap.get(path)).filter((item): item is WorldWorkspaceFile => Boolean(item))];

  return {
    workspace_format: "evolvria_workspace_v1",
    instructions_path: "AGENTS.md",
    instructions: agents.content,
    loaded_files: loadedFiles,
    available_files: files.map((item) => item.path),
    loading_policy: `先遵循 AGENTS.md。当前请求只加载了与场景相关的文件；未加载文件中的事实不能臆造，必要时应依据已加载索引和结构化上下文保守推断。`,
  };
}

export function buildSeedWorkspaceAiContext(seed: WorldSeed): WorkspaceAiContext {
  const agents = [
    "# Evolvria 世界工作区",
    "",
    `待创建世界：${seed.world_name || "未命名世界"}`,
    "",
    "## 启动顺序",
    "",
    "本次是新世界创建请求。先遵循本 AGENTS.md，再根据 `world/SEED.md` 扩写世界。输出必须能被保存为工作区文件，后续长期上下文将拆分到 world、memory、maps、characters、locations、history、threads 等目录。",
    "",
    "## 固定规则",
    "",
    "- 玩家在种子里写下的设定是已确认事实，不能被覆盖。",
    "- 给出摘要和开局叙事时，为后续拆分成记忆、地点、角色故事、历史事件保留清晰边界。",
    "- 不要提前剧透玩家未发现的秘密。",
    "",
  ].join("\n");
  const seedFile = [
    "# 初始世界种子",
    "",
    `- 世界名：${seed.world_name}`,
    `- 题材：${seed.genre}`,
    `- 基调：${seed.tone}`,
    `- 内容限制：${seed.limits || "无"}`,
    `- 叙事细节：${seed.narrative_detail}`,
    `- NPC 自主频率：${seed.npc_autonomy_frequency}`,
    "",
    "## 主角",
    "",
    `- 名字：${seed.hero.name}`,
    `- 描述：${seed.hero.description}`,
    `- 目标：${seed.hero.goal}`,
    `- 能力：${seed.hero.ability}`,
    `- 弱点：${seed.hero.weakness}`,
    "",
    "## 关键角色",
    "",
    ...seed.key_characters.map(
      (character, index) =>
        `- ${index + 1}. ${character.name}：${character.role}，关系 ${character.relationship}，目标 ${character.goal}，秘密 ${character.secret}`,
    ),
    "",
  ].join("\n");
  return {
    workspace_format: "evolvria_workspace_v1",
    instructions_path: "AGENTS.md",
    instructions: agents,
    loaded_files: [
      { path: "AGENTS.md", content: agents },
      { path: "world/SEED.md", content: seedFile },
    ],
    available_files: ["AGENTS.md", "world/SEED.md"],
    loading_policy: "新世界创建只加载 AGENTS.md 和 world/SEED.md；生成内容应方便后续拆分为工作区文档。",
  };
}

function buildAgentsMarkdown(payload: SavePayload): string {
  const world = payload.world as Partial<World>;
  return [
    "# Evolvria 世界工作区",
    "",
    `世界：${world.name ?? "未命名世界"}`,
    "",
    "## 启动顺序",
    "",
    "每次处理世界模拟、玩家行动、NPC 行动或记忆整理请求时，先阅读本文件，再只加载任务需要的文档。不要把整个世界一次性塞进上下文；优先使用索引、摘要和当前场景相关文件。",
    "",
    "## 固定规则",
    "",
    "- 玩家已确认的事实优先级最高，不能被 AI 覆盖。",
    "- 任何剧情变化都必须能落到时间线、记忆、角色、地点或线索文档之一。",
    "- 未被玩家发现的秘密只能作为隐藏状态维护，不要在面向玩家的叙事里提前剧透。",
    "- 如果上下文不足，保持保守，不要编造与已存档文档冲突的设定。",
    "",
    "## 常用文件",
    "",
    "- `world/OVERVIEW.md`：世界摘要、题材、当前时间、主题。",
    "- `world/RULES.md`：世界规则、内容边界、叙事限制。",
    "- `memory/MEMORY.md`：长期记忆、重要事实、最近高权重记忆。",
    "- `maps/MAP.md`：地图索引、路线和地点入口。",
    "- `characters/*.md`：角色故事、目标、关系和玩家笔记。",
    "- `locations/*.md`：地图地点、状态标签、路线和玩家笔记。",
    "- `history/TIMELINE.md`：历史事件和最近行动。",
    "- `threads/THREADS.md`：未完成线索、主线、关系线。",
    "- `state/payload.json`：机器可读完整状态，只在需要完整校验或导入导出时使用。",
    "",
    "## 上下文预算策略",
    "",
    "短请求只加载 AGENTS.md、当前地点、参与角色、相关记忆、最近事件和开放线索。长篇总结或一致性检查才加载完整 history、characters、locations。若文档很长，先读标题、摘要和最近条目。",
    "",
  ].join("\n");
}

function buildManifest(payload: SavePayload): Record<string, unknown> {
  const world = payload.world as Partial<World>;
  return {
    workspace_format: "evolvria_workspace_v1",
    schema_version: payload.schema_version,
    world_id: world.id ?? "world",
    display_name: world.name ?? "未命名世界",
    updated_at: payload.updated_at,
    files: {
      instructions: "AGENTS.md",
      payload: "state/payload.json",
      world: ["world/OVERVIEW.md", "world/RULES.md"],
      memory: "memory/MEMORY.md",
      map: "maps/MAP.md",
      history: "history/TIMELINE.md",
      threads: "threads/THREADS.md",
      characters: payload.characters.map((character) => characterPath(character.id)),
      locations: payload.locations.map((location) => locationPath(location.id)),
    },
  };
}

function buildWorldOverview(payload: SavePayload): string {
  const world = payload.world as Partial<World>;
  return [
    "# 世界概览",
    "",
    `- 名称：${world.name ?? "未命名世界"}`,
    `- 题材：${world.genre ?? "未知"}`,
    `- 基调：${formatList(world.tone)}`,
    `- 当前时间：${formatWorldTime(world.current_time)}`,
    `- 创建时间：${world.created_at ?? "未知"}`,
    "",
    "## 摘要",
    "",
    world.summary ?? "暂无摘要。",
    "",
    "## 主题",
    "",
    bulletList(world.themes),
    "",
  ].join("\n");
}

function buildWorldRules(payload: SavePayload): string {
  const world = payload.world as Partial<World>;
  return [
    "# 世界规则",
    "",
    "## 规则",
    "",
    bulletList(world.rules),
    "",
    "## 内容边界",
    "",
    bulletList(world.content_limits),
    "",
    `- 叙事细节：${world.narrative_detail ?? "适中"}`,
    `- NPC 自主频率：${world.npc_autonomy_frequency ?? "中频"}`,
    "",
  ].join("\n");
}

function buildMemoryMarkdown(payload: SavePayload): string {
  const memories = [...payload.memories].sort((left, right) => right.importance - left.importance).slice(0, 40);
  return [
    "# 长期记忆",
    "",
    `记忆计数器：${payload.memory_counter}`,
    "",
    ...memories.map((memory) =>
      [
        `## ${memory.id}`,
        "",
        `- 范围：${memory.scope}`,
        `- 所属：${memory.owner_id}`,
        `- 重要性：${memory.importance}`,
        `- 可信度：${memory.confidence}`,
        `- 标签：${formatList(memory.tags)}`,
        `- 事件：${memory.event_id || "无"}`,
        "",
        memory.text,
        "",
        "事实：",
        bulletList(memory.facts),
        "",
      ].join("\n"),
    ),
  ].join("\n");
}

function buildMapMarkdown(payload: SavePayload): string {
  const world = payload.world as Partial<World>;
  return [
    "# 地图",
    "",
    `- 地图文件：${world.map_image?.image_path ?? "未设置"}`,
    `- 尺寸：${world.map_image?.width ?? "?"} x ${world.map_image?.height ?? "?"}`,
    "",
    "## 地点索引",
    "",
    ...payload.locations.map((location) => `- [${location.name}](../${locationPath(location.id)})：${location.type}，${location.visibility}`),
    "",
    "## 路线",
    "",
    ...payload.world && "map_routes" in payload.world
      ? (payload.world.map_routes ?? []).map((route) => `- ${route.name}：${route.from_location_id} -> ${route.to_location_id}，危险 ${route.danger}`)
      : [],
    "",
  ].join("\n");
}

function buildTimelineMarkdown(timeline: TimelineEvent[]): string {
  return [
    "# 历史事件",
    "",
    ...timeline.map((event) =>
      [
        `## ${event.id} ${event.title}`,
        "",
        `- 类型：${event.type}`,
        `- 时间：${formatWorldTime(event.world_time)}`,
        `- 地点：${event.location_id || "未知"}`,
        `- 参与者：${formatList(event.participant_ids)}`,
        `- 可见性：${event.visibility}`,
        `- 重要性：${event.importance}`,
        "",
        event.description,
        "",
        "影响：",
        bulletList(event.effects),
        "",
      ].join("\n"),
    ),
  ].join("\n");
}

function buildThreadsMarkdown(payload: SavePayload): string {
  return [
    "# 线索与任务",
    "",
    ...payload.threads.map((thread) =>
      [
        `## ${thread.id} ${thread.title}`,
        "",
        `- 类型：${thread.kind}`,
        `- 状态：${thread.status}`,
        `- 优先级：${thread.priority}`,
        `- 标签：${formatList(thread.tags)}`,
        `- 起始事件：${thread.event_id}`,
        "",
        thread.description,
        "",
        "进展：",
        bulletList(thread.progress.map((progress) => `${progress.created_at} ${progress.event_id}：${progress.text}`)),
        "",
      ].join("\n"),
    ),
  ].join("\n");
}

function buildCharacterMarkdown(character: Character, payload: SavePayload): string {
  const location = payload.locations.find((item) => item.id === character.current_location_id);
  return [
    `# ${character.name}`,
    "",
    `- ID：${character.id}`,
    `- 身份：${character.role}`,
    `- 状态：${character.status}`,
    `- 可见性：${character.visibility ?? "met"}`,
    `- 当前位置：${location ? `${location.name} (${location.id})` : character.current_location_id}`,
    `- 同行：${character.companion ? "是" : "否"}`,
    "",
    "## 简介",
    "",
    character.description || "暂无。",
    "",
    "## 性格与目标",
    "",
    `- 性格：${formatList(character.personality)}`,
    `- 目标：${formatList(character.goals)}`,
    `- 特质：${formatList(character.traits)}`,
    `- 行动倾向：${character.action_tendency ?? "未设置"}`,
    "",
    "## 关系",
    "",
    ...Object.entries(character.relationships).map(
      ([targetId, relationship]) =>
        `- ${targetId}：${relationship.type}，信任 ${relationship.trust}，情感 ${relationship.affection}，张力 ${relationship.tension}。${relationship.notes}`,
    ),
    "",
    "## 玩家笔记",
    "",
    character.player_notes || "暂无。",
    "",
    "## 记忆摘要",
    "",
    character.memory_summary || "暂无。",
    "",
  ].join("\n");
}

function buildLocationMarkdown(location: Location, payload: SavePayload): string {
  const events = payload.timeline.filter((event) => event.location_id === location.id);
  return [
    `# ${location.name}`,
    "",
    `- ID：${location.id}`,
    `- 类型：${location.type}`,
    `- 可见性：${location.visibility}`,
    `- 玩家已知：${location.known_to_player ? "是" : "否"}`,
    `- 坐标：${location.position.x}, ${location.position.y}`,
    `- 控制势力：${location.controlling_faction_id ?? "无"}`,
    `- 状态标签：${formatList(location.state_tags)}`,
    "",
    "## 描述",
    "",
    location.description || "暂无。",
    "",
    "## 连接地点",
    "",
    bulletList(location.connected_location_ids),
    "",
    "## 本地事件",
    "",
    bulletList(events.map((event) => `${event.id} ${event.title}`)),
    "",
    "## 玩家笔记",
    "",
    location.player_notes || "暂无。",
    "",
  ].join("\n");
}

function file(path: string, content: string): WorldWorkspaceFile {
  return { path, content };
}

function characterPath(id: string): string {
  return `characters/${safePathComponent(id)}.md`;
}

function locationPath(id: string): string {
  return `locations/${safePathComponent(id)}.md`;
}

function safePathComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "item";
}

function formatList(values: unknown): string {
  return Array.isArray(values) && values.length > 0 ? values.join("、") : "无";
}

function bulletList(values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return "- 无";
  return values.map((value) => `- ${String(value)}`).join("\n");
}

function formatWorldTime(value: unknown): string {
  if (!value || typeof value !== "object") return "未知";
  const time = value as { day?: number; hour?: number; calendar_label?: string };
  return `${time.calendar_label ?? ""} 第 ${time.day ?? "?"} 日 ${time.hour ?? "?"} 时`.trim();
}

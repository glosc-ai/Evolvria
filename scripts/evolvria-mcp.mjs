#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

const SCHEMA_VERSION = 1;
const WORKSPACE_FORMAT = "evolvria_workspace_v1";
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".json", ".txt", ".csv", ".yml", ".yaml"]);
const REQUIRED_ARRAY_FIELDS = ["characters", "locations", "factions", "timeline", "memories", "ai_logs", "threads", "suggested_actions"];

const args = parseArgs(process.argv.slice(2));
const config = createConfig(args);

if (args.selfTest) {
  await runSelfTest();
  process.exit(0);
}

startServer();

function startServer() {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", async (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (true) {
      const parsed = readFramedMessage(buffer);
      if (!parsed) break;
      buffer = parsed.rest;
      await handleRpcMessage(parsed.message).catch((error) => {
        if (parsed.message?.id !== undefined) {
          sendRpc({
            jsonrpc: "2.0",
            id: parsed.message.id,
            error: { code: -32603, message: errorMessage(error) },
          });
        }
      });
    }
  });
}

async function handleRpcMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.id === undefined) return;
  try {
    if (message.method === "initialize") {
      sendRpc({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "evolvria-game-mcp", version: "0.1.0" },
        },
      });
      return;
    }
    if (message.method === "ping") {
      sendRpc({ jsonrpc: "2.0", id: message.id, result: {} });
      return;
    }
    if (message.method === "tools/list") {
      sendRpc({ jsonrpc: "2.0", id: message.id, result: { tools: toolDefinitions() } });
      return;
    }
    if (message.method === "tools/call") {
      const result = await callTool(message.params?.name, message.params?.arguments ?? {});
      sendRpc({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      });
      return;
    }
    sendRpc({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: `不支持的 MCP 方法：${message.method}` },
    });
  } catch (error) {
    sendRpc({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32000, message: errorMessage(error) },
    });
  }
}

function readFramedMessage(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) throw new Error("MCP 消息缺少 Content-Length。");
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return null;
  const raw = buffer.slice(bodyStart, bodyEnd).toString("utf8");
  return { message: JSON.parse(raw), rest: buffer.slice(bodyEnd) };
}

function sendRpc(message) {
  const text = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
}

async function callTool(name, input) {
  switch (name) {
    case "evolvria_list_workspace_files":
      return { status: "ok", files: await listWorkspaceFiles() };
    case "evolvria_read_workspace_file":
      return readWorkspaceFile(requireString(input.path, "path"));
    case "evolvria_write_workspace_file":
      return writeWorkspaceFile(requireString(input.path, "path"), requireString(input.content, "content"), input.backup !== false);
    case "evolvria_backup_save":
      return backupSave(typeof input.label === "string" ? input.label : "manual");
    case "evolvria_create_world":
      return createWorld(input.seed, input.overwrite === true);
    case "evolvria_modify_character_data":
      return modifyCharacterData(requireString(input.character_id, "character_id"), input.updates, input.backup !== false);
    case "evolvria_load_active_payload":
      return { status: "ok", payload: await loadActivePayload() };
    case "evolvria_validate_payload":
      return validatePayloadTool(input.payload);
    default:
      throw new Error(`未知 Evolvria MCP tool：${name}`);
  }
}

function toolDefinitions() {
  return [
    {
      name: "evolvria_list_workspace_files",
      description: "列出 Evolvria active world 工作区文件。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "evolvria_read_workspace_file",
      description: "读取 active world 工作区内文件，禁止工作区外路径。",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "evolvria_write_workspace_file",
      description: "写入 active world 工作区文本文件；state/payload.json 会进行 schema v1 校验。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          backup: { type: "boolean", default: true },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "evolvria_backup_save",
      description: "复制当前 active world 到 saves/backups/mcp_*。",
      inputSchema: {
        type: "object",
        properties: { label: { type: "string" } },
        additionalProperties: false,
      },
    },
    {
      name: "evolvria_create_world",
      description: "根据 WorldSeed 创建 schema v1 active world。覆盖已有世界需要 overwrite=true。",
      inputSchema: {
        type: "object",
        properties: {
          seed: { type: "object" },
          overwrite: { type: "boolean", default: false },
        },
        required: ["seed"],
        additionalProperties: false,
      },
    },
    {
      name: "evolvria_modify_character_data",
      description: "修改角色受控字段并保存 state/payload.json，禁止修改角色 name。",
      inputSchema: {
        type: "object",
        properties: {
          character_id: { type: "string" },
          updates: { type: "object" },
          backup: { type: "boolean", default: true },
        },
        required: ["character_id", "updates"],
        additionalProperties: false,
      },
    },
    {
      name: "evolvria_load_active_payload",
      description: "读取当前 active payload。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "evolvria_validate_payload",
      description: "校验传入 payload；未传时校验当前 active payload。",
      inputSchema: {
        type: "object",
        properties: { payload: { type: "object" } },
        additionalProperties: false,
      },
    },
  ];
}

async function listWorkspaceFiles() {
  if (!fsSync.existsSync(config.activeWorkspace)) return [];
  const files = [];
  await walk(config.activeWorkspace, files);
  return files.sort();
}

async function walk(root, files, base = root) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const relative = path.relative(base, absolute).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      await walk(absolute, files, base);
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
}

async function readWorkspaceFile(relativePath) {
  const target = resolveWorkspacePath(relativePath);
  const stats = await fs.stat(target).catch(() => null);
  if (!stats || !stats.isFile()) throw new Error(`工作区文件不存在：${relativePath}`);
  const ext = path.extname(target).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext) || path.basename(target) === "AGENTS.md") {
    return { status: "ok", path: normalizeWorkspacePath(relativePath), encoding: "utf8", content: await fs.readFile(target, "utf8") };
  }
  return { status: "ok", path: normalizeWorkspacePath(relativePath), encoding: "base64", content: (await fs.readFile(target)).toString("base64") };
}

async function writeWorkspaceFile(relativePath, content, backup = true) {
  const normalized = normalizeWorkspacePath(relativePath);
  const ext = path.extname(normalized).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext) && normalized !== "AGENTS.md") throw new Error("只允许写入 Markdown、JSON、YAML、CSV 或文本文件。");
  if (normalized === "state/payload.json") validatePayload(JSON.parse(content));
  if (backup) await backupSave("before-write");
  const target = resolveWorkspacePath(normalized);
  await writeTextAtomic(target, content);
  return { status: "ok", path: normalized, bytes: Buffer.byteLength(content, "utf8") };
}

async function backupSave(label = "manual") {
  await fs.mkdir(config.backupDir, { recursive: true });
  const stamp = timestamp();
  const safeLabel = sanitizeFileComponent(label || "manual");
  const active = config.activeWorkspace;
  const legacy = path.join(config.saveDir, "active_world.json");
  if (fsSync.existsSync(active)) {
    const target = path.join(config.backupDir, `mcp_${safeLabel}_${stamp}`);
    await fs.cp(active, target, { recursive: true });
    return { status: "ok", path: target, kind: "workspace" };
  }
  if (fsSync.existsSync(legacy)) {
    const target = path.join(config.backupDir, `mcp_${safeLabel}_${stamp}.json`);
    await fs.copyFile(legacy, target);
    return { status: "ok", path: target, kind: "legacy_json" };
  }
  return { status: "ok", path: "", kind: "none", warning: "当前没有 active world 可备份。" };
}

async function createWorld(seed, overwrite = false) {
  const normalizedSeed = normalizeSeed(seed);
  if (fsSync.existsSync(config.activeWorkspace) && !overwrite) {
    throw new Error("active world 已存在。若要覆盖，请传 overwrite=true；覆盖前 MCP 会自动备份。");
  }
  if (fsSync.existsSync(config.activeWorkspace)) {
    await backupSave("before-create-world");
    await fs.rm(config.activeWorkspace, { recursive: true, force: true });
  }
  const payload = createInitialPayload(normalizedSeed);
  await writeWorkspaceSave(payload);
  return { status: "ok", payload, active_workspace: config.activeWorkspace };
}

async function modifyCharacterData(characterId, updates, backup = true) {
  const payload = await loadActivePayload();
  const character = payload.characters.find((item) => item.id === characterId);
  if (!character) throw new Error(`角色不存在：${characterId}`);
  const normalizedUpdates = normalizeCharacterUpdates(updates);
  if (Object.hasOwn(normalizedUpdates, "name")) throw new Error("禁止通过 MCP 修改角色 name。");
  if (normalizedUpdates.current_location_id && !payload.locations.some((item) => item.id === normalizedUpdates.current_location_id)) {
    throw new Error(`目标地点不存在：${normalizedUpdates.current_location_id}`);
  }
  if (backup) await backupSave("before-modify-character");
  for (const [key, value] of Object.entries(normalizedUpdates)) {
    character[key] = value;
  }
  if (Object.hasOwn(normalizedUpdates, "player_notes")) character.player_notes_updated_at = new Date().toISOString();
  if (Object.hasOwn(normalizedUpdates, "portrait_image_url")) character.portrait_updated_at = new Date().toISOString();
  payload.updated_at = new Date().toISOString();
  validatePayload(payload);
  await writeTextAtomic(config.activePayload, JSON.stringify(payload, null, 2));
  await writeTextAtomic(path.join(config.activeWorkspace, `characters/${sanitizeFileComponent(character.id)}.md`), buildCharacterMarkdown(character, payload));
  return { status: "ok", character, payload_path: config.activePayload };
}

async function loadActivePayload() {
  const payloadPath = config.activePayload;
  const legacyPath = path.join(config.saveDir, "active_world.json");
  const target = fsSync.existsSync(payloadPath) ? payloadPath : legacyPath;
  if (!fsSync.existsSync(target)) throw new Error("当前没有 active world payload。");
  const payload = JSON.parse(await fs.readFile(target, "utf8"));
  validatePayload(payload);
  return payload;
}

async function validatePayloadTool(payload) {
  const source = payload ?? (await loadActivePayload());
  validatePayload(source);
  return { status: "ok", schema_version: source.schema_version, world_id: source.world?.id ?? "world" };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("payload 必须是对象。");
  if (payload.schema_version !== SCHEMA_VERSION) throw new Error("schema_version 不受支持。");
  if (!payload.world || typeof payload.world !== "object") throw new Error("payload 缺少 world。");
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(payload[field])) throw new Error(`payload 缺少数组字段：${field}`);
  }
  return true;
}

async function writeWorkspaceSave(payload) {
  validatePayload(payload);
  for (const [relativePath, content] of buildWorkspaceFiles(payload)) {
    await writeTextAtomic(path.join(config.activeWorkspace, relativePath), content);
  }
}

function buildWorkspaceFiles(payload) {
  const files = [
    ["AGENTS.md", buildAgentsMarkdown(payload)],
    ["manifest.json", JSON.stringify(buildManifest(payload), null, 2)],
    ["world/OVERVIEW.md", buildWorldOverview(payload)],
    ["world/RULES.md", buildWorldRules(payload)],
    ["memory/MEMORY.md", buildMemoryMarkdown(payload)],
    ["maps/MAP.md", buildMapMarkdown(payload)],
    ["history/TIMELINE.md", buildTimelineMarkdown(payload)],
    ["threads/THREADS.md", buildThreadsMarkdown(payload)],
    ["state/payload.json", JSON.stringify(payload, null, 2)],
  ];
  for (const character of payload.characters) {
    files.push([`characters/${sanitizeFileComponent(character.id)}.md`, buildCharacterMarkdown(character, payload)]);
  }
  for (const location of payload.locations) {
    files.push([`locations/${sanitizeFileComponent(location.id)}.md`, buildLocationMarkdown(location, payload)]);
  }
  return files;
}

function createInitialPayload(seed) {
  const now = new Date().toISOString();
  const worldId = `world_${Date.now()}`;
  const factions = [
    { id: "fac_001", name: "边境议会", agenda: "维持商路和税收", attitude: "谨慎合作", controlled_location_ids: ["loc_start", "loc_harbor"] },
    { id: "fac_002", name: "雾林守望", agenda: "阻止外人破坏旧林契约", attitude: "观察", controlled_location_ids: ["loc_forest"] },
    { id: "fac_003", name: "白塔学社", agenda: "寻找遗迹中的年代断层证据", attitude: "利益交换", controlled_location_ids: ["loc_ruin"] },
  ];
  const locations = defaultLocations();
  const characters = buildCharacters(seed);
  const world = {
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
    map_image: {
      id: "map_001",
      name: "MCP 创世地图",
      image_path: "generated://map_001",
      width: 960,
      height: 640,
      scale_label: "未设置比例尺",
      locations: locations.map((item) => item.id),
      routes: [],
      generator: { mode: "mcp_seed", creation_only: true, locked_after_creation: true },
    },
    map_routes: [],
    map_regions: [],
    map_locked: true,
    created_at: now,
    schema_version: SCHEMA_VERSION,
  };
  const opening = {
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
      { id: "thread_001", title: "徽记来源", description: "查清公告板、白塔遗迹和旧档案之间的关系。", kind: "main", status: "open", priority: 0.9, tags: ["clue", "main"], event_id: opening.id, progress: [] },
      { id: "thread_002", title: "角色动机", description: "理解关键角色为什么追踪同一组线索。", kind: "relationship", status: "open", priority: 0.64, tags: ["character"], event_id: opening.id, progress: [] },
    ],
    suggested_actions: ["调查公告板徽记", `询问${seed.key_characters?.[0]?.name || "同行者"}旧档案`, "前往雾松林"],
    event_counter: 1,
    memory_counter: 1,
    location_counter: 100,
    thread_counter: 2,
    updated_at: now,
  };
}

function buildCharacters(seed) {
  const hero = {
    id: "char_hero",
    name: seed.hero?.name || "主角",
    gender: seed.hero?.gender || "未指定",
    role: "player",
    description: seed.hero?.description || "玩家创建的主角。",
    personality: splitTags(seed.hero?.ability || ""),
    goals: splitTags(seed.hero?.goal || ""),
    secrets: [],
    current_location_id: "loc_start",
    status: "active",
    traits: splitTags(`${seed.hero?.ability || ""},${seed.hero?.weakness || ""}`),
    relationships: {},
    memory_summary: "",
    known_event_ids: [],
    player_notes: "",
    player_notes_updated_at: "",
    appearance_description: seed.hero?.appearance_description || `${seed.hero?.name || "主角"}（${seed.hero?.gender || "未指定"}），${seed.hero?.description || "玩家创建的角色。"}`,
    companion: false,
    visibility: "met",
  };
  const characters = [hero];
  for (const [index, source] of (seed.key_characters || []).entries()) {
    const id = `char_${String(index + 1).padStart(3, "0")}`;
    characters.push({
      id,
      name: source.name || `关键角色 ${index + 1}`,
      gender: source.gender || "未指定",
      role: source.role || "关键角色",
      description: source.description || "",
      personality: splitTags(source.personality || ""),
      goals: splitTags(source.goal || ""),
      secrets: splitTags(source.secret || ""),
      current_location_id: (source.relationship || "").includes("同行") ? "loc_start" : index % 2 === 0 ? "loc_forest" : "loc_ruin",
      status: "active",
      traits: splitTags(source.personality || ""),
      relationships: {},
      memory_summary: "",
      known_event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      appearance_description: source.appearance_description || `${source.name || `关键角色 ${index + 1}`}（${source.gender || "未指定"}），${source.role || "关键角色"}，${source.description || ""}`,
      action_tendency: source.action_tendency || "",
      companion: (source.relationship || "").includes("同行"),
      visibility: (source.relationship || "").includes("同行") ? "met" : "heard",
    });
  }
  for (const character of characters) {
    for (const other of characters) {
      if (character.id === other.id) continue;
      character.relationships[other.id] ??= { type: "known", trust: 0.45, affection: 0.2, tension: 0.18, notes: "关系尚未明确。" };
    }
  }
  return characters;
}

function defaultLocations() {
  return [
    { id: "loc_start", name: "黑石镇", type: "town", description: "边境贸易镇，公告板上反复出现陌生徽记。", map_id: "map_001", position: { x: 0.42, y: 0.58 }, connected_location_ids: ["loc_forest", "loc_ruin"], controlling_faction_id: "fac_001", known_to_player: true, visibility: "known_to_player", state_tags: ["safe", "market"], event_ids: [], player_notes: "", player_notes_updated_at: "", biome: "temperate_grassland", height: 0.48 },
    { id: "loc_forest", name: "雾松林", type: "forest", description: "雾气常年不散，旧路标指向一处被遗忘的驿站。", map_id: "map_001", position: { x: 0.26, y: 0.46 }, connected_location_ids: ["loc_start", "loc_ruin"], controlling_faction_id: "fac_002", known_to_player: true, visibility: "known_to_player", state_tags: ["wild", "mist"], event_ids: [], player_notes: "", player_notes_updated_at: "", biome: "forest", height: 0.57 },
    { id: "loc_ruin", name: "白塔遗迹", type: "ruin", description: "塔身只剩半截，墙面刻着和公告板相似的徽记。", map_id: "map_001", position: { x: 0.62, y: 0.34 }, connected_location_ids: ["loc_start", "loc_forest", "loc_harbor"], controlling_faction_id: "fac_003", known_to_player: true, visibility: "known_to_player", state_tags: ["ancient", "danger"], event_ids: [], player_notes: "", player_notes_updated_at: "", biome: "highland", height: 0.72 },
    { id: "loc_harbor", name: "银潮港", type: "harbor", description: "商船和密探都在这里交换消息。", map_id: "map_001", position: { x: 0.74, y: 0.66 }, connected_location_ids: ["loc_ruin"], controlling_faction_id: "fac_001", known_to_player: false, visibility: "heard", state_tags: ["trade", "coast"], event_ids: [], player_notes: "", player_notes_updated_at: "", biome: "coast", height: 0.22 },
  ];
}

function buildAgentsMarkdown(payload) {
  return `# Evolvria 世界工作区\n\n世界：${payload.world?.name || "未命名世界"}\n\n## 启动顺序\n\n每次处理世界模拟、玩家行动、NPC 行动或记忆整理请求时，先阅读本文件，再只加载任务需要的文档。\n\n## 固定规则\n\n- 玩家已确认的事实优先级最高，不能被 AI 覆盖。\n- 任何剧情变化都必须能落到时间线、记忆、角色、地点或线索文档之一。\n- 未被玩家发现的秘密只能作为隐藏状态维护，不要在面向玩家的叙事里提前剧透。\n- 如果上下文不足，保持保守，不要编造与已存档文档冲突的设定。\n\n## 常用文件\n\n- \`state/payload.json\`：权威机器状态。\n- \`characters/*.md\`：角色资料。\n- \`locations/*.md\`：地点资料。\n`;
}

function buildManifest(payload) {
  return {
    workspace_format: WORKSPACE_FORMAT,
    schema_version: payload.schema_version,
    world_id: payload.world?.id ?? "world",
    display_name: payload.world?.name ?? "未命名世界",
    updated_at: payload.updated_at,
    files: {
      instructions: "AGENTS.md",
      payload: "state/payload.json",
      characters: payload.characters.map((item) => `characters/${sanitizeFileComponent(item.id)}.md`),
      locations: payload.locations.map((item) => `locations/${sanitizeFileComponent(item.id)}.md`),
    },
  };
}

function buildWorldOverview(payload) {
  return `# 世界概览\n\n- 名称：${payload.world?.name || "未命名世界"}\n- 题材：${payload.world?.genre || "未知"}\n- 当前时间：${worldTime(payload.world?.current_time)}\n\n## 摘要\n\n${payload.world?.summary || "暂无摘要。"}\n`;
}

function buildWorldRules(payload) {
  return `# 世界规则\n\n## 规则\n\n${bulletList(payload.world?.rules)}\n\n## 内容边界\n\n${bulletList(payload.world?.content_limits)}\n`;
}

function buildMemoryMarkdown(payload) {
  return `# 长期记忆\n\n${payload.memories.map((memory) => `## ${memory.id}\n\n${memory.text}\n\n事实：\n${bulletList(memory.facts)}\n`).join("\n")}`;
}

function buildMapMarkdown(payload) {
  return `# 地图\n\n## 地点索引\n\n${payload.locations.map((location) => `- ${location.id} ${location.name}：${location.type}`).join("\n")}\n`;
}

function buildTimelineMarkdown(payload) {
  return `# 历史事件\n\n${payload.timeline.map((event) => `## ${event.id} ${event.title}\n\n- 时间：${worldTime(event.world_time)}\n- 地点：${event.location_id}\n\n${event.description}\n`).join("\n")}`;
}

function buildThreadsMarkdown(payload) {
  return `# 线索与任务\n\n${payload.threads.map((thread) => `## ${thread.id} ${thread.title}\n\n${thread.description}\n`).join("\n")}`;
}

function buildCharacterMarkdown(character, payload) {
  const location = payload.locations.find((item) => item.id === character.current_location_id);
  return `# ${character.name}\n\n- ID：${character.id}\n- 性别：${character.gender || "未指定"}\n- 身份：${character.role || ""}\n- 状态：${character.status || ""}\n- 可见性：${character.visibility || "met"}\n- 当前位置：${location?.name || character.current_location_id}\n- 同行：${character.companion ? "是" : "否"}\n\n## 简介\n\n${character.description || "暂无。"}\n\n## 性格与目标\n\n- 性格：${(character.personality || []).join("、")}\n- 目标：${(character.goals || []).join("、")}\n- 行动倾向：${character.action_tendency || "未设置"}\n\n## 玩家笔记\n\n${character.player_notes || "暂无。"}\n`;
}

function buildLocationMarkdown(location) {
  return `# ${location.name}\n\n- ID：${location.id}\n- 类型：${location.type}\n- 可见性：${location.visibility}\n- 玩家已知：${location.known_to_player ? "是" : "否"}\n\n## 描述\n\n${location.description || "暂无。"}\n\n## 连接地点\n\n${bulletList(location.connected_location_ids)}\n\n## 玩家笔记\n\n${location.player_notes || "暂无。"}\n`;
}

function normalizeSeed(seed) {
  if (!seed || typeof seed !== "object") throw new Error("缺少 WorldSeed。");
  return {
    world_name: String(seed.world_name || "未命名世界"),
    genre: String(seed.genre || "奇幻"),
    tone: String(seed.tone || "冒险"),
    limits: String(seed.limits || ""),
    narrative_detail: String(seed.narrative_detail || "适中"),
    npc_autonomy_frequency: String(seed.npc_autonomy_frequency || "中频"),
    hero: {
      name: String(seed.hero?.name || "主角"),
      gender: String(seed.hero?.gender || "未指定"),
      description: String(seed.hero?.description || "玩家创建的主角。"),
      goal: String(seed.hero?.goal || ""),
      ability: String(seed.hero?.ability || ""),
      weakness: String(seed.hero?.weakness || ""),
      appearance_description: seed.hero?.appearance_description ? String(seed.hero.appearance_description) : undefined,
    },
    key_characters: Array.isArray(seed.key_characters) ? seed.key_characters.map((item) => ({
      name: String(item.name || "关键角色"),
      gender: String(item.gender || "未指定"),
      role: String(item.role || "关键角色"),
      relationship: String(item.relationship || ""),
      personality: String(item.personality || ""),
      goal: String(item.goal || ""),
      secret: String(item.secret || ""),
      action_tendency: String(item.action_tendency || ""),
      description: String(item.description || ""),
      appearance_description: item.appearance_description ? String(item.appearance_description) : undefined,
    })) : [],
  };
}

function normalizeCharacterUpdates(updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw new Error("updates 必须是对象。");
  const allowed = new Set(["description", "personality", "goals", "secrets", "current_location_id", "status", "traits", "memory_summary", "player_notes", "appearance_description", "portrait_prompt", "portrait_image_url", "action_tendency", "companion", "visibility"]);
  const output = {};
  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.has(key)) throw new Error(`不允许修改角色字段：${key}`);
    if (["personality", "goals", "secrets", "traits"].includes(key)) {
      output[key] = Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : splitTags(String(value || ""));
    } else if (key === "companion") {
      output[key] = Boolean(value);
    } else if (key === "visibility") {
      if (!["met", "heard", "hidden"].includes(value)) throw new Error("visibility 只能是 met、heard 或 hidden。");
      output[key] = value;
    } else {
      output[key] = String(value ?? "").trim();
    }
  }
  return output;
}

function resolveWorkspacePath(relativePath) {
  const normalized = normalizeWorkspacePath(relativePath);
  const root = path.resolve(config.activeWorkspace);
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("路径越界，禁止访问工作区外文件。");
  return target;
}

function normalizeWorkspacePath(relativePath) {
  if (typeof relativePath !== "string") throw new Error("path 必须是字符串。");
  const normalized = relativePath.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "..")) throw new Error("工作区路径不能为空、包含空段或上级目录。");
  if (/^(settings\.json|\.env|secrets?\/)/i.test(normalized)) throw new Error("禁止通过 MCP 访问密钥或设置文件。");
  return normalized;
}

async function writeTextAtomic(target, content) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, content, "utf8");
  await fs.rename(temp, target);
}

function parseArgs(argv) {
  const parsed = { selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--self-test") parsed.selfTest = true;
    if (value === "--app-data") parsed.appDataDir = argv[++index];
    if (value === "--save-dir") parsed.saveDir = argv[++index];
  }
  return parsed;
}

function createConfig(parsedArgs) {
  const appDataDir = path.resolve(parsedArgs.appDataDir || process.env.EVOLVRIA_APP_DATA_DIR || defaultAppDataDir());
  const saveDir = path.resolve(parsedArgs.saveDir || process.env.EVOLVRIA_SAVE_DIR || path.join(appDataDir, "saves"));
  const activeWorkspace = path.join(saveDir, "active_world");
  return {
    appDataDir,
    saveDir,
    activeWorkspace,
    activePayload: path.join(activeWorkspace, "state", "payload.json"),
    backupDir: path.join(saveDir, "backups"),
  };
}

function defaultAppDataDir() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "com.gloscai.evolvria");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "com.gloscai.evolvria");
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "com.gloscai.evolvria");
}

async function runSelfTest() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evolvria-mcp-"));
  config.appDataDir = tmp;
  config.saveDir = path.join(tmp, "saves");
  config.activeWorkspace = path.join(config.saveDir, "active_world");
  config.activePayload = path.join(config.activeWorkspace, "state", "payload.json");
  config.backupDir = path.join(config.saveDir, "backups");
  const seed = normalizeSeed({ world_name: "烟测世界", genre: "奇幻", tone: "冒险", hero: { name: "主角" }, key_characters: [{ name: "璃安", relationship: "同行" }] });
  await createWorld(seed, true);
  await modifyCharacterData("char_001", { player_notes: "MCP 自测备注" }, true);
  const validation = await validatePayloadTool();
  if (validation.status !== "ok") throw new Error("自测失败。");
  console.log(JSON.stringify({ status: "ok", temp: tmp, validation }, null, 2));
}

function requireString(value, key) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`缺少 ${key}。`);
  return value;
}

function splitTags(text) {
  return String(text || "")
    .split(/[,，、;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bulletList(items) {
  return Array.isArray(items) && items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- 无";
}

function worldTime(time) {
  if (!time) return "未知";
  const label = time.calendar_label || "";
  return `${label} 第 ${time.day ?? "?"} 日 ${time.hour ?? "?"} 时`.trim();
}

function sanitizeFileComponent(value) {
  const safe = String(value || "item").replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe.replace(/_/g, "").length ? safe : "item";
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 17);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

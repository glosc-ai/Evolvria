#!/usr/bin/env node
import fs from "node:fs/promises";

const ALLOWED_FIELDS = new Set([
  "description",
  "personality",
  "goals",
  "secrets",
  "current_location_id",
  "status",
  "traits",
  "memory_summary",
  "player_notes",
  "appearance_description",
  "portrait_prompt",
  "portrait_image_url",
  "action_tendency",
  "companion",
  "visibility",
]);
const ARRAY_FIELDS = new Set(["personality", "goals", "secrets", "traits"]);

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.payloadPath || !args.characterId || !args.updatesArg) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const payload = JSON.parse(await fs.readFile(args.payloadPath, "utf8"));
const updates = await readUpdates(args.updatesArg);
const next = applyCharacterUpdate(payload, args.characterId, updates);
const output = JSON.stringify(next, null, 2);
if (args.writePath) await fs.writeFile(args.writePath, `${output}\n`, "utf8");
else console.log(output);

function applyCharacterUpdate(payload, characterId, updates) {
  validatePayload(payload);
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw new Error("updates 必须是对象。");
  const unknown = Object.keys(updates).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length > 0) throw new Error(`不允许修改字段：${unknown.join(", ")}`);
  if (Object.hasOwn(updates, "name")) throw new Error("禁止修改角色 name。");

  const next = JSON.parse(JSON.stringify(payload));
  const character = next.characters.find((item) => item.id === characterId);
  if (!character) throw new Error(`角色不存在：${characterId}`);

  if (updates.current_location_id && !next.locations.some((location) => location.id === updates.current_location_id)) {
    throw new Error(`目标地点不存在：${updates.current_location_id}`);
  }
  if (updates.visibility && !["met", "heard", "hidden"].includes(updates.visibility)) {
    throw new Error("visibility 只能是 met、heard 或 hidden。");
  }

  for (const [key, value] of Object.entries(updates)) {
    if (ARRAY_FIELDS.has(key)) character[key] = normalizeArray(value, key);
    else if (key === "companion") character[key] = Boolean(value);
    else character[key] = typeof value === "string" ? value.trim() : value;
  }
  const now = new Date().toISOString();
  if (Object.hasOwn(updates, "player_notes")) character.player_notes_updated_at = now;
  if (Object.hasOwn(updates, "portrait_image_url")) character.portrait_updated_at = now;
  next.updated_at = now;
  validatePayload(next);
  return next;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("payload 必须是对象。");
  if (payload.schema_version !== 1) throw new Error("schema_version 必须是 1。");
  if (!payload.world || typeof payload.world !== "object") throw new Error("payload 缺少 world。");
  for (const field of ["characters", "locations", "factions", "timeline", "memories", "ai_logs", "threads", "suggested_actions"]) {
    if (!Array.isArray(payload[field])) throw new Error(`payload 缺少数组字段：${field}`);
  }
}

function normalizeArray(value, key) {
  if (!Array.isArray(value)) throw new Error(`${key} 必须是数组。`);
  return value.map((item) => String(item).trim()).filter(Boolean);
}

async function readUpdates(value) {
  const raw = value.startsWith("@") ? await fs.readFile(value.slice(1), "utf8") : value;
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const parsed = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--write") parsed.writePath = argv[++index];
    else positional.push(value);
  }
  parsed.payloadPath = positional[0];
  parsed.characterId = positional[1];
  parsed.updatesArg = positional[2];
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node public/skills/modify-character-data/scripts/apply_character_update.mjs <payload.json> <character-id> <updates-json|@file> [--write output.json]

Example:
  node public/skills/modify-character-data/scripts/apply_character_update.mjs state/payload.json char_001 '{"player_notes":"需要跟进旧档案。"}' --write state/payload.next.json
`);
}

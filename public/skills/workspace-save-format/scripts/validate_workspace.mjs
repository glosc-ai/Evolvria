#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const REQUIRED_ARRAY_FIELDS = ["characters", "locations", "factions", "timeline", "memories", "ai_logs", "threads", "suggested_actions"];
const target = process.argv[2];

if (!target || target === "--help" || target === "-h") {
  console.log("Usage: node public/skills/workspace-save-format/scripts/validate_workspace.mjs <workspace-dir|workspace-bundle.json>");
  process.exit(target ? 0 : 1);
}

const files = await loadWorkspaceFiles(target);
const result = validateWorkspace(files);
console.log(JSON.stringify(result, null, 2));
if (result.errors.length > 0) process.exitCode = 1;

async function loadWorkspaceFiles(inputPath) {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute);
  if (stat.isDirectory()) {
    const entries = [];
    await walk(absolute, entries);
    return new Map(await Promise.all(entries.map(async (relativePath) => [relativePath, await fs.readFile(path.join(absolute, relativePath), "utf8")])));
  }
  const json = JSON.parse(await fs.readFile(absolute, "utf8"));
  if (Array.isArray(json.files)) {
    return new Map(json.files.map((file) => [file.path, String(file.content ?? "")]));
  }
  throw new Error("输入 JSON 不是 workspace bundle：缺少 files 数组。");
}

async function walk(root, output, base = root) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const relative = path.relative(base, absolute).replaceAll(path.sep, "/");
    if (entry.isDirectory()) await walk(absolute, output, base);
    else if (entry.isFile() && !isBinaryPath(relative)) output.push(relative);
  }
}

function validateWorkspace(files) {
  const errors = [];
  const warnings = [];
  requireFile(files, "AGENTS.md", errors);
  requireFile(files, "manifest.json", errors);
  requireFile(files, "state/payload.json", errors);

  const manifest = parseJson(files.get("manifest.json"), "manifest.json", errors);
  const payload = parseJson(files.get("state/payload.json"), "state/payload.json", errors);

  if (manifest) {
    if (manifest.workspace_format !== "evolvria_workspace_v1") warnings.push("manifest.json 的 workspace_format 不是 evolvria_workspace_v1。");
    if (manifest.files?.instructions && manifest.files.instructions !== "AGENTS.md") errors.push("manifest.files.instructions 必须指向 AGENTS.md。");
    if (manifest.files?.payload && manifest.files.payload !== "state/payload.json") errors.push("manifest.files.payload 必须指向 state/payload.json。");
  }

  if (payload) {
    if (payload.schema_version !== 1) errors.push("state/payload.json 的 schema_version 必须是 1。");
    if (!payload.world || typeof payload.world !== "object") errors.push("payload 缺少 world 对象。");
    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (!Array.isArray(payload[field])) errors.push(`payload 缺少数组字段：${field}`);
    }
    for (const character of payload.characters ?? []) {
      const characterPath = `characters/${sanitize(character.id)}.md`;
      if (!files.has(characterPath)) warnings.push(`缺少角色派生文件：${characterPath}`);
    }
    for (const location of payload.locations ?? []) {
      const locationPath = `locations/${sanitize(location.id)}.md`;
      if (!files.has(locationPath)) warnings.push(`缺少地点派生文件：${locationPath}`);
    }
  }

  const agents = files.get("AGENTS.md") ?? "";
  if (agents && !agents.includes("state/payload.json")) warnings.push("AGENTS.md 未提到 state/payload.json。");

  return {
    status: errors.length === 0 ? "ok" : "error",
    file_count: files.size,
    world_id: payload?.world?.id ?? null,
    errors,
    warnings,
  };
}

function requireFile(files, relativePath, errors) {
  if (!files.has(relativePath)) errors.push(`缺少文件：${relativePath}`);
}

function parseJson(raw, label, errors) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${label} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function isBinaryPath(relativePath) {
  return !/\.(md|markdown|json|txt|csv|ya?ml)$/i.test(relativePath) && path.basename(relativePath) !== "AGENTS.md";
}

function sanitize(value) {
  const safe = String(value || "item").replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe.replace(/_/g, "").length ? safe : "item";
}

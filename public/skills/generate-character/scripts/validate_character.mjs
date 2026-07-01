#!/usr/bin/env node
import fs from "node:fs/promises";

const inputPath = process.argv[2];

if (inputPath === "--help" || inputPath === "-h") {
  console.log("Usage: node public/skills/generate-character/scripts/validate_character.mjs [character.json]\nIf no file is provided, JSON is read from stdin.");
  process.exit(0);
}

const raw = inputPath ? await fs.readFile(inputPath, "utf8") : await readStdin();
const character = JSON.parse(raw);
const result = validateCharacter(character);
console.log(JSON.stringify(result, null, 2));
if (result.errors.length > 0) process.exitCode = 1;

function validateCharacter(character) {
  const errors = [];
  const warnings = [];
  if (!character || typeof character !== "object" || Array.isArray(character)) errors.push("Character 必须是对象。");
  for (const field of ["id", "name", "role", "description", "current_location_id", "status"]) {
    if (typeof character?.[field] !== "string" || !character[field].trim()) errors.push(`${field} 必须是非空字符串。`);
  }
  for (const field of ["personality", "goals", "secrets", "traits"]) {
    if (!Array.isArray(character?.[field])) errors.push(`${field} 必须是数组。`);
  }
  if (!character?.relationships || typeof character.relationships !== "object" || Array.isArray(character.relationships)) errors.push("relationships 必须是对象。");
  if (character?.visibility && !["met", "heard", "hidden"].includes(character.visibility)) errors.push("visibility 只能是 met、heard 或 hidden。");
  if (!character?.appearance_description) warnings.push("建议提供 appearance_description，方便后续角色形象生成。");
  if (character?.name && character.name === "主角" && character.id !== "char_hero") warnings.push("非主角角色不建议使用默认姓名“主角”。");
  return {
    status: errors.length === 0 ? "ok" : "error",
    errors,
    warnings,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

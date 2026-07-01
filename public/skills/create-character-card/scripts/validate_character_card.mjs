#!/usr/bin/env node
import fs from "node:fs/promises";

const inputPath = process.argv[2];

if (inputPath === "--help" || inputPath === "-h") {
  console.log("Usage: node public/skills/create-character-card/scripts/validate_character_card.mjs [card.json]\nIf no file is provided, JSON is read from stdin.");
  process.exit(0);
}

const raw = inputPath ? await fs.readFile(inputPath, "utf8") : await readStdin();
const card = JSON.parse(raw);
const result = validateCard(card);
console.log(JSON.stringify(result, null, 2));
if (result.errors.length > 0) process.exitCode = 1;

function validateCard(card) {
  const errors = [];
  const warnings = [];
  if (!card || typeof card !== "object" || Array.isArray(card)) errors.push("角色卡必须是对象。");
  const appearance = requireString(card?.appearance_description, "appearance_description", errors);
  const prompt = requireString(card?.portrait_prompt, "portrait_prompt", errors);
  if (!Array.isArray(card?.card_notes)) errors.push("card_notes 必须是数组。");
  if (!Array.isArray(card?.warnings)) errors.push("warnings 必须是数组。");

  if (appearance) {
    if (appearance.length < 80 || appearance.length > 180) warnings.push(`appearance_description 建议 80-180 字，当前 ${appearance.length} 字。`);
    for (const forbidden of ["AI", "prompt", "生成", "模型", "图片", "立绘"]) {
      if (appearance.includes(forbidden)) errors.push(`appearance_description 不应包含实现词：${forbidden}`);
    }
    if (/可能|或许|大概/.test(appearance)) warnings.push("appearance_description 含不确定表述，建议改为稳定可见特征。");
  }
  if (prompt) {
    for (const required of ["半身", "面部", "水印", "文字"]) {
      if (!prompt.includes(required)) warnings.push(`portrait_prompt 建议包含：${required}`);
    }
  }

  return {
    status: errors.length === 0 ? "ok" : "error",
    errors,
    warnings,
  };
}

function requireString(value, key, errors) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${key} 必须是非空字符串。`);
    return "";
  }
  return value.trim();
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

import { precheckContent } from "@/domain/moderation";
import type { Character, MediaAsset, Scenario, Storyline } from "@/types/domain";

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export function validateStorylinePackage(input: {
  storyline: Storyline;
  characters: Character[];
  scenarios: Scenario[];
  mediaAssets: MediaAsset[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { storyline, characters, scenarios, mediaAssets } = input;

  if (storyline.title.trim().length < 2 || storyline.title.trim().length > 80) {
    issues.push({ field: "title", severity: "error", message: "标题需为 2 到 80 字。" });
  }
  if (storyline.summary.trim().length < 30 || storyline.summary.trim().length > 240) {
    issues.push({ field: "summary", severity: "error", message: "简介需为 30 到 240 字，便于探索页展示。" });
  }
  if (!storyline.worldRules.length || storyline.worldRules.some((rule) => !rule.trim())) {
    issues.push({ field: "worldRules", severity: "error", message: "至少需要一条明确世界规则。" });
  }
  if (!scenarios.length) {
    issues.push({ field: "scenarios", severity: "error", message: "至少需要一个可启动场景。" });
  }
  if (!characters.length && !storyline.tags.includes("纯旁白")) {
    issues.push({ field: "cast", severity: "error", message: "至少需要一个角色，除非明确标记纯旁白故事。" });
  }
  if (storyline.rating === "SFW" && storyline.tags.some((tag) => /adult|18\+|成人/i.test(tag))) {
    issues.push({ field: "rating", severity: "error", message: "成人相关标签不能标记为 SFW。" });
  }
  for (const issue of validateTextSafety("storyline", [
    storyline.title,
    storyline.tagline,
    storyline.summary,
    storyline.premise,
    storyline.playerRole,
    storyline.worldRules.join("\n"),
    storyline.tags.join("\n"),
  ], storyline.rating === "AdultLocked")) {
    issues.push(issue);
  }
  for (const character of characters) {
    if (!character.profile.trim() || character.profile.length < 20) {
      issues.push({ field: `character:${character.id}`, severity: "warning", message: `${character.name} 的档案过短。` });
    }
    if (!character.voice.tone.trim()) {
      issues.push({ field: `voice:${character.id}`, severity: "error", message: `${character.name} 缺少语音语气。` });
    }
    for (const issue of validateTextSafety(`character:${character.id}`, [
      character.name,
      character.subtitle ?? "",
      character.summary,
      character.profile,
      character.voice.tone,
      character.goals.join("\n"),
      character.boundaries.join("\n"),
      character.tags.join("\n"),
    ], storyline.rating === "AdultLocked")) {
      issues.push(issue);
    }
  }
  for (const scenario of scenarios) {
    for (const issue of validateTextSafety(`scenario:${scenario.id}`, [
      scenario.title,
      scenario.summary,
      scenario.opening,
      scenario.location ?? "",
    ], storyline.rating === "AdultLocked")) {
      issues.push(issue);
    }
  }
  for (const assetId of storyline.mediaIds) {
    const asset = mediaAssets.find((item) => item.id === assetId);
    if (!asset) {
      issues.push({ field: `media:${assetId}`, severity: "error", message: "故事线引用了不存在的媒体资产。" });
    } else {
      if (!asset.altText.trim()) {
        issues.push({ field: `media:${assetId}`, severity: "error", message: `${asset.id} 缺少替代文本。` });
      }
      if (!asset.source.label.trim()) {
        issues.push({ field: `media:${assetId}`, severity: "error", message: `${asset.altText || asset.id} 缺少素材来源。` });
      }
      if (asset.license.kind === "unknown") {
        issues.push({ field: `media:${assetId}`, severity: "error", message: `${asset.altText || asset.id} 缺少明确版权许可。` });
      }
    }
  }

  return issues;
}

export function canMarkLocalReady(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}

function validateTextSafety(field: string, parts: string[], adultUnlocked: boolean): ValidationIssue[] {
  const flags = precheckContent(parts.filter(Boolean).join("\n"), adultUnlocked);
  const issues: ValidationIssue[] = [];
  if (flags.includes("copyright")) {
    issues.push({ field, severity: "error", message: "内容包含版权或竞品引用风险，不能进入本地就绪。" });
  }
  if (flags.includes("blocked")) {
    issues.push({ field, severity: "error", message: "内容包含当前分级不允许的成人锁定风险。" });
  }
  if (flags.includes("adult_locked") && !adultUnlocked) {
    issues.push({ field, severity: "error", message: "成人相关内容必须标记为 AdultLocked。" });
  }
  if (flags.includes("violence") && adultUnlocked) {
    issues.push({ field, severity: "warning", message: "内容包含高强度风险词，请确认分级和边界。" });
  }
  return issues;
}

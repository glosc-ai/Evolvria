import { createId, nowIso } from "@/domain/ids";
import type { ConsequenceRule, DungeonMindConfig, FateCheck } from "@/types/domain";

export interface FateRoll {
  seed: string;
  die: number;
  modifier: number;
  total: number;
  outcome: "critical_success" | "success" | "partial" | "failure" | "critical_failure";
}

export function rollD20(seed: string, difficulty = 12, modifier = 0): FateRoll {
  const die = rollTotal(seed, 20, 1);
  return evaluateRoll(seed, die, difficulty, modifier, { criticalSuccess: 20, criticalFailure: 1, margin: 5 });
}

export function rollConfiguredDice(seed: string, dice: DungeonMindConfig["dice"], difficulty = 12, modifier = 0): FateRoll {
  if (dice === "2d6") {
    const die = rollTotal(`${seed}:2d6`, 6, 2);
    return evaluateRoll(seed, die, difficulty, modifier, { criticalSuccess: 12, criticalFailure: 2, margin: 3 });
  }
  if (dice === "percentile") {
    const die = rollTotal(`${seed}:percentile`, 100, 1);
    return evaluateRoll(seed, die, difficulty, modifier, { criticalSuccess: 95, criticalFailure: 5, margin: 15 });
  }
  return rollD20(seed, difficulty, modifier);
}

function rollTotal(seed: string, sides: number, count: number): number {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const hash = [...`${seed}:${index}`].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 9973, 7);
    total += (hash % sides) + 1;
  }
  return total;
}

function evaluateRoll(
  seed: string,
  die: number,
  difficulty: number,
  modifier: number,
  thresholds: { criticalSuccess: number; criticalFailure: number; margin: number },
): FateRoll {
  const total = die + modifier;
  const outcome =
    die >= thresholds.criticalSuccess ? "critical_success" :
    die <= thresholds.criticalFailure ? "critical_failure" :
    total >= difficulty + thresholds.margin ? "success" :
    total >= difficulty ? "partial" :
    total >= difficulty - thresholds.margin ? "failure" :
    "critical_failure";
  return { seed, die, modifier, total, outcome };
}

export function runFateCheck(input: {
  chatId: string;
  actorId: string;
  intent: string;
  config: DungeonMindConfig;
  difficulty?: number;
  modifier?: number;
  seed?: string;
}): FateCheck {
  const attribute = input.config.attributes[0]?.id ?? "attr_default";
  const skill = input.config.skills[0]?.id;
  const difficulty = input.difficulty ?? input.config.difficultyTable[1]?.target ?? 12;
  const seed = input.seed ?? `${input.chatId}:${input.intent}:${Date.now()}`;
  const roll = rollConfiguredDice(seed, input.config.dice, difficulty, input.modifier ?? 0);
  return {
    id: createId("fate"),
    chatId: input.chatId,
    actorId: input.actorId,
    intent: input.intent,
    attribute,
    skill,
    difficulty,
    roll: {
      seed: roll.seed,
      die: roll.die,
      modifier: roll.modifier,
      total: roll.total,
    },
    outcome: roll.outcome,
    consequences: consequencesFor(roll.outcome, input.config.consequenceRules),
    visibility: input.config.visibility,
    createdAt: nowIso(),
  };
}

export function fateCheckToText(check: FateCheck): string {
  const visibleRoll = check.visibility === "full"
    ? `掷骰 ${check.roll.die} + ${check.roll.modifier} = ${check.roll.total}，难度 ${check.difficulty}。`
    : check.visibility === "summary"
      ? `裁定结果：${outcomeLabel(check.outcome)}。`
      : "命运在幕后完成裁定。";
  return [
    `Fate Check: ${check.intent}`,
    visibleRoll,
    `后果：${check.consequences.join("；")}`,
  ].join("\n");
}

function consequencesFor(outcome: FateRoll["outcome"], rules: ConsequenceRule[]): string[] {
  const base = consequenceFor(outcome);
  if (outcome === "critical_success" || !rules.length) return base;
  const rule = rules[0];
  return [...base, `${rule.label}：${rule.description}`];
}

function consequenceFor(outcome: FateRoll["outcome"]): string[] {
  switch (outcome) {
    case "critical_success":
      return ["目标达成，并额外获得一条优势线索。"];
    case "success":
      return ["目标达成，但仍留下轻微代价。"];
    case "partial":
      return ["目标部分达成，危机时钟推进一格。"];
    case "failure":
      return ["目标未达成，局势变得更危险。"];
    case "critical_failure":
      return ["目标失败，并触发一个新的并发麻烦。"];
  }
}

function outcomeLabel(outcome: FateRoll["outcome"]): string {
  return {
    critical_success: "大成功",
    success: "成功",
    partial: "部分成功",
    failure: "失败",
    critical_failure: "大失败",
  }[outcome];
}

import type { BudgetSettings, CostEstimate, Message } from "@/types/domain";

export interface BudgetCheck {
  ok: boolean;
  reasons: string[];
}

export interface ContextCompactionPlan {
  messages: Message[];
  droppedMessages: Message[];
  estimate: CostEstimate;
  compacted: boolean;
}

export function estimateTokens(text: string): number {
  const latinWords = text.trim().split(/\s+/).filter(Boolean).length;
  const cjkChars = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  return Math.max(1, Math.ceil(latinWords * 1.25 + cjkChars * 0.65));
}

export function estimateTurnCost(messages: Message[], userInput: string, outputTokens = 380): CostEstimate {
  const recentText = messages.slice(-24).map((message) => message.content).join("\n");
  const inputTokens = estimateTokens(`${recentText}\n${userInput}`);
  const estimatedCost = Number(((inputTokens + outputTokens) * 0.000002).toFixed(6));
  return {
    inputTokens,
    outputTokens,
    estimatedCost,
    currency: "local_estimate",
  };
}

export function checkBudget(estimate: CostEstimate, budget: BudgetSettings): BudgetCheck {
  const reasons: string[] = [];
  if (estimate.inputTokens > budget.maxInputTokens) {
    reasons.push(`输入上下文 ${estimate.inputTokens} tokens 超过上限 ${budget.maxInputTokens}。`);
  }
  if (estimate.outputTokens > budget.maxOutputTokens) {
    reasons.push(`预计输出 ${estimate.outputTokens} tokens 超过上限 ${budget.maxOutputTokens}。`);
  }
  if (estimate.estimatedCost > budget.maxEstimatedCostPerTurn) {
    reasons.push(`预计成本 ${estimate.estimatedCost.toFixed(6)} 超过单轮上限 ${budget.maxEstimatedCostPerTurn.toFixed(6)}。`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function isRecoverableInputOverflow(check: BudgetCheck): boolean {
  return !check.ok
    && check.reasons.some((reason) => reason.startsWith("输入上下文 "))
    && check.reasons.every((reason) => reason.startsWith("输入上下文 "));
}

export function compactMessagesForBudget(
  messages: Message[],
  userInput: string,
  budget: BudgetSettings,
  outputTokens = budget.maxOutputTokens,
): ContextCompactionPlan {
  const fullEstimate = estimateTurnCost(messages, userInput, outputTokens);
  if (fullEstimate.inputTokens <= budget.maxInputTokens) {
    return { messages, droppedMessages: [], estimate: fullEstimate, compacted: false };
  }

  const minRecent = Math.min(messages.length, 6);
  for (let count = Math.min(messages.length, 24); count >= minRecent; count -= 1) {
    const selected = messages.slice(-count);
    const estimate = estimateTurnCost(selected, userInput, outputTokens);
    if (estimate.inputTokens <= budget.maxInputTokens) {
      return {
        messages: selected,
        droppedMessages: messages.slice(0, messages.length - count),
        estimate,
        compacted: true,
      };
    }
  }

  const selected = messages.slice(-minRecent);
  return {
    messages: selected,
    droppedMessages: messages.slice(0, messages.length - minRecent),
    estimate: estimateTurnCost(selected, userInput, outputTokens),
    compacted: true,
  };
}

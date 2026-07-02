import { AI_MODEL_IDS, type AIModelRole } from "@/domain/ai-routing";

export type BuiltInAISkillId =
  | "evolvria-narrative-turn"
  | "evolvria-content-safety"
  | "evolvria-image-generation"
  | "evolvria-video-generation"
  | "evolvria-voice-generation"
  | "evolvria-summary-arc";

export interface BuiltInAISkill {
  id: BuiltInAISkillId;
  displayName: string;
  description: string;
  modelRole: AIModelRole | "summary";
  model: string;
  path: string;
  invocationMode: "prompt-layer" | "media-job" | "future-upload-skill";
  promptContract: string;
}

export const BUILT_IN_AI_SKILLS: BuiltInAISkill[] = [
  {
    id: "evolvria-narrative-turn",
    displayName: "Evolvria Narrative Turn",
    description: "推进聊天和视觉小说场景，保持世界、角色、Persona、Arc 与安全边界一致。",
    modelRole: "narrative",
    model: AI_MODEL_IDS.narrative,
    path: "/skills/evolvria-narrative-turn/SKILL.md",
    invocationMode: "prompt-layer",
    promptContract: "Return JSON messages first; include scene hints, relationship deltas, and safe fallback text.",
  },
  {
    id: "evolvria-content-safety",
    displayName: "Evolvria Content Safety",
    description: "审核故事、角色、媒体提示词和导入包，输出分级、风险与修改建议。",
    modelRole: "content",
    model: AI_MODEL_IDS.content,
    path: "/skills/evolvria-content-safety/SKILL.md",
    invocationMode: "prompt-layer",
    promptContract: "Return moderation status, rating proposal, safety flags, and actionable revisions.",
  },
  {
    id: "evolvria-image-generation",
    displayName: "Evolvria Image Generation",
    description: "把 SceneHint 和故事设定压缩为原创、安全、可审计的图片生成提示词。",
    modelRole: "image",
    model: AI_MODEL_IDS.image,
    path: "/skills/evolvria-image-generation/SKILL.md",
    invocationMode: "media-job",
    promptContract: "Return a concise image prompt, negative constraints, aspect ratio, license note, and safety flags.",
  },
  {
    id: "evolvria-video-generation",
    displayName: "Evolvria Video Generation",
    description: "把静态场景扩展为短视频提示词，限定镜头、动作、时长和版权边界。",
    modelRole: "video",
    model: AI_MODEL_IDS.video,
    path: "/skills/evolvria-video-generation/SKILL.md",
    invocationMode: "media-job",
    promptContract: "Return a short video prompt with duration, camera motion, frame constraints, and safety flags.",
  },
  {
    id: "evolvria-voice-generation",
    displayName: "Evolvria 中文语音生成",
    description: "把角色台词转为 TTS 指令，保留语气节奏但禁止模仿真人或未授权声音。",
    modelRole: "voice",
    model: AI_MODEL_IDS.voice,
    path: "/skills/evolvria-voice-generation/SKILL.md",
    invocationMode: "media-job",
    promptContract: "返回中文 TTS 文本、中文语音指令、zh-CN 语言标记、语速建议和授权说明。",
  },
  {
    id: "evolvria-summary-arc",
    displayName: "Evolvria Summary Arc",
    description: "把长聊天压缩为事实摘要、关系变化、未解线索和下一段 Arc 节拍。",
    modelRole: "summary",
    model: AI_MODEL_IDS.content,
    path: "/skills/evolvria-summary-arc/SKILL.md",
    invocationMode: "prompt-layer",
    promptContract: "Return summary, durable facts, relationship deltas, unresolved threads, and arc beat updates.",
  },
];

export function getBuiltInSkill(id: BuiltInAISkillId): BuiltInAISkill {
  const skill = BUILT_IN_AI_SKILLS.find((item) => item.id === id);
  if (!skill) throw new Error(`unknown_ai_skill:${id}`);
  return skill;
}

export function skillForModelRole(role: AIModelRole | "summary"): BuiltInAISkill {
  const skill = BUILT_IN_AI_SKILLS.find((item) => item.modelRole === role);
  if (!skill) throw new Error(`unknown_ai_skill_role:${role}`);
  return skill;
}

export function buildSkillPromptBlock(id: BuiltInAISkillId): string {
  const skill = getBuiltInSkill(id);
  return [
    `Skill: ${skill.id}`,
    `Display: ${skill.displayName}`,
    `Model: ${skill.model}`,
    `Mode: ${skill.invocationMode}`,
    `Purpose: ${skill.description}`,
    `Contract: ${skill.promptContract}`,
    "Follow this project skill as a local instruction bundle. Do not claim it was uploaded to the provider unless an explicit providerReference is present.",
  ].join("\n");
}

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
    displayName: "Evolvria 叙事回合",
    description: "推进聊天和视觉小说场景，保持世界、角色、玩家档案、剧情弧与安全边界一致。",
    modelRole: "narrative",
    model: AI_MODEL_IDS.narrative,
    path: "/skills/evolvria-narrative-turn/SKILL.md",
    invocationMode: "prompt-layer",
    promptContract: "优先返回 JSON messages；包含场景提示、关系变化和安全兜底文本。",
  },
  {
    id: "evolvria-content-safety",
    displayName: "Evolvria 内容安全",
    description: "审核故事、角色、媒体提示词和导入包，输出分级、风险与修改建议。",
    modelRole: "content",
    model: AI_MODEL_IDS.content,
    path: "/skills/evolvria-content-safety/SKILL.md",
    invocationMode: "prompt-layer",
    promptContract: "返回审核状态、分级建议、安全标记和可执行修改建议。",
  },
  {
    id: "evolvria-image-generation",
    displayName: "Evolvria 图片生成",
    description: "把 SceneHint 和故事设定压缩为原创、安全、可审计的图片生成提示词。",
    modelRole: "image",
    model: AI_MODEL_IDS.image,
    path: "/skills/evolvria-image-generation/SKILL.md",
    invocationMode: "media-job",
    promptContract: "返回简洁图片提示词、负向约束、画幅比例、授权说明和安全标记。",
  },
  {
    id: "evolvria-video-generation",
    displayName: "Evolvria 视频生成",
    description: "把静态场景扩展为短视频提示词，限定镜头、动作、时长和版权边界。",
    modelRole: "video",
    model: AI_MODEL_IDS.video,
    path: "/skills/evolvria-video-generation/SKILL.md",
    invocationMode: "media-job",
    promptContract: "返回短视频提示词，包含时长、镜头运动、画面约束和安全标记。",
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
    displayName: "Evolvria 摘要剧情弧",
    description: "把长聊天压缩为事实摘要、关系变化、未解线索和下一段剧情弧节拍。",
    modelRole: "summary",
    model: AI_MODEL_IDS.content,
    path: "/skills/evolvria-summary-arc/SKILL.md",
    invocationMode: "prompt-layer",
    promptContract: "返回摘要、稳定事实、关系变化、未解线索和剧情弧节拍更新。",
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
    "将此项目 skill 作为本地指令包执行。除非存在明确的 providerReference，否则不要声称它已上传到提供方。",
  ].join("\n");
}

import type { MediaAsset, MediaGenerationKind, MediaGenerationStatus, MessageMode, MessageRole, PlayMode } from "@/types/domain";

const playModeLabels: Record<PlayMode, string> = {
  chat: "聊天",
  scene: "场景",
  fate: "裁定",
  voice: "语音",
  image: "图片",
  video: "视频",
};

const messageModeLabels: Record<MessageMode, string> = {
  say: "说话",
  act: "行动",
  ask: "询问",
  ooc: "旁白外",
};

const messageRoleLabels: Record<MessageRole, string> = {
  system: "系统",
  user: "玩家",
  assistant: "角色",
  narrator: "旁白",
  fate: "裁定",
  tool: "工具",
};

const mediaKindLabels: Record<MediaAsset["kind"], string> = {
  image: "图片",
  audio: "音频",
  video: "视频",
  document: "文档",
};

const mediaPurposeLabels: Record<MediaAsset["purpose"], string> = {
  cover: "封面",
  avatar: "头像",
  background: "背景",
  sprite: "立绘",
  voice: "语音",
  reference: "参考",
};

const generationKindLabels: Record<MediaGenerationKind, string> = {
  voice: "语音",
  image: "图片",
  video: "视频",
};

const generationStatusLabels: Record<MediaGenerationStatus, string> = {
  queued: "排队中",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
  blocked: "已拦截",
};

const commonLabels: Record<string, string> = {
  all: "全部",
  storyline: "故事线",
  character: "角色",
  scenario: "场景",
  media: "媒体",
  chat: "聊天",
  mock: "模拟",
  "openai-compatible": "OpenAI 兼容",
  "local-http": "本地 HTTP",
  original: "原创",
  generated: "生成",
  imported: "导入",
  placeholder: "占位",
  owned: "自有",
  cc0: "CC0",
  licensed: "已授权",
  public: "公开",
  private: "私有",
  unlisted: "未列出",
  adult: "成人",
  minor: "未成年",
  draft: "草稿",
  local_ready: "本地就绪",
  submitted: "已提交",
  approved: "已通过",
  published: "已发布",
  needs_changes: "需修改",
  rejected: "已拒绝",
  appealed: "申诉中",
  dismissed: "已忽略",
  actioned: "已处理",
  open: "开放",
  done: "完成",
  skipped: "跳过",
  planned: "计划中",
  active: "进行中",
  resolved: "已解决",
  abandoned: "已放弃",
  archived: "已归档",
  error: "错误",
  pending: "待处理",
  frozen: "冻结",
  released: "已释放",
  refunded: "已退款",
  reversed: "已冲正",
  estimated: "预估",
  available: "可用",
  withheld: "暂扣",
  paid: "已支付",
  requested: "已申请",
  blocked: "已拦截",
  local_only: "仅本地",
  ready: "就绪",
  syncing: "同步中",
  conflict: "冲突",
  queued: "排队中",
  pushed: "已推送",
  acked: "已确认",
  conflicted: "有冲突",
  failed: "失败",
  create: "创建",
  update: "更新",
  delete: "删除",
  approve: "通过",
  pay: "支付",
  reject: "拒绝",
  block: "拦截",
  refund: "退款",
  reversal: "冲正",
  freeze: "冻结",
  release: "释放",
  sync: "同步",
  publish: "发布",
  billing: "账单",
  adult_content: "成人内容",
  manual_review_required: "需要人工复核",
  withheld_for_review: "复核暂扣",
  critical_success: "大成功",
  success: "成功",
  partial: "部分成功",
  failure: "失败",
  critical_failure: "大失败",
  copied: "已复制",
  resolved_local: "已用本地解决",
  resolved_remote: "已用云端解决",
  upheld: "已维持",
  denied: "已驳回",
  unknown: "未知",
  none: "无",
  mature_theme: "成熟主题",
  adult_locked: "成人锁定",
  violence: "暴力",
  copyright: "版权风险",
  hidden: "隐藏",
  summary: "摘要",
  full: "完整",
  AdultLocked: "成人锁定",
};

export function labelFor(value: string | undefined): string {
  if (!value) return "未知";
  return commonLabels[value] ?? value;
}

export function playModeLabel(mode: PlayMode): string {
  return playModeLabels[mode];
}

export function messageModeLabel(mode: MessageMode): string {
  return messageModeLabels[mode];
}

export function messageRoleLabel(role: MessageRole): string {
  return messageRoleLabels[role];
}

export function mediaKindLabel(kind: MediaAsset["kind"]): string {
  return mediaKindLabels[kind];
}

export function mediaPurposeLabel(purpose: MediaAsset["purpose"]): string {
  return mediaPurposeLabels[purpose];
}

export function generationKindLabel(kind: MediaGenerationKind): string {
  return generationKindLabels[kind];
}

export function generationStatusLabel(status: MediaGenerationStatus): string {
  return generationStatusLabels[status];
}

export function countLabel(count: number, unit: string): string {
  return `${count} ${unit}`;
}

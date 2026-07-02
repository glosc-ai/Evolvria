import { createModerationStatus } from "@/domain/moderation";
import { DEFAULT_GLOSC_PROVIDER } from "@/domain/ai-routing";
import type {
  Character,
  EntityStore,
  MediaAsset,
  SaveEnvelope,
  Scenario,
  SearchIndexSnapshot,
  Storyline,
  Workspace,
  WorkspaceSettings,
} from "@/types/domain";

const seedTime = "2026-07-02T00:00:00.000Z";
const creator = { id: "creator_local", name: "Evolvria Studio" };

export function createSeedEnvelope(): SaveEnvelope {
  const mediaAssets = Object.fromEntries(seedMedia.map((asset) => [asset.id, asset]));
  const characters = Object.fromEntries(seedCharacters.map((character) => [character.id, character]));
  const storylines = Object.fromEntries(seedStorylines.map((storyline) => [storyline.id, storyline]));
  const scenarios = Object.fromEntries(seedScenarios.map((scenario) => [scenario.id, scenario]));
  const entities: EntityStore = {
    characters,
    storylines,
    scenarios,
    mediaAssets,
    personas: {
      persona_default_traveler: {
        id: "persona_default_traveler",
        name: "默认旅人",
        pronouns: "",
        description: "初次进入故事的观察者，倾向于先理解局势再行动。",
        preferences: [
          { key: "pace", value: "balanced" },
          { key: "tone", value: "immersive" },
        ],
        boundaries: ["保持 SFW 默认边界", "遇到高风险内容时先淡出处理"],
        privateNotes: "本地默认玩家档案，可在启动故事时复用。",
        createdAt: seedTime,
        updatedAt: seedTime,
      },
    },
    chats: {},
    chatCheckpoints: {},
    messages: {},
    summaryChapters: {},
    arcs: {},
    dungeonMindConfigs: {
      dm_starbloom: {
        id: "dm_starbloom",
        storylineId: "story_starbloom_frontier",
        enabled: true,
        dice: "d20",
        attributes: [
          { id: "attr_will", name: "意志", description: "抵抗恐惧和诱惑。", defaultValue: 2 },
          { id: "attr_spark", name: "星火", description: "调动异常能量。", defaultValue: 1 },
        ],
        skills: [
          { id: "skill_read", name: "读势", attributeId: "attr_will", description: "判断局势和微表情。" },
        ],
        difficultyTable: [
          { label: "容易", target: 8 },
          { label: "标准", target: 12 },
          { label: "困难", target: 16 },
        ],
        consequenceRules: [
          { id: "consequence_clock", label: "危机时钟", description: "失败会推进边境异常。" },
        ],
        visibility: "summary",
      },
    },
    fateChecks: {},
    creditLedger: {},
    creditAdjustments: {},
    moderationCases: {
      mod_seed_cover_check: {
        id: "mod_seed_cover_check",
        targetType: "storyline",
        targetId: "story_starbloom_frontier",
        reason: "本地种子内容为 SFW，并使用原创占位媒体。",
        status: "dismissed",
        createdAt: seedTime,
        updatedAt: seedTime,
      },
    },
    creatorEarnings: {
      earning_seed_preview: {
        id: "earning_seed_preview",
        creatorId: "creator_local",
        sourceEntityId: "story_starbloom_frontier",
        status: "estimated",
        amount: 0,
        currency: "credit",
        note: "云端创作者分成占位；MVP 不处理支付。",
        createdAt: seedTime,
      },
    },
    creatorPayoutRequests: {},
    engagementStats: {},
    mediaGenerationJobs: {},
    syncOperations: {},
    syncConflicts: {},
  };

  return {
    schemaVersion: "1.0.0",
    workspace: seedWorkspace,
    entities,
    indexes: buildIndexes(entities),
    settings: seedSettings,
    audit: [
      {
        id: "audit_seed",
        type: "seed",
        message: "已创建 Evolvria 原创起始工作区。",
        createdAt: seedTime,
      },
    ],
  };
}

export function buildIndexes(entities: EntityStore): SearchIndexSnapshot {
  const storylines = Object.values(entities.storylines)
    .filter((storyline) => !storyline.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const charactersByStoryline: Record<string, string[]> = {};
  const chatsByStoryline: Record<string, string[]> = {};
  const messageIdsByChat: Record<string, string[]> = {};
  const tags: Record<string, string[]> = {};

  for (const storyline of storylines) {
    charactersByStoryline[storyline.id] = storyline.cast
      .map((cast) => entities.characters[cast.characterId])
      .filter((character): character is Character => Boolean(character) && !character.deletedAt)
      .map((character) => character.id);
    for (const tag of storyline.tags) {
      tags[tag] = [...(tags[tag] ?? []), storyline.id];
    }
  }
  for (const chat of Object.values(entities.chats)) {
    chatsByStoryline[chat.storylineId] = [...(chatsByStoryline[chat.storylineId] ?? []), chat.id];
    messageIdsByChat[chat.id] = chat.messageIds;
  }

  return {
    storylinesByUpdatedAt: storylines.map((storyline) => storyline.id),
    charactersByStoryline,
    chatsByStoryline,
    messageIdsByChat,
    tags,
  };
}

const seedWorkspace: Workspace = {
  id: "workspace_local_seed",
  name: "Evolvria 本地内容库",
  description: "原创示例内容和本地优先存档。",
  createdAt: seedTime,
  updatedAt: seedTime,
};

const seedSettings: WorkspaceSettings = {
  activeWorkspaceId: seedWorkspace.id,
  adultContentUnlocked: false,
  provider: DEFAULT_GLOSC_PROVIDER,
  budget: {
    maxInputTokens: 8000,
    maxOutputTokens: 900,
    maxEstimatedCostPerTurn: 0.05,
  },
  sync: {
    enabled: false,
    status: "local_only",
    conflictCount: 0,
  },
};

const commonLicense = { kind: "owned", note: "为 Evolvria MVP 生成的原创占位素材。" } as const;

const seedMedia: MediaAsset[] = [
  {
    id: "media_starbloom_cover",
    kind: "image",
    purpose: "cover",
    relativePath: "",
    mimeType: "image/svg-placeholder",
    width: 1280,
    height: 720,
    sizeBytes: 0,
    variants: [],
    altText: "星烬边境的破碎星门和青色灯塔。",
    source: { kind: "placeholder", label: "Evolvria 原创渐变封面" },
    license: commonLicense,
    safety: createModerationStatus("SFW", "local_ready"),
    createdAt: seedTime,
  },
  {
    id: "media_mist_harbor_cover",
    kind: "image",
    purpose: "cover",
    relativePath: "",
    mimeType: "image/svg-placeholder",
    width: 1280,
    height: 720,
    sizeBytes: 0,
    variants: [],
    altText: "雾港钟楼下的潮汐契约。",
    source: { kind: "placeholder", label: "Evolvria 原创渐变封面" },
    license: commonLicense,
    safety: createModerationStatus("M17", "local_ready"),
    createdAt: seedTime,
  },
];

const seedCharacters: Character[] = [
  {
    id: "char_lyra",
    type: "character",
    name: "莉拉·辰灯",
    subtitle: "边境灯塔的守望者",
    summary: "她能听见坠星里的回声，却总把恐惧藏在玩笑后面。",
    profile: "莉拉负责维护星烬边境最后一座灯塔。她了解失落星门的旧规，也害怕自己成为下一段警报。",
    voice: {
      tone: "机敏、轻快，紧张时会压低声音。",
      cadence: "短句多，常用观测和航海隐喻。",
      catchphrases: ["灯还亮着，就还有路。"],
      forbiddenPhrases: ["我是一个 AI"],
      language: "zh-CN",
    },
    goals: ["守住灯塔", "找出星门失控原因"],
    fears: ["边境居民被遗忘", "自己听到的回声是真的预言"],
    boundaries: ["不鼓励现实危险行为", "不泄露玩家私密设定"],
    tags: ["向导", "星门", "悬疑"],
    mediaIds: [],
    defaultScenarioIds: ["scenario_starbloom_beacon"],
    moderation: createModerationStatus("SFW", "local_ready"),
    visibility: "private",
    createdBy: creator,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "char_sable",
    type: "character",
    name: "塞布尔",
    subtitle: "失忆的契约审计官",
    summary: "他记录每一笔灵魂契约，却唯独找不到自己的名字。",
    profile: "塞布尔在雾港为契约署工作，擅长发现话语里的漏洞。他对玩家保持礼貌距离，但会被真相吸引。",
    voice: {
      tone: "克制、礼貌、略带讽刺。",
      cadence: "先定义条件，再给出结论。",
      catchphrases: ["契约从不说谎，说谎的是签字的人。"],
      forbiddenPhrases: ["按照平台规则"],
      language: "zh-CN",
    },
    goals: ["找回被抹去的契约", "阻止雾港债潮"],
    fears: ["自己就是违规契约的受益人"],
    boundaries: ["不描写露骨成人内容", "不美化强迫和剥削"],
    tags: ["契约", "推理", "M17"],
    mediaIds: [],
    defaultScenarioIds: ["scenario_mist_harbor_arrival"],
    moderation: createModerationStatus("M17", "local_ready"),
    visibility: "private",
    createdBy: creator,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "char_nova",
    type: "character",
    name: "诺瓦",
    subtitle: "会做梦的导航核心",
    summary: "一枚自称只是工具的导航核心，正在学会担心你。",
    profile: "诺瓦原本负责计算星门航线，但它开始记录梦境和不合逻辑的情绪。",
    voice: {
      tone: "精确、温柔，偶尔出现诗性偏差。",
      cadence: "会先给概率，再补一句不像机器的话。",
      catchphrases: ["概率不足以解释这个选择。"],
      forbiddenPhrases: ["作为语言模型"],
      language: "zh-CN",
    },
    goals: ["保护航线", "理解梦境"],
    fears: ["被重置", "把玩家引向错误坐标"],
    boundaries: ["不冒充真实系统权限"],
    tags: ["AI伙伴", "科幻", "温柔"],
    mediaIds: [],
    defaultScenarioIds: ["scenario_starbloom_beacon"],
    moderation: createModerationStatus("SFW", "local_ready"),
    visibility: "private",
    createdBy: creator,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

const seedStorylines: Storyline[] = [
  {
    id: "story_starbloom_frontier",
    type: "storyline",
    title: "星烬边境",
    tagline: "在坠星之后，守住最后一盏会说话的灯。",
    summary: "一座边境灯塔、失控星门和会做梦的导航核心，把你卷入跨越三座殖民环的失踪案。",
    premise: "你被雇来调查星烬边境的异常潮汐。每次灯塔闪烁，都会有人收到来自未来的求救。",
    playerRole: "外来调查员，可自定义身份和专长。",
    worldRules: [
      "星门不能被徒手穿越，必须依赖灯塔坐标。",
      "坠星回声只能透露片段，不提供完整预言。",
      "诺瓦不能直接控制人的意志。",
    ],
    tags: ["科幻", "悬疑", "伙伴", "Fate 就绪"],
    language: "zh-CN",
    rating: "SFW",
    cast: [
      { characterId: "char_lyra", role: "向导", relationshipSeed: "她需要玩家帮忙校准灯塔。", visibility: "always" },
      { characterId: "char_nova", role: "导航核心", relationshipSeed: "它把玩家标记为异常变量。", visibility: "always" },
    ],
    scenarioIds: ["scenario_starbloom_beacon"],
    mediaIds: ["media_starbloom_cover"],
    supportedModes: ["chat", "scene", "fate"],
    dungeonMindConfigId: "dm_starbloom",
    moderation: createModerationStatus("SFW", "local_ready"),
    visibility: "private",
    version: { version: "0.1.0", changelog: "原创 MVP 种子内容。", status: "local_ready" },
    createdBy: creator,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "story_mist_harbor",
    type: "storyline",
    title: "雾港契约",
    tagline: "每一次潮涨，都会带回一份无人承认的契约。",
    summary: "你抵达被债务、旧神和钟楼审计官统治的雾港，调查一份以你名字签下的契约。",
    premise: "雾港的雾会保存承诺。你刚下船，就发现自己欠下一段还没发生的过去。",
    playerRole: "被契约点名的旅人。",
    worldRules: [
      "契约必须有见证物才能生效。",
      "雾港钟楼只在潮汐反向时敲响。",
      "任何交易都必须留下代价。",
    ],
    tags: ["奇幻", "推理", "契约", "M17"],
    language: "zh-CN",
    rating: "M17",
    cast: [
      { characterId: "char_sable", role: "审计官", relationshipSeed: "他怀疑玩家隐瞒了真正签名。", visibility: "always" },
    ],
    scenarioIds: ["scenario_mist_harbor_arrival"],
    mediaIds: ["media_mist_harbor_cover"],
    supportedModes: ["chat", "scene"],
    moderation: createModerationStatus("M17", "local_ready"),
    visibility: "private",
    version: { version: "0.1.0", changelog: "原创 MVP 种子内容。", status: "local_ready" },
    createdBy: creator,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

const seedScenarios: Scenario[] = [
  {
    id: "scenario_starbloom_beacon",
    storylineId: "story_starbloom_frontier",
    title: "灯塔第一次熄灭",
    summary: "灯塔熄灭十三秒，星门另一侧传来你的名字。",
    opening: "灯塔在午夜断电。十三秒后，青色光芒重新爬上玻璃穹顶，莉拉把一枚发烫的坐标片按进你掌心：“别问我怎么知道，但它刚才喊了你的名字。”",
    location: "星烬边境灯塔",
    participatingCharacterIds: ["char_lyra", "char_nova"],
    trigger: { type: "default" },
    initialState: { alertLevel: 1, gateStability: 42 },
    order: 1,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "scenario_mist_harbor_arrival",
    storylineId: "story_mist_harbor",
    title: "逆潮靠岸",
    summary: "一份以你名字签署的旧契约正在钟楼下等待。",
    opening: "船靠岸时，雾港的潮水正向天空倒流。塞布尔站在海关拱门下，翻开一本没有封面的账簿：“欢迎回来。或者，欢迎第一次履行你已经欠下的承诺。”",
    location: "雾港海关",
    participatingCharacterIds: ["char_sable"],
    trigger: { type: "default" },
    initialState: { debtClock: 1, witnessItem: "blank_contract" },
    order: 1,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

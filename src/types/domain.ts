export type ContentRating = "SFW" | "M17" | "AdultLocked";
export type ModerationState =
  | "draft"
  | "local_ready"
  | "submitted"
  | "approved"
  | "published"
  | "needs_changes"
  | "rejected"
  | "appealed";
export type Visibility = "private" | "unlisted" | "public";
export type PlayMode = "chat" | "scene" | "fate" | "voice" | "image" | "video";
export type MessageMode = "say" | "act" | "ask" | "ooc";
export type MessageRole = "system" | "user" | "assistant" | "narrator" | "fate" | "tool";
export type SafetyFlag = "none" | "mature_theme" | "adult_locked" | "violence" | "copyright" | "blocked";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  path?: string;
  schemaVersion?: string;
}

export interface SyncSettings {
  enabled: boolean;
  endpoint?: string;
  lastSyncAt?: string;
  status: "local_only" | "ready" | "syncing" | "conflict" | "error";
  conflictCount: number;
}

export type AccountAgeGate = "unknown" | "adult" | "minor";
export type AccountPermission = "sync" | "publish" | "billing" | "adult_content";

export interface CloudAccountSession {
  id: string;
  displayName: string;
  email?: string;
  ageGate: AccountAgeGate;
  permissions: AccountPermission[];
  status: "local_preview" | "connected" | "expired";
  createdAt: string;
  updatedAt: string;
}

export type SyncOperationEntity = keyof EntityStore;
export type SyncOperationKind = "create" | "update" | "delete";
export type SyncOperationStatus = "queued" | "pushed" | "acked" | "conflicted" | "failed";

export interface SyncOperation {
  id: string;
  workspaceId: string;
  entityType: SyncOperationEntity;
  entityId: string;
  op: SyncOperationKind;
  patch: unknown;
  baseVersion?: string;
  clientId: string;
  status: SyncOperationStatus;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SyncConflict {
  id: string;
  operationId: string;
  entityType: SyncOperationEntity;
  entityId: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  status: "open" | "resolved_local" | "resolved_remote" | "copied";
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface WorkspaceSettings {
  activeWorkspaceId: string;
  adultContentUnlocked: boolean;
  cloudAccount?: CloudAccountSession;
  provider: AIProviderSettings;
  budget: BudgetSettings;
  sync: SyncSettings;
}

export interface BudgetSettings {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxEstimatedCostPerTurn: number;
}

export type AIProviderType = "mock" | "openai-compatible" | "local-http" | "cloud-proxy";

export interface AIProviderSettings {
  type: AIProviderType;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface AIProviderRef {
  type: AIProviderType;
  model: string;
}

export interface CreatorRef {
  id: string;
  name: string;
}

export interface ContentVersion {
  version: string;
  changelog: string;
  baseVersionId?: string;
  status: ModerationState;
}

export interface ModerationStatus {
  rating: ContentRating;
  state: ModerationState;
  reasons: string[];
  safetyFlags: SafetyFlag[];
  reviewedAt?: string;
  reviewerId?: string;
}

export interface CharacterVoice {
  tone: string;
  cadence: string;
  catchphrases: string[];
  forbiddenPhrases: string[];
  language: string;
  referenceAssetId?: string;
}

export interface Character {
  id: string;
  type: "character";
  name: string;
  subtitle?: string;
  summary: string;
  profile: string;
  voice: CharacterVoice;
  goals: string[];
  fears?: string[];
  boundaries: string[];
  tags: string[];
  mediaIds: string[];
  defaultScenarioIds: string[];
  moderation: ModerationStatus;
  visibility: Visibility;
  createdBy: CreatorRef;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface StoryCast {
  characterId: string;
  role: string;
  relationshipSeed: string;
  visibility: "always" | "spoiler" | "conditional";
}

export interface Storyline {
  id: string;
  type: "storyline";
  title: string;
  tagline: string;
  summary: string;
  premise: string;
  playerRole: string;
  worldRules: string[];
  tags: string[];
  language: string;
  rating: ContentRating;
  cast: StoryCast[];
  scenarioIds: string[];
  mediaIds: string[];
  supportedModes: PlayMode[];
  dungeonMindConfigId?: string;
  moderation: ModerationStatus;
  visibility: Visibility;
  version: ContentVersion;
  createdBy: CreatorRef;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ScenarioTrigger {
  type: "default" | "tag" | "arc" | "manual";
  value?: string;
}

export interface Scenario {
  id: string;
  storylineId: string;
  title: string;
  summary: string;
  opening: string;
  location?: string;
  participatingCharacterIds: string[];
  trigger: ScenarioTrigger;
  initialState: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface MediaVariant {
  id: string;
  relativePath: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  purpose: "thumbnail" | "preview" | "original";
}

export interface AssetSource {
  kind: "original" | "generated" | "imported" | "placeholder";
  label: string;
  url?: string;
}

export interface AssetLicense {
  kind: "owned" | "cc0" | "licensed" | "unknown";
  note: string;
}

export interface MediaAsset {
  id: string;
  kind: "image" | "audio" | "video" | "document";
  purpose: "cover" | "avatar" | "background" | "sprite" | "voice" | "reference";
  relativePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  sizeBytes: number;
  variants: MediaVariant[];
  altText: string;
  source: AssetSource;
  license: AssetLicense;
  safety: ModerationStatus;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export type MediaGenerationKind = "voice" | "image" | "video";
export type MediaGenerationStatus = "queued" | "running" | "completed" | "failed" | "blocked";

export interface MediaGenerationJob {
  id: string;
  kind: MediaGenerationKind;
  storylineId: string;
  chatId?: string;
  messageId?: string;
  speakerId?: string;
  prompt: string;
  style?: string;
  voiceText?: string;
  provider: string;
  model: string;
  status: MediaGenerationStatus;
  safetyFlags: SafetyFlag[];
  assetId?: string;
  ledgerEntryId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface NarrativePreference {
  key: string;
  value: string;
}

export interface Persona {
  id: string;
  name: string;
  pronouns?: string;
  description: string;
  preferences: NarrativePreference[];
  boundaries: string[];
  privateNotes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Chat {
  id: string;
  storylineId: string;
  scenarioId: string;
  personaId: string;
  title: string;
  status: "active" | "archived" | "error";
  provider: AIProviderRef;
  activeArcId?: string;
  messageIds: string[];
  checkpointIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatCheckpoint {
  id: string;
  chatId: string;
  label: string;
  messageIndex: number;
  messageId?: string;
  createdAt: string;
}

export interface SceneSprite {
  characterId: string;
  mediaAssetId?: string;
  position: "left" | "center" | "right";
  expression?: string;
}

export interface VoiceCue {
  speakerId?: string;
  text: string;
  voiceModel?: string;
  assetId?: string;
  status: "planned" | "generated" | "failed";
}

export interface SceneChoice {
  id: string;
  label: string;
  message: string;
}

export interface SceneHint {
  backgroundAssetId?: string;
  characterSprites?: SceneSprite[];
  camera?: "wide" | "medium" | "close";
  mood?: string;
  musicAssetId?: string;
  voice?: VoiceCue[];
  choices?: SceneChoice[];
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  currency: "local_estimate" | "credit";
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  speakerId?: string;
  content: string;
  mode?: MessageMode;
  promptContractVersion?: string;
  sceneHints?: SceneHint[];
  relationshipDeltas?: RelationshipDelta[];
  tokenEstimate?: number;
  costEstimate?: CostEstimate;
  safetyFlags: SafetyFlag[];
  parentMessageId?: string;
  retryOfMessageId?: string;
  bookmarkedAt?: string;
  bookmarkNote?: string;
  createdAt: string;
}

export interface RelationshipDelta {
  sourceId: string;
  targetId: string;
  summary: string;
  weight: number;
}

export interface SummaryRevision {
  id: string;
  summary: string;
  facts: string[];
  relationshipDeltas: RelationshipDelta[];
  unresolvedThreads: string[];
  createdAt: string;
  note?: string;
}

export interface SummaryChapter {
  id: string;
  chatId: string;
  range: { fromMessageId: string; toMessageId: string };
  title: string;
  summary: string;
  facts: string[];
  relationshipDeltas: RelationshipDelta[];
  unresolvedThreads: string[];
  createdAt: string;
  updatedAt?: string;
  revisionHistory?: SummaryRevision[];
}

export interface ArcBeat {
  id: string;
  title: string;
  status: "open" | "done" | "skipped";
  evidenceMessageIds: string[];
}

export interface Arc {
  id: string;
  chatId: string;
  title: string;
  theme: string;
  goal: string;
  stakes: string;
  beats: ArcBeat[];
  status: "planned" | "active" | "resolved" | "abandoned";
  createdAt: string;
  updatedAt: string;
}

export interface AttributeDefinition {
  id: string;
  name: string;
  description: string;
  defaultValue: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  attributeId: string;
  description: string;
}

export interface DifficultyBand {
  label: string;
  target: number;
}

export interface ConsequenceRule {
  id: string;
  label: string;
  description: string;
}

export interface DungeonMindConfig {
  id: string;
  storylineId: string;
  enabled: boolean;
  dice: "d20" | "2d6" | "percentile" | "custom";
  attributes: AttributeDefinition[];
  skills: SkillDefinition[];
  difficultyTable: DifficultyBand[];
  consequenceRules: ConsequenceRule[];
  visibility: "hidden" | "summary" | "full";
}

export interface FateCheck {
  id: string;
  chatId: string;
  actorId: string;
  intent: string;
  attribute: string;
  skill?: string;
  difficulty: number;
  roll: {
    seed: string;
    die: number;
    modifier: number;
    total: number;
  };
  outcome: "critical_success" | "success" | "partial" | "failure" | "critical_failure";
  consequences: string[];
  visibility: "hidden" | "summary" | "full";
  createdAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  chatId?: string;
  provider: string;
  model: string;
  operation: "chat" | "summary" | "scene" | "image" | "voice" | "video";
  estimatedTokens: number;
  estimatedCost: number;
  actualCost?: number;
  status: "estimated" | "pending" | "settled" | "refunded" | "reversed" | "frozen";
  adjustmentIds: string[];
  currency: "local_estimate" | "credit";
  createdAt: string;
}

export interface CreditAdjustment {
  id: string;
  ledgerEntryId: string;
  kind: "refund" | "reversal" | "freeze" | "release";
  amount: number;
  reason: string;
  createdAt: string;
}

export interface ModerationCase {
  id: string;
  targetType: "storyline" | "character" | "media" | "chat" | "creator";
  targetId: string;
  reason: string;
  status: "open" | "reviewing" | "actioned" | "dismissed" | "appealed";
  appeal?: ModerationAppeal;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationAppeal {
  id: string;
  reason: string;
  status: "open" | "upheld" | "denied";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface CreatorEarning {
  id: string;
  creatorId: string;
  sourceEntityId: string;
  status: "estimated" | "pending" | "available" | "withheld" | "paid" | "reversed";
  amount: number;
  currency: "credit";
  note: string;
  createdAt: string;
}

export interface CreatorPayoutRequest {
  id: string;
  creatorId: string;
  earningIds: string[];
  amount: number;
  currency: "credit";
  status: "requested" | "approved" | "paid" | "rejected" | "blocked";
  riskFlags: string[];
  note: string;
  requestedAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface EngagementStats {
  entityId: string;
  starts: number;
  messages: number;
  lastPlayedAt?: string;
  localRating?: number;
  cloud?: {
    views: number;
    likes: number;
    favorites: number;
  };
}

export interface EntityStore {
  characters: Record<string, Character>;
  storylines: Record<string, Storyline>;
  scenarios: Record<string, Scenario>;
  mediaAssets: Record<string, MediaAsset>;
  personas: Record<string, Persona>;
  chats: Record<string, Chat>;
  chatCheckpoints: Record<string, ChatCheckpoint>;
  messages: Record<string, Message>;
  summaryChapters: Record<string, SummaryChapter>;
  arcs: Record<string, Arc>;
  dungeonMindConfigs: Record<string, DungeonMindConfig>;
  fateChecks: Record<string, FateCheck>;
  creditLedger: Record<string, CreditLedgerEntry>;
  creditAdjustments: Record<string, CreditAdjustment>;
  moderationCases: Record<string, ModerationCase>;
  creatorEarnings: Record<string, CreatorEarning>;
  creatorPayoutRequests: Record<string, CreatorPayoutRequest>;
  engagementStats: Record<string, EngagementStats>;
  mediaGenerationJobs: Record<string, MediaGenerationJob>;
  syncOperations: Record<string, SyncOperation>;
  syncConflicts: Record<string, SyncConflict>;
}

export interface SearchIndexSnapshot {
  storylinesByUpdatedAt: string[];
  charactersByStoryline: Record<string, string[]>;
  chatsByStoryline: Record<string, string[]>;
  messageIdsByChat: Record<string, string[]>;
  tags: Record<string, string[]>;
}

export interface AuditEntry {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface SaveEnvelope {
  schemaVersion: "1.0.0";
  workspace: Workspace;
  entities: EntityStore;
  indexes: SearchIndexSnapshot;
  settings: WorkspaceSettings;
  audit: AuditEntry[];
}

export interface GeneratedMessage {
  role: MessageRole;
  speakerId?: string;
  content: string;
  promptContractVersion?: string;
  sceneHints?: SceneHint[];
  safetyFlags?: SafetyFlag[];
}

export interface NarrativeResponse {
  promptContractVersion?: string;
  messages: GeneratedMessage[];
  relationshipDeltas?: RelationshipDelta[];
  sceneHints?: SceneHint[];
  safetyFlags?: SafetyFlag[];
  usage?: CostEstimate;
}

export interface NarrativeRequest {
  storyline: Storyline;
  scenario: Scenario;
  persona: Persona;
  characters: Character[];
  messages: Message[];
  summaryChapters?: SummaryChapter[];
  activeArc?: Arc;
  fateChecks?: FateCheck[];
  provider: AIProviderSettings;
  mode: MessageMode;
  userInput: string;
  adultContentUnlocked?: boolean;
}

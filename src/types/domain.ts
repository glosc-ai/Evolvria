export const SCHEMA_VERSION = 1;

export type RouteName =
  | "main_menu"
  | "onboarding"
  | "new_world"
  | "exploration"
  | "map"
  | "locations"
  | "characters"
  | "timeline"
  | "threads"
  | "world_lore"
  | "saves"
  | "settings";

export type AIPurpose =
  | "world_expand"
  | "player_action"
  | "npc_simulation"
  | "memory_extract"
  | "summary_update"
  | "consistency_check";

export interface WorldTime {
  day: number;
  hour: number;
  calendar_label?: string;
}

export interface MapPosition {
  x: number;
  y: number;
}

export interface Relationship {
  type: string;
  trust: number;
  affection: number;
  tension: number;
  notes: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  personality: string[];
  goals: string[];
  secrets: string[];
  current_location_id: string;
  status: string;
  traits: string[];
  relationships: Record<string, Relationship>;
  memory_summary: string;
  known_event_ids: string[];
  player_notes: string;
  player_notes_updated_at: string;
  action_tendency?: string;
  companion?: boolean;
  visibility?: "met" | "heard" | "hidden";
}

export interface Location {
  id: string;
  name: string;
  type: string;
  description: string;
  map_id: string;
  position: MapPosition;
  connected_location_ids: string[];
  controlling_faction_id: string | null;
  known_to_player: boolean;
  visibility: "known_to_player" | "heard" | "unknown";
  state_tags: string[];
  event_ids: string[];
  player_notes: string;
  player_notes_updated_at: string;
  biome?: string;
  height?: number;
}

export interface Faction {
  id: string;
  name: string;
  agenda: string;
  attitude: string;
  controlled_location_ids: string[];
}

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  world_time: WorldTime;
  location_id: string;
  participant_ids: string[];
  cause_event_ids: string[];
  effects: string[];
  importance: number;
  visibility: string;
  outcome?: string;
  outcome_reason?: string;
  consequence?: string;
}

export interface Memory {
  id: string;
  scope: string;
  owner_id: string;
  text: string;
  facts: string[];
  event_id: string;
  importance: number;
  confidence: number;
  tags: string[];
  created_world_time: WorldTime;
}

export interface Thread {
  id: string;
  title: string;
  description: string;
  kind: string;
  status: "open" | "resolved";
  priority: number;
  tags: string[];
  event_id: string;
  progress: Array<{ event_id: string; text: string; created_at: string }>;
}

export interface MapRoute {
  id: string;
  from_location_id: string;
  to_location_id: string;
  name: string;
  type: string;
  danger: number;
}

export interface MapImage {
  id: string;
  name: string;
  image_path: string;
  data_url?: string;
  width: number;
  height: number;
  original_width?: number;
  original_height?: number;
  max_dimension?: number;
  resized_for_device?: boolean;
  scale_label: string;
  locations: string[];
  routes: MapRoute[];
  generator: Record<string, unknown>;
}

export interface World {
  id: string;
  name: string;
  genre: string;
  tone: string[];
  current_time: WorldTime;
  summary: string;
  phase_summaries: unknown[];
  summary_event_cursor: number;
  rules: string[];
  themes: string[];
  content_limits: string[];
  narrative_detail: string;
  npc_autonomy_frequency: string;
  map_image: Partial<MapImage>;
  map_routes: MapRoute[];
  created_at: string;
  schema_version: number;
}

export interface AIUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
  cost_estimate?: number | null;
}

export interface AIRequestLog {
  id: string;
  world_id: string;
  purpose: string;
  prompt_hash: string;
  model: string;
  started_at: string;
  finished_at: string | null;
  status: "pending" | "ok" | "error";
  error: string | null;
  usage: AIUsage;
  summary: string;
  raw_response?: string;
}

export interface SavePayload {
  schema_version: number;
  world: World | Record<string, never>;
  characters: Character[];
  locations: Location[];
  factions: Faction[];
  timeline: TimelineEvent[];
  memories: Memory[];
  ai_logs: AIRequestLog[];
  threads: Thread[];
  suggested_actions: string[];
  event_counter: number;
  memory_counter: number;
  location_counter: number;
  thread_counter: number;
  updated_at: string;
}

export interface Settings {
  theme: "dark" | "light";
  font_size: "small" | "medium" | "large";
  fullscreen: boolean;
  context_panel_width: number;
  glosc_provider: string;
  glosc_base_url: string;
  glosc_token: string;
  model: string;
  timeout_seconds: number;
  auto_retry: boolean;
  confirm_ai_calls: boolean;
  show_usage_estimate: boolean;
  auto_save_enabled: boolean;
  debug_logs: boolean;
  log_level: "default" | "debug" | "deep";
  developer_mode: boolean;
  content_preferences: string;
  local_token_risk_acknowledged: boolean;
  onboarding_completed: boolean;
}

export interface WorldSeed {
  world_name: string;
  genre: string;
  tone: string;
  limits: string;
  narrative_detail: string;
  npc_autonomy_frequency: string;
  hero: {
    name: string;
    description: string;
    goal: string;
    ability: string;
    weakness: string;
  };
  key_characters: Array<{
    name: string;
    role: string;
    relationship: string;
    personality: string;
    goal: string;
    secret: string;
    action_tendency: string;
    description: string;
  }>;
}

export interface StatePatch {
  target_type: "world" | "character" | "location" | "event" | "thread";
  target_id: string;
  op: "set" | "append" | "remove" | "increment" | "link" | "unlink";
  path: string;
  value: unknown;
  reason?: string;
}

export interface PlayerActionResult {
  status: "ok" | "error";
  narrative: string;
  time_delta_minutes: number;
  events: Array<Partial<TimelineEvent>>;
  character_updates: StatePatch[];
  location_updates: StatePatch[];
  relationship_updates: Array<{
    source_id: string;
    target_id: string;
    trust_delta?: number;
    affection_delta?: number;
    tension_delta?: number;
    note: string;
  }>;
  memory_writes: Array<Partial<Memory>>;
  suggested_actions: string[];
  warnings: string[];
  error?: string;
  usage?: AIUsage;
  request_id?: string;
}

export interface PlatformCapabilities {
  os: string;
  mobile: boolean;
  can_reveal_directories: boolean;
  can_share_files: boolean;
  can_use_file_picker: boolean;
  app_data_dir?: string;
}

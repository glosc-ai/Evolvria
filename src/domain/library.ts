import type { ContentRating, EntityStore, MediaAsset, PlayMode } from "@/types/domain";

export type LibraryKind = "all" | "storyline" | "character" | "scenario" | "media";
export type LibrarySort = "updated" | "created" | "title" | "played" | "completion" | "heat";

export interface LibraryFilters {
  query?: string;
  kind?: LibraryKind;
  rating?: "all" | ContentRating;
  mode?: "all" | PlayMode;
  language?: "all" | string;
  tag?: "all" | string;
  sort?: LibrarySort;
  adultUnlocked?: boolean;
}

export interface LibraryItem {
  id: string;
  kind: Exclude<LibraryKind, "all">;
  title: string;
  subtitle?: string;
  summary: string;
  tags: string[];
  rating?: ContentRating;
  language?: string;
  modes: PlayMode[];
  createdAt: string;
  updatedAt: string;
  route?: string;
  status?: string;
  creator?: string;
  castCount?: number;
  completion: number;
  heat: number;
  lastPlayedAt?: string;
}

export function buildLibraryItems(entities: EntityStore): LibraryItem[] {
  const items: LibraryItem[] = [];

  for (const story of Object.values(entities.storylines).filter((story) => !story.deletedAt)) {
    const stats = entities.engagementStats[story.id];
    items.push({
      id: story.id,
      kind: "storyline",
      title: story.title,
      subtitle: story.tagline,
      summary: story.summary,
      tags: story.tags,
      rating: story.rating,
      language: story.language,
      modes: story.supportedModes,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
      route: `/storylines/${story.id}`,
      status: story.version.status,
      creator: story.createdBy.name,
      castCount: story.cast.length,
      completion: completionScore(story.version.status, story.scenarioIds.length, story.cast.length),
      heat: heatScore(stats?.starts ?? 0, stats?.messages ?? 0, stats?.cloud?.likes ?? 0),
      lastPlayedAt: stats?.lastPlayedAt,
    });
  }

  for (const character of Object.values(entities.characters).filter((character) => !character.deletedAt)) {
    const storyline = Object.values(entities.storylines).find((story) => !story.deletedAt && story.cast.some((cast) => cast.characterId === character.id));
    const stats = entities.engagementStats[character.id];
    items.push({
      id: character.id,
      kind: "character",
      title: character.name,
      subtitle: character.subtitle,
      summary: character.summary,
      tags: character.tags,
      rating: character.moderation.rating,
      language: character.voice.language,
      modes: storyline?.supportedModes ?? ["chat"],
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
      route: storyline ? `/storylines/${storyline.id}` : undefined,
      status: character.moderation.state,
      creator: character.createdBy.name,
      completion: completionScore(character.moderation.state, character.defaultScenarioIds.length, character.goals.length),
      heat: heatScore(stats?.starts ?? 0, stats?.messages ?? 0, stats?.cloud?.likes ?? 0),
      lastPlayedAt: stats?.lastPlayedAt,
    });
  }

  for (const scenario of Object.values(entities.scenarios).filter((scenario) => {
    const storyline = entities.storylines[scenario.storylineId];
    return !scenario.deletedAt && !storyline?.deletedAt;
  })) {
    const storyline = entities.storylines[scenario.storylineId];
    const stats = entities.engagementStats[scenario.id];
    items.push({
      id: scenario.id,
      kind: "scenario",
      title: scenario.title,
      subtitle: storyline?.deletedAt ? undefined : storyline?.title,
      summary: scenario.summary,
      tags: storyline?.deletedAt ? [] : storyline?.tags ?? [],
      rating: storyline?.deletedAt ? undefined : storyline?.rating,
      language: storyline?.deletedAt ? undefined : storyline?.language,
      modes: storyline?.deletedAt ? ["chat"] : storyline?.supportedModes ?? ["chat"],
      createdAt: scenario.createdAt,
      updatedAt: scenario.updatedAt,
      route: storyline && !storyline.deletedAt ? `/start/${storyline.id}?scenario=${scenario.id}` : undefined,
      status: scenario.trigger.type,
      creator: storyline?.deletedAt ? undefined : storyline?.createdBy.name,
      castCount: scenario.participatingCharacterIds.length,
      completion: scenario.opening.trim().length ? 80 : 25,
      heat: heatScore(stats?.starts ?? 0, stats?.messages ?? 0, stats?.cloud?.likes ?? 0),
      lastPlayedAt: stats?.lastPlayedAt,
    });
  }

  for (const asset of Object.values(entities.mediaAssets).filter((asset) => !asset.deletedAt)) {
    const storyline = storyForMedia(entities, asset);
    items.push({
      id: asset.id,
      kind: "media",
      title: asset.altText || asset.id,
      subtitle: `${asset.kind} / ${asset.purpose}`,
      summary: asset.source.label,
      tags: [asset.kind, asset.purpose, asset.license.kind],
      rating: asset.safety.rating,
      language: storyline?.language,
      modes: storyline?.supportedModes ?? [],
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt ?? asset.createdAt,
      route: storyline ? `/storylines/${storyline.id}` : undefined,
      status: asset.safety.state,
      creator: asset.source.label,
      completion: mediaCompletion(asset),
      heat: 0,
    });
  }

  return items;
}

export function filterLibraryItems(items: LibraryItem[], filters: LibraryFilters): LibraryItem[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const kind = filters.kind ?? "all";
  const rating = filters.rating ?? "all";
  const mode = filters.mode ?? "all";
  const language = filters.language ?? "all";
  const tag = filters.tag ?? "all";
  const adultUnlocked = filters.adultUnlocked ?? false;
  const sort = filters.sort ?? "updated";

  return items
    .filter((item) => kind === "all" || item.kind === kind)
    .filter((item) => rating === "all" || item.rating === rating)
    .filter((item) => mode === "all" || item.modes.includes(mode))
    .filter((item) => language === "all" || item.language === language)
    .filter((item) => tag === "all" || item.tags.includes(tag))
    .filter((item) => adultUnlocked || item.rating !== "AdultLocked")
    .filter((item) => !query || searchableText(item).includes(query))
    .sort((a, b) => compareLibraryItems(a, b, sort));
}

export function libraryFacetValues(items: LibraryItem[]) {
  return {
    tags: [...new Set(items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    languages: [...new Set(items.map((item) => item.language).filter((value): value is string => Boolean(value)))].sort(),
    modes: [...new Set(items.flatMap((item) => item.modes))].sort(),
  };
}

function searchableText(item: LibraryItem): string {
  return [
    item.title,
    item.subtitle ?? "",
    item.summary,
    item.tags.join(" "),
    item.creator ?? "",
    item.kind,
    item.status ?? "",
  ].join(" ").toLowerCase();
}

function compareLibraryItems(a: LibraryItem, b: LibraryItem, sort: LibrarySort): number {
  if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
  if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
  if (sort === "played") return (b.lastPlayedAt ?? b.updatedAt).localeCompare(a.lastPlayedAt ?? a.updatedAt);
  if (sort === "completion") return b.completion - a.completion || b.updatedAt.localeCompare(a.updatedAt);
  if (sort === "heat") return b.heat - a.heat || b.updatedAt.localeCompare(a.updatedAt);
  return b.updatedAt.localeCompare(a.updatedAt);
}

function completionScore(status: string, playableUnits: number, supportUnits: number): number {
  const statusScore = status === "published" || status === "approved" || status === "local_ready" ? 55 : status === "draft" ? 20 : 35;
  return Math.min(100, statusScore + Math.min(25, playableUnits * 12) + Math.min(20, supportUnits * 5));
}

function heatScore(starts: number, messages: number, likes: number): number {
  return starts * 10 + messages + likes * 15;
}

function mediaCompletion(asset: MediaAsset): number {
  const license = asset.license.kind === "unknown" ? 0 : 35;
  const source = asset.source.kind === "placeholder" || asset.source.kind === "original" || asset.source.kind === "generated" ? 25 : 15;
  const safety = asset.safety.state === "local_ready" || asset.safety.state === "approved" ? 25 : 10;
  const alt = asset.altText ? 15 : 0;
  return license + source + safety + alt;
}

function storyForMedia(entities: EntityStore, asset: MediaAsset) {
  return Object.values(entities.storylines).find((story) => !story.deletedAt && story.mediaIds.includes(asset.id));
}

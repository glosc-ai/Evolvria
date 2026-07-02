import { buildLibraryItems, filterLibraryItems, libraryFacetValues, type LibraryFilters, type LibraryItem } from "@/domain/library";
import type { Character, MediaAsset, SaveEnvelope, Scenario, Storyline } from "@/types/domain";

export interface ContentSearchQuery extends LibraryFilters {
  page?: number;
  pageSize?: number;
}

export interface ContentSearchResult {
  items: LibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: ReturnType<typeof libraryFacetValues>;
  source: "local";
}

export interface ContentRepository {
  search(envelope: SaveEnvelope, query?: ContentSearchQuery): ContentSearchResult;
  getStoryline(envelope: SaveEnvelope, id: string): Storyline | undefined;
  saveStoryline(envelope: SaveEnvelope, storyline: Storyline): Storyline;
  saveCharacter(envelope: SaveEnvelope, character: Character): Character;
  saveScenario(envelope: SaveEnvelope, scenario: Scenario): Scenario;
  softDeleteStorylinePackage(envelope: SaveEnvelope, storylineId: string, deletedAt: string): Storyline | undefined;
  restoreStorylinePackage(envelope: SaveEnvelope, storylineId: string, restoredAt: string): Storyline | undefined;
}

const defaultPageSize = 60;

export class LocalContentRepository implements ContentRepository {
  search(envelope: SaveEnvelope, query: ContentSearchQuery = {}): ContentSearchResult {
    const allItems = buildLibraryItems(envelope.entities);
    const filtered = filterLibraryItems(allItems, query);
    const pageSize = clampPositiveInteger(query.pageSize, defaultPageSize);
    const page = clampPositiveInteger(query.page, 1);
    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      facets: libraryFacetValues(allItems),
      source: "local",
    };
  }

  getStoryline(envelope: SaveEnvelope, id: string): Storyline | undefined {
    const storyline = envelope.entities.storylines[id];
    return storyline?.deletedAt ? undefined : storyline;
  }

  saveStoryline(envelope: SaveEnvelope, storyline: Storyline): Storyline {
    envelope.entities.storylines[storyline.id] = storyline;
    return storyline;
  }

  saveCharacter(envelope: SaveEnvelope, character: Character): Character {
    envelope.entities.characters[character.id] = character;
    return character;
  }

  saveScenario(envelope: SaveEnvelope, scenario: Scenario): Scenario {
    envelope.entities.scenarios[scenario.id] = scenario;
    return scenario;
  }

  softDeleteStorylinePackage(envelope: SaveEnvelope, storylineId: string, deletedAt: string): Storyline | undefined {
    const storyline = envelope.entities.storylines[storylineId];
    if (!storyline) return undefined;
    const nextStoryline = { ...storyline, updatedAt: deletedAt, deletedAt };
    envelope.entities.storylines[storylineId] = nextStoryline;
    for (const characterId of storyline.cast.map((cast) => cast.characterId)) {
      const character = envelope.entities.characters[characterId];
      if (character) envelope.entities.characters[characterId] = markDeleted(character, deletedAt);
    }
    for (const scenarioId of storyline.scenarioIds) {
      const scenario = envelope.entities.scenarios[scenarioId];
      if (scenario) envelope.entities.scenarios[scenarioId] = markDeleted(scenario, deletedAt);
    }
    for (const mediaId of storyline.mediaIds) {
      const mediaAsset = envelope.entities.mediaAssets[mediaId];
      if (mediaAsset) envelope.entities.mediaAssets[mediaId] = markDeleted(mediaAsset, deletedAt);
    }
    return nextStoryline;
  }

  restoreStorylinePackage(envelope: SaveEnvelope, storylineId: string, restoredAt: string): Storyline | undefined {
    const storyline = envelope.entities.storylines[storylineId];
    if (!storyline) return undefined;
    const nextStoryline = { ...clearDeleted(storyline), updatedAt: restoredAt };
    envelope.entities.storylines[storylineId] = nextStoryline;
    for (const characterId of storyline.cast.map((cast) => cast.characterId)) {
      const character = envelope.entities.characters[characterId];
      if (character) envelope.entities.characters[characterId] = clearDeleted(character, restoredAt);
    }
    for (const scenarioId of storyline.scenarioIds) {
      const scenario = envelope.entities.scenarios[scenarioId];
      if (scenario) envelope.entities.scenarios[scenarioId] = clearDeleted(scenario, restoredAt);
    }
    for (const mediaId of storyline.mediaIds) {
      const mediaAsset = envelope.entities.mediaAssets[mediaId];
      if (mediaAsset) envelope.entities.mediaAssets[mediaId] = clearDeleted(mediaAsset, restoredAt);
    }
    return nextStoryline;
  }
}

export const localContentRepository = new LocalContentRepository();

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(Number(value)));
}

type DeletableEntity = Character | Storyline | Scenario | MediaAsset;

function markDeleted<T extends DeletableEntity>(entity: T, deletedAt: string): T {
  return { ...entity, updatedAt: deletedAt, deletedAt };
}

function clearDeleted<T extends DeletableEntity>(entity: T, updatedAt?: string): T {
  const { deletedAt: _deletedAt, ...rest } = entity;
  return updatedAt ? ({ ...rest, updatedAt } as T) : rest as T;
}

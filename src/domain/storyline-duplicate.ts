import { createId, nowIso } from "@/domain/ids";
import type { Character, CreatorRef, DungeonMindConfig, EntityStore, Scenario, Storyline } from "@/types/domain";

interface DuplicateStorylineOptions {
  titleSuffix?: string;
  now?: string;
  creator?: CreatorRef;
  idFactory?: (prefix: string) => string;
}

export interface DuplicateStorylineResult {
  storyline: Storyline;
  characters: Character[];
  scenarios: Scenario[];
  dungeonMindConfig?: DungeonMindConfig;
  idMap: {
    storylineId: string;
    characterIds: Record<string, string>;
    scenarioIds: Record<string, string>;
    dungeonMindConfigId?: string;
  };
}

const localCreator: CreatorRef = { id: "creator_local", name: "Local Creator" };

export function duplicateStorylinePackage(
  entities: EntityStore,
  sourceStorylineId: string,
  options: DuplicateStorylineOptions = {},
): DuplicateStorylineResult {
  const source = entities.storylines[sourceStorylineId];
  if (!source) throw new Error("storyline_not_found");

  const now = options.now ?? nowIso();
  const makeId = options.idFactory ?? createId;
  const creator = options.creator ?? localCreator;
  const storylineId = makeId("story");
  const characterIds: Record<string, string> = {};
  const scenarioIds: Record<string, string> = {};
  const sourceCharacters = Array.from(new Set(source.cast.map((cast) => cast.characterId)))
    .map((characterId) => entities.characters[characterId])
    .filter((character): character is Character => Boolean(character));
  const sourceScenarios = Array.from(new Set(source.scenarioIds))
    .map((scenarioId) => entities.scenarios[scenarioId])
    .filter((scenario): scenario is Scenario => Boolean(scenario));

  for (const character of sourceCharacters) {
    characterIds[character.id] = makeId("char");
  }
  for (const scenario of sourceScenarios) {
    scenarioIds[scenario.id] = makeId("scenario");
  }

  const characters = sourceCharacters.map((character) => ({
    ...character,
    id: characterIds[character.id],
    defaultScenarioIds: character.defaultScenarioIds.map((id) => scenarioIds[id] ?? id),
    moderation: {
      ...character.moderation,
      state: "draft" as const,
      reasons: [],
      reviewedAt: undefined,
      reviewerId: undefined,
    },
    visibility: "private" as const,
    createdBy: creator,
    createdAt: now,
    updatedAt: now,
  }));

  const scenarios = sourceScenarios.map((scenario) => ({
    ...scenario,
    id: scenarioIds[scenario.id],
    storylineId,
    participatingCharacterIds: scenario.participatingCharacterIds.map((id) => characterIds[id] ?? id),
    createdAt: now,
    updatedAt: now,
  }));

  const sourceConfig = source.dungeonMindConfigId ? entities.dungeonMindConfigs[source.dungeonMindConfigId] : undefined;
  const dungeonMindConfigId = sourceConfig ? makeId("dm") : undefined;
  const dungeonMindConfig = sourceConfig && dungeonMindConfigId
    ? {
        ...sourceConfig,
        id: dungeonMindConfigId,
        storylineId,
        attributes: sourceConfig.attributes.map((attribute) => ({ ...attribute })),
        skills: sourceConfig.skills.map((skill) => ({ ...skill })),
        difficultyTable: sourceConfig.difficultyTable.map((band) => ({ ...band })),
        consequenceRules: sourceConfig.consequenceRules.map((rule) => ({ ...rule })),
      }
    : undefined;

  const titleSuffix = options.titleSuffix ?? " 本地副本";
  const storyline: Storyline = {
    ...source,
    id: storylineId,
    title: `${source.title}${titleSuffix}`,
    cast: source.cast.map((cast) => ({
      ...cast,
      characterId: characterIds[cast.characterId] ?? cast.characterId,
    })),
    scenarioIds: source.scenarioIds.map((id) => scenarioIds[id] ?? id),
    dungeonMindConfigId,
    mediaIds: [...source.mediaIds],
    moderation: {
      ...source.moderation,
      state: "draft",
      reasons: [],
      reviewedAt: undefined,
      reviewerId: undefined,
    },
    visibility: "private",
    version: {
      version: `${source.version.version}+local-draft`,
      status: "draft",
      changelog: "Duplicated as local draft.",
      baseVersionId: source.version.version,
    },
    createdBy: creator,
    createdAt: now,
    updatedAt: now,
  };

  return {
    storyline,
    characters,
    scenarios,
    dungeonMindConfig,
    idMap: {
      storylineId,
      characterIds,
      scenarioIds,
      dungeonMindConfigId,
    },
  };
}

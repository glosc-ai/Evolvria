import type { EntityStore, EngagementStats } from "@/types/domain";

export interface EngagementDelta {
  starts?: number;
  messages?: number;
  playedAt: string;
}

export function recordEngagementStats(entities: EntityStore, entityIds: string[], delta: EngagementDelta): void {
  for (const entityId of [...new Set(entityIds.filter(Boolean))]) {
    const current = entities.engagementStats[entityId] ?? emptyStats(entityId);
    entities.engagementStats[entityId] = {
      ...current,
      starts: current.starts + Math.max(0, delta.starts ?? 0),
      messages: current.messages + Math.max(0, delta.messages ?? 0),
      lastPlayedAt: delta.playedAt,
    };
  }
}

function emptyStats(entityId: string): EngagementStats {
  return {
    entityId,
    starts: 0,
    messages: 0,
  };
}

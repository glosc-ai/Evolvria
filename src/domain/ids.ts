const counters = new Map<string, number>();

export function createId(prefix: string): string {
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${next.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

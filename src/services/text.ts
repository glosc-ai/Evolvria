export function splitTags(text: string): string[] {
  return text
    .split(/[,，、;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function redactSensitive(text: string): string {
  return text.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[已脱敏]").replace(/sk-[A-Za-z0-9._-]+/gi, "[已脱敏]");
}

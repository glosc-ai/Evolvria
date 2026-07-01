import { makeId, stableHash } from "@/services/ids";
import { clamp } from "@/services/text";
import type { Faction, Location, MapImage, MapRegion, MapRoute, WorldSeed } from "@/types/domain";

const MAP_WIDTH = 960;
const MAP_HEIGHT = 640;

const AZGAAR_PROJECT = {
  source_project: "Azgaar/Fantasy-Map-Generator",
  source_license: "MIT",
  source_url: "https://github.com/Azgaar/Fantasy-Map-Generator",
} as const;

type BiomeKey = "temperate_grassland" | "forest" | "highland" | "coast" | "mountain" | "wetland" | "desert" | "tundra";

interface RegionDraft {
  id: string;
  name: string;
  type: string;
  biome: BiomeKey;
  center: { x: number; y: number };
  color: string;
  height: number;
  moisture: number;
  temperature: number;
}

interface LocationTemplate {
  id: string;
  name: string;
  type: string;
  biomeHints: BiomeKey[];
  known: boolean;
  tags: string[];
}

export interface GeneratedWorldMap {
  regions: MapRegion[];
  locations: Location[];
  routes: MapRoute[];
}

const BIOMES: Record<BiomeKey, { color: string; habitability: number; cost: number; label: string }> = {
  temperate_grassland: { color: "#7f9f67", habitability: 0.84, cost: 1, label: "温带草原" },
  forest: { color: "#47745c", habitability: 0.64, cost: 1.35, label: "森林" },
  highland: { color: "#8d8a6f", habitability: 0.5, cost: 1.55, label: "高地" },
  coast: { color: "#4f8aa0", habitability: 0.76, cost: 1.15, label: "海岸" },
  mountain: { color: "#777b84", habitability: 0.32, cost: 2.4, label: "山地" },
  wetland: { color: "#6c7b55", habitability: 0.38, cost: 1.9, label: "湿地" },
  desert: { color: "#b9a566", habitability: 0.22, cost: 2.1, label: "荒漠" },
  tundra: { color: "#9aa7a7", habitability: 0.2, cost: 2.25, label: "寒原" },
};

export function generateAzgaarWorldMap(seed: WorldSeed, factions: Faction[]): GeneratedWorldMap {
  const rand = seededRandom(stableHash(`${seed.world_name}|${seed.genre}|${seed.tone}|azgaar`));
  const regionDrafts = buildRegionDrafts(seed, rand);
  const regions = regionDrafts.map((region, index): MapRegion => {
    const faction = factions[index % Math.max(factions.length, 1)]?.id ?? null;
    return {
      id: region.id,
      name: region.name,
      type: region.type,
      description: regionDescription(region, seed),
      biome: region.biome,
      center: region.center,
      color: region.color,
      controlling_faction_id: faction,
      location_ids: [],
    };
  });

  const locations = buildBurgLocations(seed, factions, regions, regionDrafts, rand);
  const routes = buildAzgaarRoutes(locations, regionDrafts, rand);
  connectRouteEndpoints(locations, routes);
  return { regions, locations, routes };
}

export function generatedMapImage(routes: MapRoute[], locations: Location[], seed?: WorldSeed): MapImage {
  return {
    id: "map_001",
    name: "Azgaar 创世地图",
    image_path: "generated://map_001",
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    scale_label: "未设置比例尺",
    locations: locations.map((location) => location.id),
    routes,
    generator: {
      ...AZGAAR_PROJECT,
      mode: "azgaar_adapter",
      pipeline: ["heightmap", "biomes", "regions", "burgs", "routes"],
      adapted_from: [
        "src/generators/heightmap-generator.ts",
        "src/generators/biomes.ts",
        "src/generators/burgs-generator.ts",
        "src/generators/routes-generator.ts",
      ],
      seed_hash: stableHash(`${seed?.world_name ?? ""}|${seed?.genre ?? ""}|${seed?.tone ?? ""}`),
      creation_only: true,
      locked_after_creation: true,
      attribution_required: true,
    },
  };
}

function buildRegionDrafts(seed: WorldSeed, rand: () => number): RegionDraft[] {
  const blueprints = regionBlueprints(seed);
  return blueprints.map((blueprint, index) => {
    const center = regionSite(index, blueprints.length, rand);
    const { height, moisture, temperature } = sampleHeightClimate(center, blueprint.biome, rand);
    const biome = chooseBiome(blueprint.biome, height, moisture, temperature);
    return {
      id: makeId("reg", index + 1),
      name: blueprint.name,
      type: blueprint.type,
      biome,
      center,
      color: BIOMES[biome].color,
      height,
      moisture,
      temperature,
    };
  });
}

function regionBlueprints(seed: WorldSeed): Array<{ name: string; type: string; biome: BiomeKey }> {
  const genre = seed.genre || "奇幻";
  if (genre.includes("科幻")) {
    return [
      { name: "晨环殖民带", type: "殖民带", biome: "temperate_grassland" },
      { name: "雾林穹顶", type: "生态穹顶", biome: "forest" },
      { name: "白塔禁区", type: "高能禁区", biome: "highland" },
      { name: "银潮轨道港", type: "港区", biome: "coast" },
      { name: "裂冠矿脊", type: "矿脉山地", biome: "mountain" },
      { name: "烛沼回收区", type: "湿地废场", biome: "wetland" },
      { name: "赤砂隔离原", type: "荒漠", biome: "desert" },
    ];
  }
  if (genre.includes("武侠")) {
    return [
      { name: "晨星原", type: "平原", biome: "temperate_grassland" },
      { name: "雾林坞", type: "林地", biome: "forest" },
      { name: "白塔岭", type: "高地", biome: "highland" },
      { name: "银潮渡", type: "水陆口岸", biome: "coast" },
      { name: "裂冠山", type: "山脉", biome: "mountain" },
      { name: "烛沼泽", type: "湿地", biome: "wetland" },
      { name: "玄砂关外", type: "荒原", biome: "desert" },
    ];
  }
  if (genre.includes("现代")) {
    return [
      { name: "晨星城区", type: "城区", biome: "temperate_grassland" },
      { name: "雾林保护带", type: "绿带", biome: "forest" },
      { name: "白塔旧区", type: "高地旧区", biome: "highland" },
      { name: "银潮湾", type: "湾区", biome: "coast" },
      { name: "裂冠山城", type: "山地", biome: "mountain" },
      { name: "烛沼工业洼地", type: "湿地", biome: "wetland" },
      { name: "赤砂外环", type: "荒地", biome: "desert" },
    ];
  }
  return [
    { name: "晨星平原", type: "平原", biome: "temperate_grassland" },
    { name: "雾林领", type: "森林", biome: "forest" },
    { name: "白塔高地", type: "高地", biome: "highland" },
    { name: "银潮海岸", type: "海岸", biome: "coast" },
    { name: "裂冠群山", type: "山地", biome: "mountain" },
    { name: "烛沼低地", type: "湿地", biome: "wetland" },
    { name: "赤砂边境", type: "荒漠", biome: "desert" },
  ];
}

function regionSite(index: number, count: number, rand: () => number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2 + (rand() - 0.5) * 0.34;
  const radius = 0.27 + rand() * 0.18;
  const centerBias = index === 0 ? 0.72 : 1;
  return {
    x: clamp(0.5 + Math.cos(angle) * radius * centerBias, 0.12, 0.88),
    y: clamp(0.52 + Math.sin(angle) * radius * centerBias, 0.13, 0.88),
  };
}

function sampleHeightClimate(center: { x: number; y: number }, preferredBiome: BiomeKey, rand: () => number): { height: number; moisture: number; temperature: number } {
  const distanceFromCenter = Math.hypot(center.x - 0.5, (center.y - 0.52) * 1.15);
  const ridge = Math.max(0, 1 - Math.abs(center.x - 0.68) * 3.2 - Math.abs(center.y - 0.45) * 1.2);
  const coastLowering = preferredBiome === "coast" || preferredBiome === "wetland" ? 0.22 : 0;
  const mountainLift = preferredBiome === "mountain" ? 0.32 : preferredBiome === "highland" ? 0.16 : 0;
  const height = clamp(0.72 - distanceFromCenter * 0.86 + ridge * 0.22 + mountainLift - coastLowering + (rand() - 0.5) * 0.18, 0.08, 0.96);
  const moisture = clamp(10 + (1 - Math.abs(center.x - 0.46) * 1.8) * 14 + (preferredBiome === "wetland" ? 12 : 0) + (preferredBiome === "desert" ? -12 : 0) + rand() * 8, 1, 42);
  const temperature = clamp(28 - center.y * 31 - height * 9 + (preferredBiome === "tundra" ? -10 : 0) + (rand() - 0.5) * 5, -14, 32);
  return { height, moisture, temperature };
}

function chooseBiome(preferred: BiomeKey, height: number, moisture: number, temperature: number): BiomeKey {
  if (preferred === "coast" || preferred === "mountain" || preferred === "desert" || preferred === "wetland") return preferred;
  if (temperature < -5) return "tundra";
  if (height > 0.76) return "mountain";
  if (height > 0.62) return "highland";
  if (moisture > 30 && height < 0.56) return "wetland";
  if (moisture < 8 && temperature > 18) return "desert";
  if (moisture > 17) return "forest";
  return preferred;
}

function buildBurgLocations(seed: WorldSeed, factions: Faction[], regions: MapRegion[], drafts: RegionDraft[], rand: () => number): Location[] {
  const templates = locationTemplates(seed);
  return templates.map((template, index) => {
    const region = pickRegion(template, regions, drafts, index);
    const draft = drafts.find((item) => item.id === region.id)!;
    const position = burgPosition(region.center, draft, rand);
    const faction = region.controlling_faction_id;
    const location: Location = {
      id: template.id,
      name: template.name,
      type: template.type,
      description: locationDescription(template, region, draft, seed),
      map_id: "map_001",
      region_id: region.id,
      position,
      connected_location_ids: [],
      controlling_faction_id: faction,
      known_to_player: template.known,
      visibility: template.known ? "known_to_player" : "heard",
      state_tags: [...template.tags, draft.biome],
      event_ids: [],
      player_notes: "",
      player_notes_updated_at: "",
      biome: draft.biome,
      height: clamp(draft.height + (rand() - 0.5) * 0.18, 0.05, 0.98),
    };
    region.location_ids.push(location.id);
    if (faction) {
      const owner = factions.find((item) => item.id === faction);
      if (owner) owner.controlled_location_ids = [...new Set([...owner.controlled_location_ids, location.id])];
    }
    return location;
  });
}

function locationTemplates(seed: WorldSeed): LocationTemplate[] {
  const isScifi = seed.genre.includes("科幻");
  const isModern = seed.genre.includes("现代");
  return [
    { id: "loc_start", name: isScifi ? "黑石站" : isModern ? "黑石街区" : "黑石镇", type: isScifi ? "station" : isModern ? "district" : "town", biomeHints: ["temperate_grassland", "coast"], known: true, tags: ["safe", "market"] },
    { id: "loc_forest", name: isScifi ? "雾林穹顶" : "雾松林", type: isScifi ? "bio_dome" : "forest", biomeHints: ["forest", "wetland"], known: true, tags: ["wild", "mist"] },
    { id: "loc_ruin", name: isScifi ? "白塔禁区" : "白塔遗迹", type: isScifi ? "restricted_zone" : "ruin", biomeHints: ["highland", "mountain"], known: true, tags: ["ancient", "danger"] },
    { id: "loc_harbor", name: isScifi ? "银潮轨道港" : "银潮港", type: isScifi ? "orbital_harbor" : "harbor", biomeHints: ["coast"], known: false, tags: ["trade", "coast"] },
    { id: "loc_mountain", name: "裂冠山口", type: "pass", biomeHints: ["mountain", "highland"], known: false, tags: ["cold", "frontier"] },
    { id: "loc_marsh", name: "烛沼驿站", type: "outpost", biomeHints: ["wetland", "forest"], known: false, tags: ["wetland", "rumor"] },
    { id: "loc_border", name: isScifi ? "赤砂隔离门" : "赤砂关", type: isScifi ? "checkpoint" : "border_fort", biomeHints: ["desert", "tundra"], known: false, tags: ["frontier", "sealed"] },
  ];
}

function pickRegion(template: LocationTemplate, regions: MapRegion[], drafts: RegionDraft[], index: number): MapRegion {
  const scored = regions
    .map((region) => {
      const draft = drafts.find((item) => item.id === region.id)!;
      const biomeScore = template.biomeHints.includes(draft.biome) ? 10 : template.biomeHints.includes(region.biome as BiomeKey) ? 8 : 0;
      const habitability = BIOMES[draft.biome].habitability * 2;
      const crowdingPenalty = region.location_ids.length * 1.8;
      return { region, score: biomeScore + habitability - crowdingPenalty - Math.abs(index - regions.indexOf(region)) * 0.05 };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.region ?? regions[index % regions.length];
}

function burgPosition(center: { x: number; y: number }, region: RegionDraft, rand: () => number): { x: number; y: number } {
  const coastPull = region.biome === "coast" ? 0.05 : 0;
  const mountainOffset = region.biome === "mountain" ? -0.03 : 0;
  return {
    x: clamp(center.x + (rand() - 0.5) * 0.095 + coastPull, 0.07, 0.93),
    y: clamp(center.y + (rand() - 0.5) * 0.095 + mountainOffset, 0.08, 0.92),
  };
}

function regionDescription(region: RegionDraft, seed: WorldSeed): string {
  return `${region.name}是${seed.world_name || "这个世界"}创世地图中的${region.type}地区，生态为${BIOMES[region.biome].label}，高度、气候和边界在创建世界时已锁定。`;
}

function locationDescription(template: LocationTemplate, region: MapRegion, draft: RegionDraft, seed: WorldSeed): string {
  const tone = seed.tone ? `${seed.tone}基调` : "冒险基调";
  const habitability = BIOMES[draft.biome].habitability >= 0.6 ? "适合聚居" : "通行成本较高";
  const lore = starterLocationLore(template.id);
  return `${lore}${template.name}位于${region.name}，是${region.type}内的${template.type}地点。创世生成器判定这里${habitability}，承载${tone}的早期线索；后续只能改变可见性、状态标签、事件和玩家备注。`;
}

function starterLocationLore(id: string): string {
  const lore: Record<string, string> = {
    loc_start: "边境贸易镇的公告板上反复出现陌生徽记。",
    loc_forest: "雾气常年不散，旧路标指向一处被遗忘的驿站。",
    loc_ruin: "塔身只剩半截，墙面刻着和公告板相似的徽记。",
    loc_harbor: "商船和密探都在这里交换消息。",
  };
  return lore[id] ? `${lore[id]}` : "";
}

function buildAzgaarRoutes(locations: Location[], regions: RegionDraft[], rand: () => number): MapRoute[] {
  const candidates = routeCandidates(locations, regions);
  const routes: MapRoute[] = [];
  const forcedPairs = [
    ["loc_start", "loc_forest"],
    ["loc_start", "loc_ruin"],
  ] as const;
  forcedPairs.forEach(([from, to]) => {
    const candidate = candidates.find((item) => item.key === routePairKey(from, to));
    if (candidate) addRouteFromCandidate(routes, candidate, rand);
  });

  const connected = new Set<string>(routes.flatMap((route) => [route.from_location_id, route.to_location_id]));
  while (connected.size < locations.length) {
    const candidate = candidates.find((item) => !hasRoute(routes, item.from.id, item.to.id) && (connected.has(item.from.id) || connected.has(item.to.id)));
    if (!candidate) break;
    addRouteFromCandidate(routes, candidate, rand);
    connected.add(candidate.from.id);
    connected.add(candidate.to.id);
  }

  candidates
    .filter((candidate) => !hasRoute(routes, candidate.from.id, candidate.to.id))
    .slice(0, 2)
    .forEach((candidate) => addRouteFromCandidate(routes, candidate, rand));

  return routes.map((route, index) => ({ ...route, id: makeId("route", index + 1) }));
}

function routeCandidates(locations: Location[], regions: RegionDraft[]): Array<{ key: string; from: Location; to: Location; cost: number }> {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const candidates: Array<{ key: string; from: Location; to: Location; cost: number }> = [];
  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      const from = locations[i];
      const to = locations[j];
      const fromRegion = from.region_id ? regionById.get(from.region_id) : undefined;
      const toRegion = to.region_id ? regionById.get(to.region_id) : undefined;
      const biomeCost = ((fromRegion ? BIOMES[fromRegion.biome].cost : 1) + (toRegion ? BIOMES[toRegion.biome].cost : 1)) / 2;
      const heightCost = Math.abs((from.height ?? 0.4) - (to.height ?? 0.4)) * 1.4;
      const distanceCost = distance(from.position, to.position) * biomeCost;
      candidates.push({ key: routePairKey(from.id, to.id), from, to, cost: distanceCost + heightCost });
    }
  }
  return candidates.sort((a, b) => a.cost - b.cost);
}

function addRouteFromCandidate(routes: MapRoute[], candidate: { from: Location; to: Location; cost: number }, rand: () => number): void {
  if (hasRoute(routes, candidate.from.id, candidate.to.id)) return;
  const type = routeType(candidate.from, candidate.to);
  routes.push({
    id: "",
    from_location_id: candidate.from.id,
    to_location_id: candidate.to.id,
    name: routeName(candidate.from, candidate.to, type),
    type,
    danger: clamp(0.12 + candidate.cost * 0.58 + rand() * 0.08, 0.12, 0.86),
  });
}

function routeType(from: Location, to: Location): string {
  const biomes = new Set([from.biome, to.biome]);
  if (biomes.has("mountain")) return "mountain_pass";
  if (biomes.has("wetland") || biomes.has("forest")) return "trail";
  if (biomes.has("coast")) return "trade";
  return "road";
}

function routeName(from: Location, to: Location, type: string): string {
  const fixed: Record<string, string> = {
    [routePairKey("loc_start", "loc_forest")]: "雾林旧道",
    [routePairKey("loc_start", "loc_ruin")]: "白塔石径",
    [routePairKey("loc_ruin", "loc_harbor")]: "银潮商路",
    [routePairKey("loc_forest", "loc_marsh")]: "苔灯小径",
    [routePairKey("loc_ruin", "loc_mountain")]: "裂冠古阶",
  };
  const key = routePairKey(from.id, to.id);
  if (fixed[key]) return fixed[key];
  const suffix = type === "mountain_pass" ? "山径" : type === "trail" ? "小径" : type === "trade" ? "商路" : "大道";
  return `${from.name.slice(0, 2)}-${to.name.slice(0, 2)}${suffix}`;
}

function connectRouteEndpoints(locations: Location[], routes: MapRoute[]): void {
  for (const route of routes) {
    const from = locations.find((location) => location.id === route.from_location_id);
    const to = locations.find((location) => location.id === route.to_location_id);
    if (!from || !to) continue;
    from.connected_location_ids = [...new Set([...from.connected_location_ids, to.id])];
    to.connected_location_ids = [...new Set([...to.connected_location_ids, from.id])];
  }
}

function hasRoute(routes: MapRoute[], from: string, to: string): boolean {
  const key = routePairKey(from, to);
  return routes.some((route) => routePairKey(route.from_location_id, route.to_location_id) === key);
}

function routePairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function seededRandom(seed: string): () => number {
  let state = Number.parseInt(seed.slice(0, 8), 16) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

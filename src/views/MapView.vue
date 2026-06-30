<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Plus, Route, ZoomIn, ZoomOut } from "lucide-vue-next";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const zoom = ref(1);
const revealUnknown = ref(false);
const selectedId = ref("");
const draft = reactive({ name: "新地点", type: "town", description: "玩家手动标注的新地点。", x: 0.5, y: 0.5 });
const selectedLocation = computed(() => world.locations.find((location) => location.id === selectedId.value) ?? world.current);
const mapLocations = computed(() => world.visibleMapLocations(revealUnknown.value));

async function addLocation() {
  await world.createLocation(draft.name, draft.type, draft.description, { x: Number(draft.x), y: Number(draft.y) });
  draft.name = "新地点";
}
</script>

<template>
  <section v-if="world.hasWorld" class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div class="e-panel overflow-hidden p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-2xl font-semibold">地图</h1>
        <div class="flex gap-2">
          <button class="e-btn" type="button" @click="zoom = Math.max(0.7, zoom - 0.15)"><ZoomOut :size="16" /></button>
          <button class="e-btn" type="button" @click="zoom = Math.min(1.8, zoom + 0.15)"><ZoomIn :size="16" /></button>
          <button class="e-btn" type="button" @click="revealUnknown = !revealUnknown">{{ revealUnknown ? "隐藏未知" : "显示未知" }}</button>
        </div>
      </div>
      <div class="overflow-auto rounded-md border border-white/10 bg-[#18201e]">
        <svg :width="960 * zoom" :height="640 * zoom" viewBox="0 0 960 640" class="block min-w-full">
          <defs>
            <linearGradient id="terrain" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#264b45" />
              <stop offset="48%" stop-color="#5f6942" />
              <stop offset="100%" stop-color="#2e5867" />
            </linearGradient>
          </defs>
          <rect width="960" height="640" fill="url(#terrain)" />
          <path d="M120 530 C220 420 330 500 430 390 C560 250 690 320 810 160" fill="none" stroke="#84c5d6" stroke-width="8" opacity="0.42" />
          <g v-for="route in world.world.map_routes" :key="route.id">
            <line
              :x1="(world.locations.find((l) => l.id === route.from_location_id)?.position.x ?? 0.5) * 960"
              :y1="(world.locations.find((l) => l.id === route.from_location_id)?.position.y ?? 0.5) * 640"
              :x2="(world.locations.find((l) => l.id === route.to_location_id)?.position.x ?? 0.5) * 960"
              :y2="(world.locations.find((l) => l.id === route.to_location_id)?.position.y ?? 0.5) * 640"
              stroke="#f2d58b"
              stroke-width="4"
              opacity="0.74"
            />
          </g>
          <g v-for="location in mapLocations" :key="location.id" class="cursor-pointer" @click="selectedId = location.id">
            <circle :cx="location.position.x * 960" :cy="location.position.y * 640" r="13" :fill="location.id === world.current?.id ? '#34d399' : location.known_to_player ? '#f8fafc' : '#94a3b8'" stroke="#111817" stroke-width="4" />
            <text :x="location.position.x * 960 + 18" :y="location.position.y * 640 + 5" fill="#fff" font-size="20">{{ location.name }}</text>
          </g>
        </svg>
      </div>
    </div>
    <aside class="space-y-5">
      <div class="e-panel p-5">
        <div class="font-medium">{{ selectedLocation?.name }}</div>
        <p class="e-muted mt-2 text-sm leading-6">{{ selectedLocation?.description }}</p>
        <div class="mt-4 flex gap-2">
          <button v-if="selectedLocation" class="e-btn e-btn-primary" type="button" @click="world.goToLocation(selectedLocation.id)">移动到此处</button>
          <button v-if="selectedLocation && world.current" class="e-btn" type="button" @click="world.createRoute(world.current.id, selectedLocation.id)"><Route :size="16" />添加路线</button>
        </div>
      </div>
      <div class="e-panel p-5">
        <div class="mb-3 flex items-center gap-2 font-medium"><Plus :size="16" />添加标记</div>
        <div class="space-y-3">
          <input v-model="draft.name" class="e-field" placeholder="地点名称" />
          <input v-model="draft.type" class="e-field" placeholder="类型" />
          <textarea v-model="draft.description" class="e-field min-h-20" placeholder="描述" />
          <div class="grid grid-cols-2 gap-2">
            <input v-model.number="draft.x" class="e-field" type="number" min="0.05" max="0.95" step="0.01" />
            <input v-model.number="draft.y" class="e-field" type="number" min="0.05" max="0.95" step="0.01" />
          </div>
          <button class="e-btn e-btn-primary w-full" type="button" @click="addLocation">保存标记</button>
        </div>
      </div>
    </aside>
  </section>
</template>

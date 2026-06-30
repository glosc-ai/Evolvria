<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Plus, Route, ZoomIn, ZoomOut } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
    <Card class="overflow-hidden">
      <CardHeader>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>地图</CardTitle>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" type="button" aria-label="缩小地图" @click="zoom = Math.max(0.7, zoom - 0.15)"><ZoomOut /></Button>
          <Button variant="outline" size="sm" type="button" aria-label="放大地图" @click="zoom = Math.min(1.8, zoom + 0.15)"><ZoomIn /></Button>
          <Field orientation="horizontal" class="w-auto gap-2">
            <Switch id="reveal-unknown" v-model="revealUnknown" />
            <FieldLabel for="reveal-unknown">{{ revealUnknown ? "隐藏未知" : "显示未知" }}</FieldLabel>
          </Field>
        </div>
      </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
    <aside class="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{{ selectedLocation?.name }}</CardTitle>
        </CardHeader>
        <CardContent>
        <p class="text-muted-foreground text-sm leading-6">{{ selectedLocation?.description }}</p>
        <div class="mt-4 flex gap-2">
          <Button v-if="selectedLocation" type="button" @click="world.goToLocation(selectedLocation.id)">移动到此处</Button>
          <Button v-if="selectedLocation && world.current" variant="outline" type="button" @click="world.createRoute(world.current.id, selectedLocation.id)">
            <Route data-icon="inline-start" />
            添加路线
          </Button>
        </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2"><Plus class="size-4" />添加标记</CardTitle>
        </CardHeader>
        <CardContent>
        <FieldGroup class="gap-3">
          <Field>
            <FieldLabel for="map-location-name">地点名称</FieldLabel>
            <Input id="map-location-name" v-model="draft.name" placeholder="地点名称" />
          </Field>
          <Field>
            <FieldLabel for="map-location-type">类型</FieldLabel>
            <Input id="map-location-type" v-model="draft.type" placeholder="类型" />
          </Field>
          <Field>
            <FieldLabel for="map-location-description">描述</FieldLabel>
            <Textarea id="map-location-description" v-model="draft.description" class="min-h-20" placeholder="描述" />
          </Field>
          <FieldGroup class="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel for="map-location-x">X</FieldLabel>
              <Input id="map-location-x" v-model.number="draft.x" type="number" min="0.05" max="0.95" step="0.01" />
            </Field>
            <Field>
              <FieldLabel for="map-location-y">Y</FieldLabel>
              <Input id="map-location-y" v-model.number="draft.y" type="number" min="0.05" max="0.95" step="0.01" />
            </Field>
          </FieldGroup>
          <Button class="w-full" type="button" @click="addLocation">保存标记</Button>
        </FieldGroup>
        </CardContent>
      </Card>
    </aside>
  </section>
</template>

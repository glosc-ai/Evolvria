<script setup lang="ts">
import { computed, ref } from "vue";
import { LockKeyhole, ZoomIn, ZoomOut } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const zoom = ref(1);
const revealUnknown = ref(false);
const selectedId = ref("");
const selectedLocation = computed(() => world.locations.find((location) => location.id === selectedId.value) ?? world.current);
const mapLocations = computed(() => world.visibleMapLocations(revealUnknown.value));
const selectedRegion = computed(() => world.world.map_regions?.find((region) => region.id === selectedLocation.value?.region_id));
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
      <div class="overflow-auto rounded-md border border-border" :style="{ backgroundColor: 'var(--map-bg)' }">
        <svg :width="960 * zoom" :height="640 * zoom" viewBox="0 0 960 640" class="block min-w-full">
          <defs>
            <linearGradient id="terrain" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" :stop-color="'var(--map-terrain-1)'" />
              <stop offset="48%" :stop-color="'var(--map-terrain-2)'" />
              <stop offset="100%" :stop-color="'var(--map-terrain-3)'" />
            </linearGradient>
          </defs>
          <rect width="960" height="640" fill="url(#terrain)" />
          <g v-for="region in world.world.map_regions ?? []" :key="region.id" opacity="0.28">
            <ellipse :cx="region.center.x * 960" :cy="region.center.y * 640" rx="150" ry="92" :fill="region.color" />
          </g>
          <path d="M120 530 C220 420 330 500 430 390 C560 250 690 320 810 160" fill="none" stroke="var(--map-river)" stroke-width="8" opacity="0.42" />
          <g v-for="route in world.world.map_routes ?? []" :key="route.id">
            <line
              :x1="(world.locations.find((l) => l.id === route.from_location_id)?.position.x ?? 0.5) * 960"
              :y1="(world.locations.find((l) => l.id === route.from_location_id)?.position.y ?? 0.5) * 640"
              :x2="(world.locations.find((l) => l.id === route.to_location_id)?.position.x ?? 0.5) * 960"
              :y2="(world.locations.find((l) => l.id === route.to_location_id)?.position.y ?? 0.5) * 640"
              stroke="var(--map-route)"
              stroke-width="4"
              opacity="0.74"
            />
          </g>
          <g v-for="location in mapLocations" :key="location.id" class="cursor-pointer" @click="selectedId = location.id">
            <circle :cx="location.position.x * 960" :cy="location.position.y * 640" r="13" :fill="location.id === world.current?.id ? 'var(--map-node-current)' : location.known_to_player ? 'var(--map-node-known)' : 'var(--map-node-unknown)'" stroke="var(--map-node-stroke)" stroke-width="4" />
            <text :x="location.position.x * 960 + 18" :y="location.position.y * 640 + 5" fill="var(--map-label)" font-size="20">{{ location.name }}</text>
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
        <div class="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{{ selectedRegion?.name ?? "未知地区" }}</Badge>
          <Badge variant="outline">{{ selectedLocation?.type }}</Badge>
        </div>
        <p class="text-muted-foreground text-sm leading-6">{{ selectedLocation?.description }}</p>
        <p v-if="selectedRegion" class="mt-3 text-muted-foreground text-sm leading-6">{{ selectedRegion.description }}</p>
        <div class="mt-4 flex gap-2">
          <Button v-if="selectedLocation" type="button" @click="world.goToLocation(selectedLocation.id)">移动到此处</Button>
        </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2"><LockKeyhole class="size-4" />创世结构已锁定</CardTitle>
        </CardHeader>
        <CardContent>
        <p class="text-muted-foreground text-sm leading-6">
          地区、地点和路线只在创建世界时由 Azgaar/Fantasy-Map-Generator 风格程序生成。后续探索可以改变地点状态、笔记和可见性，但不能新增或重绘地图结构。
        </p>
        </CardContent>
      </Card>
    </aside>
  </section>
</template>

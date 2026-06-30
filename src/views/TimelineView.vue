<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const typeFilter = ref("");
const characterFilter = ref("");
const locationFilter = ref("");
const visibleCount = ref(20);
const events = computed(() => world.filteredTimeline(typeFilter.value, characterFilter.value, locationFilter.value).slice().reverse());
const visibleEvents = computed(() => events.value.slice(0, visibleCount.value));
const eventTypes = computed(() => Array.from(new Set(world.timeline.map((event) => event.type))));
</script>

<template>
  <section v-if="world.hasWorld">
    <h1 class="text-2xl font-semibold">时间线</h1>
    <div class="e-panel mt-5 grid gap-3 p-4 md:grid-cols-4">
      <select v-model="typeFilter" class="e-field"><option value="">全部类型</option><option v-for="type in eventTypes" :key="type" :value="type">{{ type }}</option></select>
      <select v-model="characterFilter" class="e-field"><option value="">全部角色</option><option v-for="character in world.characters" :key="character.id" :value="character.id">{{ character.name }}</option></select>
      <select v-model="locationFilter" class="e-field"><option value="">全部地点</option><option v-for="location in world.locations" :key="location.id" :value="location.id">{{ location.name }}</option></select>
      <button class="e-btn" type="button" @click="typeFilter = ''; characterFilter = ''; locationFilter = ''">清除筛选</button>
    </div>
    <div class="mt-5 space-y-3">
      <article v-for="event in visibleEvents" :key="event.id" class="e-panel p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="font-medium">{{ event.title }}</div>
          <div class="e-muted text-xs">第 {{ event.world_time.day }} 天 {{ event.world_time.hour }} 时 · {{ event.type }}</div>
        </div>
        <p class="mt-2 text-sm leading-6 text-white/70">{{ event.description }}</p>
        <div v-if="event.outcome" class="mt-3 rounded-md bg-black/20 p-3 text-xs text-white/60">{{ event.outcome_reason }} {{ event.consequence }}</div>
      </article>
    </div>
    <button v-if="visibleCount < events.length" class="e-btn mt-4 w-full" type="button" @click="visibleCount += 20">加载更多</button>
  </section>
</template>

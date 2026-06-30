<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Select from "@/components/ui/Select.vue";
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
    <Card class="mt-5 grid gap-3 p-4 md:grid-cols-4">
      <Select
        v-model="typeFilter"
        :options="[{ label: '全部类型', value: '' }, ...(eventTypes.map(type => ({ label: type, value: type })) || [])]"
      />
      <Select
        v-model="characterFilter"
        :options="[{ label: '全部角色', value: '' }, ...(world.characters.map(c => ({ label: c.name, value: c.id })) || [])]"
      />
      <Select
        v-model="locationFilter"
        :options="[{ label: '全部地点', value: '' }, ...(world.locations.map(l => ({ label: l.name, value: l.id })) || [])]"
      />
      <Button variant="outline" type="button" @click="typeFilter = ''; characterFilter = ''; locationFilter = ''">清除筛选</Button>
    </Card>
    <div class="mt-5 space-y-3">
      <Card v-for="event in visibleEvents" :key="event.id" class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="font-medium">{{ event.title }}</div>
          <div class="text-muted-foreground text-xs">第 {{ event.world_time.day }} 天 {{ event.world_time.hour }} 时 · {{ event.type }}</div>
        </div>
        <p class="mt-2 text-sm leading-6 text-white/70">{{ event.description }}</p>
        <div v-if="event.outcome" class="mt-3 rounded-md bg-black/20 p-3 text-xs text-white/60">{{ event.outcome_reason }} {{ event.consequence }}</div>
      </Card>
    </div>
    <Button v-if="visibleCount < events.length" class="mt-4 w-full" type="button" @click="visibleCount += 20">加载更多</Button>
  </section>
</template>

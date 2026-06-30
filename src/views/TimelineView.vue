<script setup lang="ts">
import { computed, ref } from "vue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import AppSelect from "@/components/AppSelect.vue";
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
    <h1 class="font-serif text-2xl font-semibold">时间线</h1>
    <Card class="mt-5">
      <CardContent class="grid gap-3 md:grid-cols-4">
        <Field>
          <FieldLabel class="sr-only">类型筛选</FieldLabel>
          <AppSelect
            v-model="typeFilter"
            :options="[{ label: '全部类型', value: '' }, ...(eventTypes.map(type => ({ label: type, value: type })) || [])]"
          />
        </Field>
        <Field>
          <FieldLabel class="sr-only">角色筛选</FieldLabel>
          <AppSelect
            v-model="characterFilter"
            :options="[{ label: '全部角色', value: '' }, ...(world.characters.map(c => ({ label: c.name, value: c.id })) || [])]"
          />
        </Field>
        <Field>
          <FieldLabel class="sr-only">地点筛选</FieldLabel>
          <AppSelect
            v-model="locationFilter"
            :options="[{ label: '全部地点', value: '' }, ...(world.locations.map(l => ({ label: l.name, value: l.id })) || [])]"
          />
        </Field>
        <Button variant="outline" type="button" @click="typeFilter = ''; characterFilter = ''; locationFilter = ''">清除筛选</Button>
      </CardContent>
    </Card>
    <div class="mt-5 flex flex-col gap-3">
      <Card v-for="event in visibleEvents" :key="event.id">
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{{ event.title }}</CardTitle>
            <Badge variant="secondary">第 {{ event.world_time.day }} 天 {{ event.world_time.hour }} 时 · {{ event.type }}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-sm leading-6 text-muted-foreground">{{ event.description }}</p>
          <Alert v-if="event.outcome" class="mt-3">
            <AlertDescription>{{ event.outcome_reason }} {{ event.consequence }}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
    <Empty v-if="visibleEvents.length === 0" class="mt-6">
      <EmptyHeader>
        <EmptyTitle>没有时间线事件</EmptyTitle>
        <EmptyDescription>清除筛选或继续行动后再查看。</EmptyDescription>
      </EmptyHeader>
    </Empty>
    <Button v-if="visibleCount < events.length" class="mt-4 w-full" type="button" @click="visibleCount += 20">加载更多</Button>
  </section>
</template>

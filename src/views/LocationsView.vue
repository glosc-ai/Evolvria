<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const notes = ref<Record<string, string>>({});
</script>

<template>
  <section v-if="world.hasWorld">
    <h1 class="mb-5 text-2xl font-semibold">地点</h1>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card v-for="location in world.locations" :key="location.id" class="p-4">
        <div class="flex items-start justify-between gap-3">
          <div><h2 class="text-lg font-medium">{{ location.name }}</h2><p class="text-muted-foreground text-sm">{{ location.type }} · {{ location.biome || '未知生态' }}</p></div>
          <span class="rounded px-2 py-1 text-xs" :class="location.known_to_player ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/8 text-white/52'">{{ location.known_to_player ? "已知" : "听闻" }}</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-white/70">{{ location.description }}</p>
        <Textarea v-model="notes[location.id]" class="mt-4 min-h-20" :placeholder="location.player_notes || '地点备注'" />
        <div class="mt-2 flex gap-2">
          <Button class="flex-1" type="button" variant="outline" @click="world.editLocationNote(location.id, notes[location.id] ?? '')">保存备注</Button>
          <Button class="flex-1" type="button" @click="world.goToLocation(location.id)">前往</Button>
        </div>
      </Card>
    </div>
  </section>
</template>

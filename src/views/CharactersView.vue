<script setup lang="ts">
import { ref } from "vue";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const filter = ref("全部");
const notes = ref<Record<string, string>>({});
</script>

<template>
  <section v-if="world.hasWorld">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">人物名册</h1>
      <select v-model="filter" class="e-field max-w-44"><option>全部</option><option>同行</option><option>仅听闻</option><option>敌对/竞争</option></select>
    </div>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="character in world.filteredCharacters(filter)" :key="character.id" class="e-panel p-4">
        <div class="flex items-start justify-between gap-3">
          <div><h2 class="text-lg font-medium">{{ character.name }}</h2><p class="e-muted text-sm">{{ character.role }} · {{ character.status }}</p></div>
          <span v-if="character.companion" class="rounded bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200">同行</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-white/70">{{ character.description }}</p>
        <div class="mt-3 flex flex-wrap gap-2"><span v-for="tag in character.personality" :key="tag" class="rounded bg-white/8 px-2 py-1 text-xs">{{ tag }}</span></div>
        <textarea v-model="notes[character.id]" class="e-field mt-4 min-h-20" :placeholder="character.player_notes || '玩家备注'" />
        <button class="e-btn mt-2 w-full" type="button" @click="world.editCharacterNote(character.id, notes[character.id] ?? '')">保存备注</button>
      </article>
    </div>
  </section>
</template>

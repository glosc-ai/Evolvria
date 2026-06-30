<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import AppSelect from "@/components/AppSelect.vue";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const filter = ref("全部");
const notes = ref<Record<string, string>>({});
</script>

<template>
  <section v-if="world.hasWorld">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">人物名册</h1>
      <AppSelect
        v-model="filter"
        :options="[
          { label: '全部', value: '全部' },
          { label: '同行', value: '同行' },
          { label: '仅听闻', value: '仅听闻' },
          { label: '敌对/竞争', value: '敌对/竞争' }
        ]"
        class="max-w-44"
      />
    </div>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card v-for="character in world.filteredCharacters(filter)" :key="character.id" class="p-4">
        <div class="flex items-start justify-between gap-3">
          <div><h2 class="text-lg font-medium">{{ character.name }}</h2><p class="text-muted-foreground text-sm">{{ character.role }} · {{ character.status }}</p></div>
          <span v-if="character.companion" class="rounded bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200">同行</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-white/70">{{ character.description }}</p>
        <div class="mt-3 flex flex-wrap gap-2"><span v-for="tag in character.personality" :key="tag" class="rounded bg-white/8 px-2 py-1 text-xs">{{ tag }}</span></div>
        <Textarea v-model="notes[character.id]" class="mt-4 min-h-20" :placeholder="character.player_notes || '玩家备注'" />
        <Button class="mt-2 w-full" type="button" @click="world.editCharacterNote(character.id, notes[character.id] ?? '')">保存备注</Button>
      </Card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import AppSelect from "@/components/AppSelect.vue";
import { useWorldStore } from "@/stores/world";
import { ImagePlus, Save, WandSparkles } from "lucide-vue-next";

const world = useWorldStore();
const filter = ref("全部");
const notes = ref<Record<string, string>>({});
const descriptions = ref<Record<string, string>>({});
const appearances = ref<Record<string, string>>({});
const filteredCharacters = computed(() => world.filteredCharacters(filter.value));

function initials(name: string): string {
  return name.trim().charAt(0) || "？";
}

async function regenerateImage(characterId: string): Promise<void> {
  await world.regenerateCharacterImage(characterId, appearances.value[characterId] ?? "");
  const updated = world.characters.find((character) => character.id === characterId);
  if (updated?.appearance_description) {
    appearances.value[characterId] = updated.appearance_description;
  }
}

watchEffect(() => {
  for (const character of world.characters) {
    notes.value[character.id] ??= character.player_notes;
    descriptions.value[character.id] ??= character.description;
    appearances.value[character.id] ??= character.appearance_description || "";
  }
});
</script>

<template>
  <section v-if="world.hasWorld">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-serif text-2xl font-semibold">人物名册</h1>
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
      <Card v-for="character in filteredCharacters" :key="character.id">
        <CardHeader>
          <div class="flex items-start gap-4">
            <div class="relative size-24 shrink-0 overflow-hidden rounded-md border bg-muted">
              <img v-if="character.portrait_image_url" :src="character.portrait_image_url" :alt="`${character.name}形象`" class="size-full object-cover" />
              <div v-else class="flex size-full items-center justify-center bg-secondary text-3xl font-semibold text-secondary-foreground">
                {{ initials(character.name) }}
              </div>
            </div>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <CardTitle>{{ character.name }}</CardTitle>
                <Badge v-if="character.companion">同行</Badge>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">{{ character.role }} · {{ character.gender || "未指定" }} · {{ character.status }}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <Field>
            <FieldLabel :for="`description-${character.id}`">角色描述</FieldLabel>
            <Textarea :id="`description-${character.id}`" v-model="descriptions[character.id]" class="min-h-20" />
          </Field>
          <Field>
            <FieldLabel :for="`appearance-${character.id}`">外貌描述</FieldLabel>
            <Textarea
              :id="`appearance-${character.id}`"
              v-model="appearances[character.id]"
              class="min-h-24"
              placeholder="发型、五官、服装、配饰、体态、气质；留空时会根据角色信息自动补全"
            />
          </Field>
          <div class="mt-3 flex flex-wrap gap-2">
            <Badge v-for="tag in character.personality" :key="tag" variant="secondary">{{ tag }}</Badge>
          </div>
          <Field>
            <FieldLabel :for="`note-${character.id}`">玩家备注</FieldLabel>
            <Textarea :id="`note-${character.id}`" v-model="notes[character.id]" class="min-h-20" :placeholder="character.player_notes || '玩家备注'" />
          </Field>
        </CardContent>
        <CardFooter class="grid gap-2 sm:grid-cols-3">
          <Button variant="outline" type="button" @click="world.editCharacterProfile(character.id, descriptions[character.id] ?? '', appearances[character.id] ?? '')">
            <Save data-icon="inline-start" />
            保存卡片
          </Button>
          <Button variant="outline" type="button" @click="world.editCharacterNote(character.id, notes[character.id] ?? '')">
            <Save data-icon="inline-start" />
            保存备注
          </Button>
          <Button type="button" :disabled="world.busy" @click="regenerateImage(character.id)">
            <WandSparkles v-if="world.busy" data-icon="inline-start" />
            <ImagePlus v-else data-icon="inline-start" />
            {{ character.portrait_image_url ? "重绘形象" : "生成形象" }}
          </Button>
        </CardFooter>
      </Card>
    </div>
    <Empty v-if="filteredCharacters.length === 0" class="mt-6">
      <EmptyHeader>
        <EmptyTitle>没有符合条件的人物</EmptyTitle>
        <EmptyDescription>调整筛选后再查看。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </section>
</template>

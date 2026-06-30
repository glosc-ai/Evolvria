<script setup lang="ts">
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import AppSelect from "@/components/AppSelect.vue";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const filter = ref("全部");
const notes = ref<Record<string, string>>({});
const filteredCharacters = computed(() => world.filteredCharacters(filter.value));

function initials(name: string): string {
  return name.trim().charAt(0) || "？";
}
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
          <div class="flex items-start gap-3">
            <Avatar class="size-11">
              <AvatarFallback>{{ initials(character.name) }}</AvatarFallback>
            </Avatar>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <CardTitle>{{ character.name }}</CardTitle>
                <Badge v-if="character.companion">同行</Badge>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">{{ character.role }} · {{ character.gender || "未指定" }} · {{ character.status }}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-sm leading-6 text-muted-foreground">{{ character.description }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Badge v-for="tag in character.personality" :key="tag" variant="secondary">{{ tag }}</Badge>
          </div>
          <Field class="mt-4">
            <FieldLabel :for="`note-${character.id}`">玩家备注</FieldLabel>
            <Textarea :id="`note-${character.id}`" v-model="notes[character.id]" class="min-h-20" :placeholder="character.player_notes || '玩家备注'" />
          </Field>
        </CardContent>
        <CardFooter>
          <Button class="w-full" type="button" @click="world.editCharacterNote(character.id, notes[character.id] ?? '')">保存备注</Button>
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

<script setup lang="ts">
import { ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
const notes = ref<Record<string, string>>({});
</script>

<template>
  <section v-if="world.hasWorld">
    <h1 class="mb-5 text-2xl font-semibold">地点</h1>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card v-for="location in world.locations" :key="location.id">
        <CardHeader>
          <div class="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{{ location.name }}</CardTitle>
              <p class="text-muted-foreground text-sm">{{ location.type }} · {{ location.biome || '未知生态' }}</p>
            </div>
            <Badge :variant="location.known_to_player ? 'default' : 'secondary'">{{ location.known_to_player ? "已知" : "听闻" }}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-sm leading-6 text-muted-foreground">{{ location.description }}</p>
          <Field class="mt-4">
            <FieldLabel :for="`location-note-${location.id}`">地点备注</FieldLabel>
            <Textarea :id="`location-note-${location.id}`" v-model="notes[location.id]" class="min-h-20" :placeholder="location.player_notes || '地点备注'" />
          </Field>
        </CardContent>
        <CardFooter class="gap-2">
          <Button class="flex-1" type="button" variant="outline" @click="world.editLocationNote(location.id, notes[location.id] ?? '')">保存备注</Button>
          <Button class="flex-1" type="button" @click="world.goToLocation(location.id)">前往</Button>
        </CardFooter>
      </Card>
    </div>
    <Empty v-if="world.locations.length === 0" class="mt-6">
      <EmptyHeader>
        <EmptyTitle>还没有地点</EmptyTitle>
        <EmptyDescription>世界扩写或手动标记后会出现在这里。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </section>
</template>

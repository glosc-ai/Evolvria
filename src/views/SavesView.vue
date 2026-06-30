<script setup lang="ts">
import { Download, RefreshCcw } from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { importWorldFromText, saveWorld } from "@/services/save";
import { useAppStore } from "@/stores/app";
import { useWorldStore } from "@/stores/world";

const app = useAppStore();
const world = useWorldStore();
const importText = ref("");

onMounted(() => world.refreshSaveEntries());

async function exportCurrent() {
  try {
    const path = await world.exportCurrentWorld();
    app.setNotice(`已导出：${path}`);
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "导出失败。");
  }
}

async function importFromText() {
  try {
    const payload = await importWorldFromText(importText.value);
    world.payload = payload;
    await saveWorld(payload);
    await world.refreshSaveEntries();
    app.setNotice("存档已导入。");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "导入失败。");
  }
}
</script>

<template>
  <section>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">存档列表</h1>
      <div class="flex gap-2">
        <button class="e-btn" type="button" @click="world.refreshSaveEntries"><RefreshCcw :size="16" />刷新</button>
        <button class="e-btn e-btn-primary" :disabled="!world.hasWorld" type="button" @click="exportCurrent"><Download :size="16" />导出</button>
      </div>
    </div>
    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <article v-for="entry in world.saveEntries" :key="entry.path" class="e-panel p-4">
        <div class="flex items-start justify-between gap-3">
          <div><div class="font-medium">{{ entry.world_name }}</div><div class="e-muted mt-1 text-sm">{{ entry.kind }} · {{ entry.created_at }}</div></div>
          <span class="rounded px-2 py-1 text-xs" :class="entry.schema_valid ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'">{{ entry.schema_valid ? "schema OK" : "schema 异常" }}</span>
        </div>
        <div class="e-muted mt-3 text-sm">{{ entry.path }} · 事件 {{ entry.event_count }}</div>
      </article>
    </div>
    <div class="e-panel mt-5 p-5">
      <h2 class="font-medium">从 JSON 文本导入</h2>
      <textarea v-model="importText" class="e-field mt-3 min-h-40" placeholder="粘贴导出的 SavePayload JSON" />
      <button class="e-btn mt-3" type="button" @click="importFromText">导入</button>
    </div>
  </section>
</template>

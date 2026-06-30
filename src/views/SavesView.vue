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

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    active: "当前",
    backup: "备份",
    ai_checkpoint: "AI 检查点",
  };
  return labels[kind] ?? kind;
}

function compactPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("localStorage://")) return normalized.replace("localStorage://", "");
  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.at(-1) ?? normalized;
  const parent = parts.at(-2);
  if (parent === "backups" || parent === "saves") return `${parent}/${fileName}`;
  return fileName;
}

async function exportCurrent() {
  try {
    const result = await world.exportCurrentWorld();
    app.setNotice(result.cancelled ? "已取消导出。" : `已导出：${result.path}`);
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
    <div class="e-panel mt-5 overflow-hidden">
      <div class="hidden grid-cols-[minmax(10rem,1fr)_6.5rem_12rem_minmax(12rem,1.2fr)_5rem_6rem] gap-3 border-b border-white/10 px-4 py-3 text-xs text-white/45 lg:grid">
        <div>世界</div>
        <div>类型</div>
        <div>时间</div>
        <div>文件</div>
        <div class="text-right">事件</div>
        <div class="text-right">状态</div>
      </div>
      <div class="divide-y divide-white/10">
        <div v-for="entry in world.saveEntries" :key="entry.path" class="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(10rem,1fr)_6.5rem_12rem_minmax(12rem,1.2fr)_5rem_6rem] lg:items-center lg:gap-3">
          <div class="min-w-0">
            <div class="truncate font-medium">{{ entry.world_name }}</div>
            <div class="e-muted mt-1 lg:hidden">{{ kindLabel(entry.kind) }} · {{ entry.created_at }}</div>
          </div>
          <div class="e-muted hidden lg:block">{{ kindLabel(entry.kind) }}</div>
          <div class="e-muted hidden truncate lg:block" :title="entry.created_at">{{ entry.created_at }}</div>
          <div class="e-muted min-w-0 truncate font-mono text-xs" :title="entry.path">{{ compactPath(entry.path) }}</div>
          <div class="e-muted lg:text-right">事件 {{ entry.event_count }}</div>
          <div class="lg:text-right">
            <span class="inline-flex rounded px-2 py-1 text-xs" :class="entry.schema_valid ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'">{{ entry.schema_valid ? "schema OK" : "schema 异常" }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="e-panel mt-5 p-5">
      <h2 class="font-medium">从 JSON 文本导入</h2>
      <textarea v-model="importText" class="e-field mt-3 min-h-40" placeholder="粘贴导出的 SavePayload JSON" />
      <button class="e-btn mt-3" type="button" @click="importFromText">导入</button>
    </div>
  </section>
</template>

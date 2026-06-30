<script setup lang="ts">
import { Download, FolderOpen, RefreshCcw, Trash2 } from "@lucide/vue";
import { onMounted, ref } from "vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { importWorldFromText, openSaveDirectory, saveWorld } from "@/services/save";
import { useAppStore } from "@/stores/app";
import { usePlatformStore } from "@/stores/platform";
import { useWorldStore } from "@/stores/world";
import type { SaveEntry } from "@/services/save";

const app = useAppStore();
const platform = usePlatformStore();
const world = useWorldStore();
const importText = ref("");
const entryToDelete = ref<SaveEntry | null>(null);

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

async function openDirectory() {
  try {
    await openSaveDirectory();
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "打开存档目录失败。");
  }
}

async function confirmDelete() {
  if (!entryToDelete.value) return;
  try {
    await world.deleteEntry(entryToDelete.value);
    entryToDelete.value = null;
    app.setNotice("存档已删除。");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "删除失败。");
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
        <Button variant="outline" size="sm" type="button" @click="world.refreshSaveEntries">
          <RefreshCcw data-icon="inline-start" />
          刷新
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          :disabled="!platform.capabilities.can_reveal_directories"
          :title="platform.capabilities.can_reveal_directories ? '打开存档所在目录' : '当前运行环境不支持打开目录'"
          @click="openDirectory"
        >
          <FolderOpen data-icon="inline-start" />
          打开目录
        </Button>
        <Button :disabled="!world.hasWorld" type="button" @click="exportCurrent">
          <Download data-icon="inline-start" />
          导出
        </Button>
      </div>
    </div>
    <Card class="mt-5 overflow-hidden">
      <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>世界</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>文件</TableHead>
            <TableHead class="text-right">事件</TableHead>
            <TableHead class="text-right">状态</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="world.saveEntries.length === 0" :colspan="7">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>没有存档</EmptyTitle>
                <EmptyDescription>创建世界或导入 JSON 后会显示在这里。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TableEmpty>
          <TableRow v-for="entry in world.saveEntries" :key="entry.path">
            <TableCell class="min-w-40 font-medium">{{ entry.world_name }}</TableCell>
            <TableCell class="text-muted-foreground">{{ kindLabel(entry.kind) }}</TableCell>
            <TableCell class="text-muted-foreground" :title="entry.created_at">{{ entry.created_at }}</TableCell>
            <TableCell class="max-w-64 truncate font-mono text-xs text-muted-foreground" :title="entry.path">{{ compactPath(entry.path) }}</TableCell>
            <TableCell class="text-right text-muted-foreground">{{ entry.event_count }}</TableCell>
            <TableCell class="text-right">
              <Badge :variant="entry.schema_valid ? 'secondary' : 'destructive'">{{ entry.schema_valid ? "schema OK" : "schema 异常" }}</Badge>
            </TableCell>
            <TableCell class="text-right">
            <Button variant="destructive" size="sm" type="button" title="删除存档" @click="entryToDelete = entry">
              <Trash2 data-icon="inline-start" />
            </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      </CardContent>
    </Card>
    <Card class="mt-5">
      <CardHeader>
        <CardTitle>从 JSON 文本导入</CardTitle>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel for="import-save-json" class="sr-only">SavePayload JSON</FieldLabel>
          <Textarea id="import-save-json" v-model="importText" class="min-h-40" placeholder="粘贴导出的 SavePayload JSON" />
        </Field>
      </CardContent>
      <CardFooter>
        <Button type="button" @click="importFromText">导入</Button>
      </CardFooter>
    </Card>
    <AlertDialog :open="Boolean(entryToDelete)" @update:open="(open) => { if (!open) entryToDelete = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除存档</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除「{{ entryToDelete?.world_name }}」的{{ entryToDelete ? kindLabel(entryToDelete.kind) : "" }}存档吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete">确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Download, RotateCcw, Save, ShieldCheck, Upload } from "lucide-vue-next";
import { useAppStore } from "@/stores/app";

const store = useAppStore();
const importError = ref("");
const packageIssues = computed(() => store.lastPackageReport?.issues ?? []);
const packageErrors = computed(() => packageIssues.value.filter((issue) => issue.severity === "error").length);
const packageWarnings = computed(() => packageIssues.value.filter((issue) => issue.severity === "warning").length);

async function importWorkspace(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importError.value = "";
  try {
    await store.importWorkspaceFile(file);
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  }
  input.value = "";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">Saves</p>
        <h2>Workspace Backups</h2>
      </div>
    </div>

    <div class="page-grid">
      <div class="panel field-grid">
        <div class="field-box">
          <strong>{{ store.envelope.workspace.name }}</strong>
          <span class="muted">Updated {{ new Date(store.envelope.workspace.updatedAt).toLocaleString() }}</span>
          <span class="muted">{{ store.chats.length }} chats / {{ store.storylines.length }} storylines / {{ store.characters.length }} characters</span>
        </div>
        <div class="cluster">
          <button class="secondary-button" @click="store.persist('manual_save')">
            <Save :size="16" />
            Save now
          </button>
          <button class="secondary-button" @click="store.backup('manual')">
            <RotateCcw :size="16" />
            Backup
          </button>
          <button class="primary-button" @click="store.exportCurrentWorkspace()">
            <Download :size="16" />
            Export
          </button>
          <button class="secondary-button" @click="store.verifyCurrentWorkspacePackage()">
            <ShieldCheck :size="16" />
            Verify Package
          </button>
          <label class="ghost-button" style="cursor: pointer">
            <Upload :size="16" />
            Import
            <input type="file" accept="application/json,.json,.zip,.evolvria.zip" hidden @change="importWorkspace" />
          </label>
        </div>
        <p v-if="store.lastExportPath" class="muted">Last export: {{ store.lastExportPath }}</p>
        <p v-if="store.lastBackupMessage" class="muted">{{ store.lastBackupMessage }}</p>
        <p v-if="store.lastImportMessage" class="muted">{{ store.lastImportMessage }}</p>
        <p v-if="importError" class="error-text">
          {{ importError === "zip_import_requires_tauri" ? "Zip import is available in the Tauri desktop app. Browser fallback imports JSON." : importError }}
        </p>
        <div class="field-box">
          <strong>Recoverable backups</strong>
          <span class="muted">Backups are stored in the Tauri workspace. Browser preview keeps fallback copies in localStorage.</span>
          <div v-if="store.backupMetas.length" class="field-grid">
            <div v-for="backup in store.backupMetas.slice(0, 8)" :key="backup.id" class="field-box">
              <strong>{{ backup.reason }} · {{ backup.id }}</strong>
              <span class="muted">
                {{ new Date(backup.createdAt).toLocaleString() }}
                <template v-if="backup.sizeBytes"> · {{ Math.round(backup.sizeBytes / 1024) }} KB</template>
              </span>
              <div class="cluster">
                <button class="secondary-button" type="button" @click="store.restoreWorkspaceFromBackup(backup.id)">
                  <RotateCcw :size="16" />
                  Restore Backup
                </button>
              </div>
            </div>
          </div>
          <span v-else class="muted">No backups yet. Create one before destructive edits or imports.</span>
        </div>
        <div v-if="store.lastPackageReport" class="field-box">
          <strong>Package check {{ store.lastPackageReport.ok ? "passed" : "failed" }}</strong>
          <span class="muted">
            {{ store.lastPackageReport.schemaVersion }} · {{ store.lastPackageReport.format }} ·
            {{ store.lastPackageReport.assetRefs.referenced.length }} referenced assets /
            {{ store.lastPackageReport.assetRefs.missing.length }} missing
          </span>
          <span class="muted">
            {{ packageErrors }} errors · {{ packageWarnings }} warnings ·
            {{ store.lastPackageReport.entityCounts.storylines ?? 0 }} storylines ·
            {{ store.lastPackageReport.entityCounts.messages ?? 0 }} messages
          </span>
          <div v-if="packageIssues.length" class="field-grid">
            <div v-for="issue in packageIssues.slice(0, 6)" :key="`${issue.field}-${issue.message}`" class="field-box">
              <strong>{{ issue.severity }}: {{ issue.field }}</strong>
              <span class="muted">{{ issue.message }}</span>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel field-grid">
        <div>
          <h3>Archived Chats</h3>
          <p class="muted">Archived chats are recoverable and excluded from Continue until restored.</p>
        </div>
        <div v-if="store.archivedChats.length" class="field-grid">
          <div v-for="chat in store.archivedChats" :key="chat.id" class="field-box">
            <strong>{{ chat.title }}</strong>
            <span class="muted">{{ chat.messageIds.length }} messages · archived {{ new Date(chat.updatedAt).toLocaleString() }}</span>
            <div class="cluster">
              <button class="secondary-button" @click="store.restoreChat(chat.id)">
                <RotateCcw :size="16" />
                Restore
              </button>
              <RouterLink class="ghost-button" :to="`/chat/${chat.id}`">Open</RouterLink>
            </div>
          </div>
        </div>
        <div v-else class="field-box">
          <strong>No archived chats</strong>
          <span class="muted">Archive from a Chat session when you want to remove it from active Continue without deleting it.</span>
        </div>
        <div class="field-box">
          <strong>Reset seed</strong>
          <span class="muted">仅用于开发验收。会用原创示例内容覆盖当前浏览器 fallback workspace；Tauri 端也会写入新 seed。</span>
          <button class="danger-button" @click="store.resetToSeed()">Reset to seed</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Database, Download, HardDrive, RotateCcw, Save, Search, ShieldCheck, Upload } from "lucide-vue-next";
import { useAppStore } from "@/stores/app";

const store = useAppStore();
const importError = ref("");
const nativeIndexQuery = ref("星烬");
const assetInventory = computed(() => store.lastAssetInventory);
const assetMaintenancePlan = computed(() => store.lastAssetMaintenancePlan);
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

async function rebuildNativeIndex() {
  await store.rebuildSqliteSearchIndex(nativeIndexQuery.value);
}

async function searchNativeIndex() {
  await store.searchSqliteIndex(nativeIndexQuery.value);
}

function formatBytes(value = 0): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
              <span v-if="backup.hasSqliteIndex" class="muted">
                SQLite index included
                <template v-if="backup.sqliteSizeBytes">
                  · {{ Math.round(backup.sqliteSizeBytes / 1024) }} KB
                </template>
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
        <div class="field-box">
          <strong>Asset Inventory</strong>
          <span class="muted">Desktop scans workspace assets for missing, browser-only and untracked files. Browser preview can inspect metadata only.</span>
          <button class="secondary-button" type="button" @click="store.refreshAssetInventory()">
            <HardDrive :size="16" />
            Refresh Asset Inventory
          </button>
          <p v-if="store.lastAssetInventoryMessage" class="muted">{{ store.lastAssetInventoryMessage }}</p>
          <div v-if="assetInventory" class="field-grid">
            <div class="field-box">
              <strong>{{ assetInventory.stats.declaredAssets }} declared assets</strong>
              <span class="muted">{{ assetInventory.stats.referencedAssets }} referenced · {{ assetInventory.stats.unreferencedAssets }} unreferenced</span>
              <span class="muted">{{ assetInventory.stats.browserOnlyAssets }} browser-only · {{ assetInventory.stats.missingPhysicalAssets }} missing physical</span>
            </div>
            <div class="field-box">
              <strong>{{ formatBytes(assetInventory.stats.physicalBytes || assetInventory.stats.declaredBytes) }}</strong>
              <span class="muted">{{ assetInventory.stats.physicalFiles }} physical files · {{ assetInventory.stats.untrackedFiles }} untracked</span>
              <span class="muted">Declared metadata {{ formatBytes(assetInventory.stats.declaredBytes) }}</span>
            </div>
            <div v-if="assetInventory.missingAssetIds.length" class="field-box">
              <strong>Missing asset ids</strong>
              <span class="muted">{{ assetInventory.missingAssetIds.slice(0, 6).join(", ") }}</span>
            </div>
            <div v-if="assetInventory.untrackedFiles.length" class="field-box">
              <strong>Largest untracked files</strong>
              <span v-for="file in assetInventory.untrackedFiles.slice(0, 4)" :key="file.relativePath" class="muted">
                {{ file.relativePath }} · {{ formatBytes(file.sizeBytes) }}
              </span>
            </div>
          </div>
          <div v-if="assetMaintenancePlan" class="field-box">
            <strong>Maintenance Plan</strong>
            <span class="muted">
              {{ assetMaintenancePlan.summary.totalActions }} actions ·
              {{ assetMaintenancePlan.summary.publishBlockers }} publish blockers ·
              {{ assetMaintenancePlan.summary.cleanupCandidates }} cleanup candidates ·
              {{ formatBytes(assetMaintenancePlan.summary.estimatedRecoverableBytes) }} recoverable
            </span>
            <span v-if="store.lastAssetMaintenanceMessage" class="muted">{{ store.lastAssetMaintenanceMessage }}</span>
            <div v-if="assetMaintenancePlan.actions.length" class="field-grid">
              <div v-for="action in assetMaintenancePlan.actions.slice(0, 5)" :key="action.id" class="field-box">
                <strong>{{ action.severity }}: {{ action.title }}</strong>
                <span class="muted">{{ action.detail }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="field-box">
          <strong>Native SQLite Search Index</strong>
          <span class="muted">Tauri desktop builds mirror JSON content into `search.sqlite3` for Phase 5 FTS search and large library migration.</span>
          <div class="row">
            <input v-model="nativeIndexQuery" class="input" aria-label="Native index query" placeholder="Search native index" />
          </div>
          <div class="cluster">
            <button class="secondary-button" type="button" @click="rebuildNativeIndex">
              <Database :size="16" />
              Rebuild SQLite Index
            </button>
            <button class="ghost-button" type="button" @click="searchNativeIndex">
              <Search :size="16" />
              Search Index
            </button>
          </div>
          <p v-if="store.lastSqliteIndexMessage" class="muted">{{ store.lastSqliteIndexMessage }}</p>
          <span v-if="store.lastSqliteIndexReport" class="muted">
            {{ store.lastSqliteIndexReport.itemCount }} items · {{ store.lastSqliteIndexReport.messageCount }} messages · {{ store.lastSqliteIndexReport.path }}
          </span>
          <div v-if="store.lastSqliteSearchHits.length" class="field-grid">
            <div v-for="hit in store.lastSqliteSearchHits" :key="`${hit.entityType}:${hit.entityId}`" class="field-box">
              <strong>{{ hit.entityType }}: {{ hit.title }}</strong>
              <span class="muted">{{ hit.snippet }}</span>
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

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Database, Download, HardDrive, RotateCcw, Save, Search, ShieldCheck, Upload } from "lucide-vue-next";
import { labelFor } from "@/lib/display";
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
        <p class="eyebrow">存档</p>
        <h2>工作区备份</h2>
      </div>
    </div>

    <div class="page-grid">
      <div class="panel field-grid">
        <div class="field-box">
          <strong>{{ store.envelope.workspace.name }}</strong>
          <span class="muted">更新于 {{ new Date(store.envelope.workspace.updatedAt).toLocaleString() }}</span>
          <span class="muted">{{ store.chats.length }} 个聊天 / {{ store.storylines.length }} 条故事线 / {{ store.characters.length }} 个角色</span>
        </div>
        <div class="cluster">
          <button class="secondary-button" @click="store.persist('manual_save')">
            <Save :size="16" />
            立即保存
          </button>
          <button class="secondary-button" @click="store.backup('manual')">
            <RotateCcw :size="16" />
            备份
          </button>
          <button class="primary-button" @click="store.exportCurrentWorkspace()">
            <Download :size="16" />
            导出
          </button>
          <button class="secondary-button" @click="store.verifyCurrentWorkspacePackage()">
            <ShieldCheck :size="16" />
            校验内容包
          </button>
          <label class="ghost-button" style="cursor: pointer">
            <Upload :size="16" />
            导入
            <input type="file" accept="application/json,.json,.zip,.evolvria.zip" hidden @change="importWorkspace" />
          </label>
        </div>
        <p v-if="store.lastExportPath" class="muted">最近导出：{{ store.lastExportPath }}</p>
        <p v-if="store.lastBackupMessage" class="muted">{{ store.lastBackupMessage }}</p>
        <p v-if="store.lastImportMessage" class="muted">{{ store.lastImportMessage }}</p>
        <p v-if="importError" class="error-text">
          {{ importError === "zip_import_requires_tauri" ? "Zip 导入仅在 Tauri 桌面应用可用。浏览器预览只能导入 JSON。" : importError }}
        </p>
        <div class="field-box">
          <strong>可恢复备份</strong>
          <span class="muted">备份会存放在 Tauri 工作区。浏览器预览会在 localStorage 保留备用副本。</span>
          <div v-if="store.backupMetas.length" class="field-grid">
            <div v-for="backup in store.backupMetas.slice(0, 8)" :key="backup.id" class="field-box">
              <strong>{{ backup.reason }} · {{ backup.id }}</strong>
              <span class="muted">
                {{ new Date(backup.createdAt).toLocaleString() }}
                <template v-if="backup.sizeBytes"> · {{ Math.round(backup.sizeBytes / 1024) }} KB</template>
              </span>
              <span v-if="backup.hasSqliteIndex" class="muted">
                已包含 SQLite 索引
                <template v-if="backup.sqliteSizeBytes">
                  · {{ Math.round(backup.sqliteSizeBytes / 1024) }} KB
                </template>
              </span>
              <div class="cluster">
                <button class="secondary-button" type="button" @click="store.restoreWorkspaceFromBackup(backup.id)">
                  <RotateCcw :size="16" />
                  恢复备份
                </button>
              </div>
            </div>
          </div>
          <span v-else class="muted">还没有备份。进行破坏性编辑或导入前，请先创建备份。</span>
        </div>
        <div v-if="store.lastPackageReport" class="field-box">
          <strong>内容包校验{{ store.lastPackageReport.ok ? "通过" : "失败" }}</strong>
          <span class="muted">
            {{ store.lastPackageReport.schemaVersion }} · {{ store.lastPackageReport.format }} ·
            {{ store.lastPackageReport.assetRefs.referenced.length }} 个引用素材 /
            {{ store.lastPackageReport.assetRefs.missing.length }} 个缺失
          </span>
          <span class="muted">
            {{ packageErrors }} 个错误 · {{ packageWarnings }} 个警告 ·
            {{ store.lastPackageReport.entityCounts.storylines ?? 0 }} 条故事线 ·
            {{ store.lastPackageReport.entityCounts.messages ?? 0 }} 条消息
          </span>
          <div v-if="packageIssues.length" class="field-grid">
            <div v-for="issue in packageIssues.slice(0, 6)" :key="`${issue.field}-${issue.message}`" class="field-box">
              <strong>{{ labelFor(issue.severity) }}：{{ issue.field }}</strong>
              <span class="muted">{{ issue.message }}</span>
            </div>
          </div>
        </div>
        <div class="field-box">
          <strong>素材清单</strong>
          <span class="muted">桌面端会扫描工作区素材，检查缺失、浏览器临时和未追踪文件。浏览器预览只能检查元数据。</span>
          <button class="secondary-button" type="button" @click="store.refreshAssetInventory()">
            <HardDrive :size="16" />
            刷新素材清单
          </button>
          <p v-if="store.lastAssetInventoryMessage" class="muted">{{ store.lastAssetInventoryMessage }}</p>
          <div v-if="assetInventory" class="field-grid">
            <div class="field-box">
              <strong>{{ assetInventory.stats.declaredAssets }} 个声明素材</strong>
              <span class="muted">{{ assetInventory.stats.referencedAssets }} 个被引用 · {{ assetInventory.stats.unreferencedAssets }} 个未引用</span>
              <span class="muted">{{ assetInventory.stats.browserOnlyAssets }} 个浏览器临时素材 · {{ assetInventory.stats.missingPhysicalAssets }} 个实体缺失</span>
            </div>
            <div class="field-box">
              <strong>{{ formatBytes(assetInventory.stats.physicalBytes || assetInventory.stats.declaredBytes) }}</strong>
              <span class="muted">{{ assetInventory.stats.physicalFiles }} 个实体文件 · {{ assetInventory.stats.untrackedFiles }} 个未追踪</span>
              <span class="muted">声明元数据 {{ formatBytes(assetInventory.stats.declaredBytes) }}</span>
            </div>
            <div v-if="assetInventory.missingAssetIds.length" class="field-box">
              <strong>缺失素材 ID</strong>
              <span class="muted">{{ assetInventory.missingAssetIds.slice(0, 6).join(", ") }}</span>
            </div>
            <div v-if="assetInventory.untrackedFiles.length" class="field-box">
              <strong>最大的未追踪文件</strong>
              <span v-for="file in assetInventory.untrackedFiles.slice(0, 4)" :key="file.relativePath" class="muted">
                {{ file.relativePath }} · {{ formatBytes(file.sizeBytes) }}
              </span>
            </div>
          </div>
          <div v-if="assetMaintenancePlan" class="field-box">
            <strong>维护计划</strong>
            <span class="muted">
              {{ assetMaintenancePlan.summary.totalActions }} 个动作 ·
              {{ assetMaintenancePlan.summary.publishBlockers }} 个发布阻断项 ·
              {{ assetMaintenancePlan.summary.cleanupCandidates }} 个清理候选 ·
              可回收 {{ formatBytes(assetMaintenancePlan.summary.estimatedRecoverableBytes) }}
            </span>
            <span v-if="store.lastAssetMaintenanceMessage" class="muted">{{ store.lastAssetMaintenanceMessage }}</span>
            <div v-if="assetMaintenancePlan.actions.length" class="field-grid">
              <div v-for="action in assetMaintenancePlan.actions.slice(0, 5)" :key="action.id" class="field-box">
                <strong>{{ labelFor(action.severity) }}：{{ action.title }}</strong>
                <span class="muted">{{ action.detail }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="field-box">
          <strong>本地 SQLite 搜索索引</strong>
          <span class="muted">Tauri 桌面端会把 JSON 内容镜像到 `search.sqlite3`，用于第 5 阶段 FTS 搜索和大型内容库迁移。</span>
          <div class="row">
            <input v-model="nativeIndexQuery" class="input" aria-label="本地索引查询" placeholder="搜索本地索引" />
          </div>
          <div class="cluster">
            <button class="secondary-button" type="button" @click="rebuildNativeIndex">
              <Database :size="16" />
              重建 SQLite 索引
            </button>
            <button class="ghost-button" type="button" @click="searchNativeIndex">
              <Search :size="16" />
              搜索索引
            </button>
          </div>
          <p v-if="store.lastSqliteIndexMessage" class="muted">{{ store.lastSqliteIndexMessage }}</p>
          <span v-if="store.lastSqliteIndexReport" class="muted">
            {{ store.lastSqliteIndexReport.itemCount }} 项 · {{ store.lastSqliteIndexReport.messageCount }} 条消息 · {{ store.lastSqliteIndexReport.path }}
          </span>
          <div v-if="store.lastSqliteSearchHits.length" class="field-grid">
            <div v-for="hit in store.lastSqliteSearchHits" :key="`${hit.entityType}:${hit.entityId}`" class="field-box">
              <strong>{{ labelFor(hit.entityType) }}：{{ hit.title }}</strong>
              <span class="muted">{{ hit.snippet }}</span>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel field-grid">
        <div>
        <h3>已归档聊天</h3>
          <p class="muted">归档聊天可以恢复；恢复前不会出现在“继续”入口。</p>
        </div>
        <div v-if="store.archivedChats.length" class="field-grid">
          <div v-for="chat in store.archivedChats" :key="chat.id" class="field-box">
            <strong>{{ chat.title }}</strong>
            <span class="muted">{{ chat.messageIds.length }} 条消息 · 归档于 {{ new Date(chat.updatedAt).toLocaleString() }}</span>
            <div class="cluster">
              <button class="secondary-button" @click="store.restoreChat(chat.id)">
                <RotateCcw :size="16" />
                恢复
              </button>
              <RouterLink class="ghost-button" :to="`/chat/${chat.id}`">打开</RouterLink>
            </div>
          </div>
        </div>
        <div v-else class="field-box">
          <strong>没有已归档聊天</strong>
          <span class="muted">想从“继续”中移除但不删除时，可以在聊天会话中归档。</span>
        </div>
        <div class="field-box">
          <strong>重置种子内容</strong>
          <span class="muted">仅用于开发验收。会用原创示例内容覆盖当前浏览器备用工作区；Tauri 端也会写入新种子。</span>
          <button class="danger-button" @click="store.resetToSeed()">重置为种子内容</button>
        </div>
      </aside>
    </div>
  </section>
</template>

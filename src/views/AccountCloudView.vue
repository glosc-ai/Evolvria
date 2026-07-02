<script setup lang="ts">
import { computed, reactive } from "vue";
import { RouterLink } from "vue-router";
import { Cloud, Download, Flag, GitBranch, Receipt, UserRound, Wallet } from "lucide-vue-next";
import { labelFor } from "@/lib/display";
import { useAppStore } from "@/stores/app";
import type { AccountAgeGate, CreatorEarning } from "@/types/domain";

const store = useAppStore();
const account = computed(() => store.envelope.settings.cloudAccount);
const accountForm = reactive({
  displayName: store.envelope.settings.cloudAccount?.displayName ?? "本地创作者",
  email: store.envelope.settings.cloudAccount?.email ?? "creator@example.test",
  ageGate: (store.envelope.settings.cloudAccount?.ageGate ?? "adult") as AccountAgeGate,
});
const syncForm = reactive({
  enabled: store.envelope.settings.sync.enabled,
  endpoint: store.envelope.settings.sync.endpoint ?? "https://api.evolvria.local/api/v1",
});
const syncPlayground = reactive({
  storylineId: "story_starbloom_frontier",
});
const reportForm = reactive({
  targetId: "story_starbloom_frontier",
  reason: "本地策略审核占位原因。",
});
const appealForm = reactive({
  reason: "创作者申诉：问题已修复，或需要二次复核。",
});
const payoutForm = reactive({
  amount: 12.5,
  note: "申请本地提现预览，用于可用创作者分成。",
});
const publishForm = reactive({
  storylineId: "story_starbloom_frontier",
});
const feedback = reactive({ message: "" });
const openConflicts = computed(() => store.openSyncConflicts);
const latestOperations = computed(() => store.syncOperations.slice(0, 6));
const latestLedger = computed(() => store.ledgerEntries.slice(0, 6));
const latestAdjustments = computed(() => store.creditAdjustments.slice(0, 4));
const latestPayouts = computed(() => store.creatorPayoutRequests.slice(0, 5));
const latestEarnings = computed(() => store.creatorEarnings.slice(0, 6));
const syncSnapshot = computed(() => store.lastSyncSnapshot);

async function signInAccount() {
  await store.signInLocalAccount({
    displayName: accountForm.displayName,
    email: accountForm.email,
    ageGate: accountForm.ageGate,
  });
  feedback.message = `已以 ${store.envelope.settings.cloudAccount?.displayName} 本地登录。`;
}

async function changeAgeGate() {
  await store.updateLocalAccountAgeGate(accountForm.ageGate);
  feedback.message = `年龄门槛已更新：${labelFor(accountForm.ageGate)}。`;
}

async function signOutAccount() {
  await store.signOutLocalAccount();
  syncForm.enabled = false;
  feedback.message = "已本地登出。私有同步已关闭，本地工作区仍保留在设备上。";
}

async function saveSync() {
  await store.updateSyncSettings({ enabled: syncForm.enabled, endpoint: syncForm.endpoint });
  if (syncForm.enabled && !store.envelope.settings.cloudAccount) {
    syncForm.enabled = false;
    feedback.message = "启用私有同步前请先本地登录。";
    return;
  }
  feedback.message = "同步设置已保存到本地。";
}

function refreshSyncSnapshot() {
  store.refreshSyncSnapshot();
  feedback.message = "设备快照已刷新。";
}

function exportSyncOperationLog() {
  store.exportSyncOperationLog();
  feedback.message = store.lastSyncLogMessage ?? "同步操作日志已导出。";
}

async function importSyncOperationLog(event: Event) {
  const input = event.target as HTMLInputElement;
  const [file] = Array.from(input.files ?? []);
  if (!file) return;
  try {
    await store.importSyncOperationLogFile(file);
    feedback.message = store.lastSyncLogMessage ?? "同步操作日志已导入。";
  } catch (error) {
    feedback.message = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

async function disableSyncKeepLocal() {
  await store.disableSyncRetainingLocalData();
  syncForm.enabled = false;
  feedback.message = store.lastSyncLogMessage ?? "私有同步已关闭，本地数据已保留。";
}

async function queueSync() {
  await store.queueStorylineSyncOperation(syncPlayground.storylineId);
  feedback.message = "已排队一个本地同步操作。";
}

async function pushSync() {
  const count = await store.simulateSyncPush();
  feedback.message = `模拟推送已确认 ${count} 个操作。`;
}

async function createConflict() {
  await store.simulateStorylineConflict(syncPlayground.storylineId);
  feedback.message = "已创建一个确定性的字段冲突。";
}

async function resolveConflict(conflictId: string, resolution: "local" | "remote" | "copy") {
  await store.resolveSyncConflict(conflictId, resolution);
  feedback.message = `冲突已按${resolution === "local" ? "本地版本" : resolution === "remote" ? "云端版本" : "复制版本"}解决。`;
}

async function createReport() {
  await store.submitLocalModerationCase("storyline", reportForm.targetId, reportForm.reason);
}

async function addEarning() {
  await store.addCreatorEarningEstimate("story_starbloom_frontier", 0);
}

async function addAvailableEarning() {
  await store.addCreatorEarningEstimate("story_starbloom_frontier", Number(payoutForm.amount), "available");
  feedback.message = "可用收益预览已添加。";
}

async function updateEarning(earningId: string, status: CreatorEarning["status"]) {
  await store.updateCreatorEarningStatus(earningId, status, `账号预览将创作者收益标记为${labelFor(status)}。`);
  feedback.message = `创作者收益已标记为${labelFor(status)}。`;
}

async function requestPayout() {
  try {
    const payoutId = await store.requestCreatorPayout(payoutForm.note);
    feedback.message = `提现预览已申请：${payoutId}。`;
  } catch (error) {
    feedback.message = error instanceof Error ? error.message : String(error);
  }
}

async function resolvePayout(payoutId: string, outcome: "approve" | "pay" | "reject" | "block") {
  await store.resolveCreatorPayout(payoutId, outcome, `账号提现预览记录${labelFor(outcome)}决策。`);
  feedback.message = `提现${labelFor(outcome)}已记录。`;
}

async function addLedger() {
  await store.addCreditLedgerEstimate(1.2);
  feedback.message = "已添加本地积分账本预估。";
}

async function adjustLedger(entryId: string, kind: "refund" | "reversal" | "freeze" | "release") {
  await store.adjustCreditLedger(entryId, kind, `账号预览创建${labelFor(kind)}调整。`);
  feedback.message = `账本${labelFor(kind)}已记录。`;
}

async function submitStoryline() {
  const issues = await store.submitStorylineForReview(publishForm.storylineId);
  feedback.message = issues.length ? `被 ${issues.length} 个校验问题阻止。` : "已提交到本地审核队列。";
}

async function approveCase(caseId: string) {
  await store.resolveModerationCase(caseId, "dismissed", "approved");
  feedback.message = "案例已在本地通过；故事线进入公开就绪占位状态。";
}

async function requestChanges(caseId: string) {
  await store.resolveModerationCase(caseId, "actioned", "needs_changes");
  feedback.message = "案例已在本地处理；目标现在需要修改。";
}

async function rejectCase(caseId: string) {
  await store.resolveModerationCase(caseId, "actioned", "rejected");
  feedback.message = "案例已在本地拒绝；目标被阻止发布。";
}

async function appealCase(caseId: string) {
  await store.appealModerationCase(caseId, appealForm.reason);
  feedback.message = "申诉已随审计元数据提交到本地。";
}

async function resolveAppeal(caseId: string, outcome: "upheld" | "denied") {
  await store.resolveModerationCaseAppeal(caseId, outcome);
  feedback.message = outcome === "upheld"
    ? "申诉已在本地维持；目标进入公开就绪占位状态。"
    : "申诉已在本地驳回；目标仍保持阻止状态。";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">云端平台预览</p>
        <h2>账号、同步、用户内容与积分</h2>
      </div>
    </div>

    <div class="page-grid">
      <div class="field-grid">
        <form class="panel field-grid" @submit.prevent="signInAccount">
          <h3><UserRound :size="17" /> 本地账号预览</h3>
          <label class="field-box">
            <span>显示名称</span>
            <input v-model="accountForm.displayName" class="input" />
          </label>
          <label class="field-box">
            <span>邮箱</span>
            <input v-model="accountForm.email" class="input" />
          </label>
          <label class="field-box">
            <span>年龄门槛</span>
            <select v-model="accountForm.ageGate" class="select">
              <option value="adult">成人</option>
              <option value="minor">未成年</option>
              <option value="unknown">未知</option>
            </select>
          </label>
          <div class="cluster">
            <button class="primary-button" type="submit">本地登录</button>
            <button v-if="account" class="ghost-button" type="button" @click="changeAgeGate">更新年龄门槛</button>
            <button v-if="account" class="danger-button" type="button" @click="signOutAccount">登出</button>
          </div>
          <div v-if="account" class="field-box">
            <strong>已以 {{ account.displayName }} 本地登录</strong>
            <span class="muted">{{ account.email || "无邮箱" }} · {{ labelFor(account.ageGate) }} · {{ labelFor(account.status) }}</span>
            <span class="muted">权限：{{ account.permissions.map(labelFor).join(", ") }}</span>
            <RouterLink class="ghost-button" to="/creators/creator_local">打开创作者主页</RouterLink>
          </div>
          <p class="muted">这是本地账号预览，不上传玩家档案、聊天、草稿或 API key。</p>
        </form>

        <form class="panel field-grid" @submit.prevent="saveSync">
          <h3><Cloud :size="17" /> 私有同步</h3>
          <label class="field-box">
            <span>模式</span>
            <select v-model="syncForm.enabled" class="select">
              <option :value="false">仅本地</option>
              <option :value="true">准备云端同步</option>
            </select>
          </label>
          <label class="field-box">
            <span>端点</span>
            <input v-model="syncForm.endpoint" class="input" />
          </label>
          <div class="cluster">
            <button class="primary-button" type="submit">保存同步状态</button>
            <button class="ghost-button" type="button" @click="disableSyncKeepLocal">关闭并保留本地</button>
          </div>
          <div class="cluster">
            <button class="ghost-button" type="button" @click="refreshSyncSnapshot">刷新设备快照</button>
          </div>
          <div v-if="syncSnapshot" class="field-box">
            <strong>设备快照</strong>
            <span class="muted">
              {{ syncSnapshot.deviceId }} · {{ syncSnapshot.syncStatus }} ·
              待处理 {{ syncSnapshot.pendingOperationCount }} · 冲突 {{ syncSnapshot.openConflictCount }}
            </span>
            <span class="muted">
              {{ syncSnapshot.entityCounts.storylines }} 条故事线 ·
              {{ syncSnapshot.entityCounts.messages }} 条消息 ·
              最新 {{ syncSnapshot.latestOperationAt || "无" }}
            </span>
          </div>
          <p class="muted">当前只保存同步意图，不上传本地玩家档案、聊天或草稿。</p>
        </form>

        <section class="panel field-grid">
          <h3><GitBranch :size="17" /> 同步操作实验室</h3>
          <label class="field-box">
            <span>故事线</span>
            <select v-model="syncPlayground.storylineId" class="select">
              <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }}</option>
            </select>
          </label>
          <div class="cluster">
            <button class="secondary-button" type="button" @click="queueSync">排队更新</button>
            <button class="ghost-button" type="button" @click="pushSync">模拟推送</button>
            <button class="danger-button" type="button" @click="createConflict">创建冲突</button>
          </div>
          <div class="cluster">
            <button class="ghost-button" type="button" @click="exportSyncOperationLog">
              <Download :size="15" />
              导出操作日志
            </button>
            <label class="ghost-button file-button">
              导入操作日志
              <input
                class="sr-only"
                aria-label="导入同步操作日志"
                type="file"
                accept="application/json,.json,.evolvria-sync.json"
                @change="importSyncOperationLog"
              />
            </label>
          </div>
          <p v-if="store.lastSyncLogMessage" class="muted">{{ store.lastSyncLogMessage }}</p>
          <div v-if="openConflicts.length" class="field-grid">
            <div v-for="conflict in openConflicts" :key="conflict.id" class="field-box">
              <strong>{{ conflict.field }} 冲突 / {{ conflict.entityId }}</strong>
              <span class="muted">本地：{{ conflict.localValue }}</span>
              <span class="muted">云端：{{ conflict.remoteValue }}</span>
              <div class="cluster">
                <button class="ghost-button" type="button" @click="resolveConflict(conflict.id, 'local')">保留本地</button>
                <button class="ghost-button" type="button" @click="resolveConflict(conflict.id, 'remote')">使用云端</button>
                <button class="ghost-button" type="button" @click="resolveConflict(conflict.id, 'copy')">复制一份</button>
              </div>
            </div>
          </div>
          <p v-else class="muted">没有未解决冲突。模拟冲突只改本地存档，方便验证 Beta 同步体验。</p>
        </section>

        <form class="panel field-grid" @submit.prevent="createReport">
          <h3><Flag :size="17" /> 审核队列</h3>
          <label class="field-box">
            <span>目标故事线</span>
            <select v-model="reportForm.targetId" class="select">
              <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }}</option>
            </select>
          </label>
          <label class="field-box">
            <span>原因</span>
            <textarea v-model="reportForm.reason" class="textarea" />
          </label>
          <button class="secondary-button" type="submit">创建本地案例</button>
        </form>

        <form class="panel field-grid" @submit.prevent="submitStoryline">
          <h3>发布模拟</h3>
          <label class="field-box">
            <span>故事线</span>
            <select v-model="publishForm.storylineId" class="select">
              <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }} - {{ labelFor(story.version.status) }}</option>
            </select>
          </label>
          <button class="primary-button" type="submit">提交审核</button>
          <p v-if="feedback.message" class="muted">{{ feedback.message }}</p>
          <div v-if="store.lastPackageReport" class="field-box">
            <strong>内容包校验{{ store.lastPackageReport.ok && !store.lastPackageReport.assetRefs.browserOnly.length ? "通过" : "需要处理" }}</strong>
            <span class="muted">
              {{ store.lastPackageReport.format }} ·
              {{ store.lastPackageReport.assetRefs.referenced.length }} 个引用 ·
              {{ store.lastPackageReport.assetRefs.browserOnly.length }} 个浏览器临时素材 ·
              {{ store.lastPackageReport.issues.filter((issue) => issue.severity === "error").length }} 个错误
            </span>
            <span
              v-for="issue in store.lastPackageReport.issues.filter((item) => item.severity === 'error').slice(0, 3)"
              :key="`${issue.field}-${issue.message}`"
              class="muted"
            >
              {{ issue.field }}: {{ issue.message }}
            </span>
            <span
              v-for="assetId in store.lastPackageReport.assetRefs.browserOnly.slice(0, 3)"
              :key="assetId"
              class="muted"
            >
              {{ assetId }}：浏览器临时素材必须用 Tauri 桌面导入器重新导入。
            </span>
          </div>
        </form>
      </div>

      <aside class="panel field-grid">
        <h3><Wallet :size="17" /> 创作者分成</h3>
        <div class="field-box">
          <strong>同步状态</strong>
          <span class="muted">{{ labelFor(store.envelope.settings.sync.status) }} / 冲突 {{ store.envelope.settings.sync.conflictCount }}</span>
        </div>
        <div class="field-box">
          <strong>审核案例</strong>
          <span class="muted">{{ store.moderationQueue.length }} 个本地案例</span>
        </div>
        <label class="field-box">
          <span>申诉原因</span>
          <textarea v-model="appealForm.reason" class="textarea" />
        </label>
        <div class="field-grid">
          <div v-for="item in store.moderationQueue.slice(0, 5)" :key="item.id" class="field-box">
            <strong>{{ labelFor(item.status) }} / {{ item.targetId }}</strong>
            <span class="muted">{{ item.reason }}</span>
            <span v-if="item.appeal" class="muted">
              申诉 {{ labelFor(item.appeal.status) }}：{{ item.appeal.reason }}
            </span>
            <div class="cluster">
              <button class="ghost-button" @click="approveCase(item.id)">通过</button>
              <button class="ghost-button" @click="requestChanges(item.id)">要求修改</button>
              <button class="danger-button" @click="rejectCase(item.id)">拒绝</button>
              <button v-if="item.status === 'actioned'" class="ghost-button" @click="appealCase(item.id)">申诉</button>
              <button v-if="item.status === 'appealed'" class="ghost-button" @click="resolveAppeal(item.id, 'upheld')">维持申诉</button>
              <button v-if="item.status === 'appealed'" class="danger-button" @click="resolveAppeal(item.id, 'denied')">驳回申诉</button>
            </div>
          </div>
        </div>
        <div class="field-box">
          <strong>创作者收益</strong>
          <span class="muted">
            {{ store.creatorEarnings.length }} 条账本占位 ·
            可用 {{ store.creatorEarningTotals.available }} ·
            待处理 {{ store.creatorEarningTotals.pending }} ·
            暂扣 {{ store.creatorEarningTotals.withheld }} ·
            已支付 {{ store.creatorEarningTotals.paid }}
          </span>
        </div>
        <div class="cluster">
          <button class="ghost-button" @click="addEarning">添加收益预估</button>
          <button class="secondary-button" type="button" @click="addAvailableEarning">添加可用收益</button>
        </div>
        <label class="field-box">
          <span>可用收益金额</span>
          <input v-model.number="payoutForm.amount" class="input" type="number" min="0" step="0.01" />
        </label>
        <label class="field-box">
          <span>提现备注</span>
          <textarea v-model="payoutForm.note" class="textarea" />
        </label>
        <button class="primary-button" type="button" @click="requestPayout">申请提现预览</button>
        <div class="field-grid">
          <div v-for="earning in latestEarnings" :key="earning.id" class="field-box">
            <strong>{{ labelFor(earning.status) }} / {{ earning.amount }} {{ earning.currency }}</strong>
            <span class="muted">{{ earning.sourceEntityId }} · {{ earning.note }}</span>
            <div class="cluster">
              <button v-if="earning.status === 'estimated'" class="ghost-button" type="button" @click="updateEarning(earning.id, 'available')">标为可用</button>
              <button v-if="earning.status === 'available'" class="ghost-button" type="button" @click="updateEarning(earning.id, 'withheld')">暂扣</button>
              <button v-if="earning.status === 'withheld'" class="ghost-button" type="button" @click="updateEarning(earning.id, 'available')">释放</button>
            </div>
          </div>
        </div>
        <div class="field-box">
          <strong>提现申请</strong>
          <span class="muted">{{ store.creatorPayoutRequests.length }} 个本地提现预览</span>
        </div>
        <div class="field-grid">
          <div v-for="payout in latestPayouts" :key="payout.id" class="field-box">
            <strong>{{ labelFor(payout.status) }} / {{ payout.amount }} {{ payout.currency }}</strong>
            <span class="muted">{{ payout.earningIds.length }} 条收益 · 风险 {{ payout.riskFlags.map(labelFor).join(", ") || "无" }}</span>
            <span class="muted">{{ payout.note }}</span>
            <span v-if="payout.resolutionNote" class="muted">{{ payout.resolutionNote }}</span>
            <div class="cluster">
              <button v-if="payout.status === 'requested'" class="ghost-button" type="button" @click="resolvePayout(payout.id, 'approve')">通过提现</button>
              <button v-if="payout.status === 'approved'" class="ghost-button" type="button" @click="resolvePayout(payout.id, 'pay')">标记已支付</button>
              <button v-if="payout.status === 'requested'" class="ghost-button" type="button" @click="resolvePayout(payout.id, 'reject')">拒绝提现</button>
              <button v-if="payout.status === 'requested'" class="danger-button" type="button" @click="resolvePayout(payout.id, 'block')">拦截并暂扣</button>
            </div>
          </div>
        </div>

        <div class="field-box">
          <strong>同步操作</strong>
          <span class="muted">{{ latestOperations.length }} 个最近操作</span>
        </div>
        <div class="field-grid">
          <div v-for="operation in latestOperations" :key="operation.id" class="field-box">
            <strong>{{ labelFor(operation.status) }} / {{ labelFor(operation.entityType) }}</strong>
            <span class="muted">{{ labelFor(operation.op) }} {{ operation.entityId }}</span>
          </div>
        </div>

        <div class="field-box">
          <strong><Receipt :size="15" /> 积分账本</strong>
          <span class="muted">{{ store.ledgerEntries.length }} 条成本记录，{{ latestAdjustments.length }} 条调整</span>
        </div>
        <button class="secondary-button" type="button" @click="addLedger">添加积分预估</button>
        <div class="field-grid">
          <div v-for="entry in latestLedger" :key="entry.id" class="field-box">
            <strong>{{ labelFor(entry.status) }} / {{ labelFor(entry.operation) }}</strong>
            <span class="muted">{{ entry.estimatedCost }} {{ entry.currency }} · {{ entry.provider }}</span>
            <div class="cluster">
              <button class="ghost-button" type="button" @click="adjustLedger(entry.id, 'freeze')">冻结</button>
              <button class="ghost-button" type="button" @click="adjustLedger(entry.id, 'release')">释放</button>
              <button class="ghost-button" type="button" @click="adjustLedger(entry.id, 'refund')">退款</button>
              <button class="danger-button" type="button" @click="adjustLedger(entry.id, 'reversal')">冲正</button>
            </div>
          </div>
        </div>
        <p class="muted small">支付、提现、真实积分和公开用户内容发布仍保持禁用，直到云端审核与账本完成。</p>
      </aside>
    </div>
  </section>
</template>

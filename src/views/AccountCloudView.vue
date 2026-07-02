<script setup lang="ts">
import { computed, reactive } from "vue";
import { Cloud, Flag, GitBranch, Receipt, UserRound, Wallet } from "lucide-vue-next";
import { useAppStore } from "@/stores/app";
import type { AccountAgeGate } from "@/types/domain";

const store = useAppStore();
const account = computed(() => store.envelope.settings.cloudAccount);
const accountForm = reactive({
  displayName: store.envelope.settings.cloudAccount?.displayName ?? "Local Creator",
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
  reason: "Local policy review placeholder",
});
const appealForm = reactive({
  reason: "Creator appeal: the issue was fixed or the decision needs a second review.",
});
const publishForm = reactive({
  storylineId: "story_starbloom_frontier",
});
const feedback = reactive({ message: "" });
const openConflicts = computed(() => store.openSyncConflicts);
const latestOperations = computed(() => store.syncOperations.slice(0, 6));
const latestLedger = computed(() => store.ledgerEntries.slice(0, 6));
const latestAdjustments = computed(() => store.creditAdjustments.slice(0, 4));

async function signInAccount() {
  await store.signInLocalAccount({
    displayName: accountForm.displayName,
    email: accountForm.email,
    ageGate: accountForm.ageGate,
  });
  feedback.message = `Signed in locally as ${store.envelope.settings.cloudAccount?.displayName}.`;
}

async function changeAgeGate() {
  await store.updateLocalAccountAgeGate(accountForm.ageGate);
  feedback.message = `Age gate updated: ${accountForm.ageGate}.`;
}

async function signOutAccount() {
  await store.signOutLocalAccount();
  syncForm.enabled = false;
  feedback.message = "Signed out locally. Private sync disabled; local workspace remains on device.";
}

async function saveSync() {
  await store.updateSyncSettings({ enabled: syncForm.enabled, endpoint: syncForm.endpoint });
  if (syncForm.enabled && !store.envelope.settings.cloudAccount) {
    syncForm.enabled = false;
    feedback.message = "Sign in locally before enabling private sync.";
    return;
  }
  feedback.message = "Sync settings saved locally.";
}

async function queueSync() {
  await store.queueStorylineSyncOperation(syncPlayground.storylineId);
  feedback.message = "Queued a local sync operation.";
}

async function pushSync() {
  const count = await store.simulateSyncPush();
  feedback.message = `Simulated push acknowledged ${count} operation(s).`;
}

async function createConflict() {
  await store.simulateStorylineConflict(syncPlayground.storylineId);
  feedback.message = "Created a deterministic field conflict.";
}

async function resolveConflict(conflictId: string, resolution: "local" | "remote" | "copy") {
  await store.resolveSyncConflict(conflictId, resolution);
  feedback.message = `Conflict resolved with ${resolution}.`;
}

async function createReport() {
  await store.submitLocalModerationCase("storyline", reportForm.targetId, reportForm.reason);
}

async function addEarning() {
  await store.addCreatorEarningEstimate("story_starbloom_frontier", 0);
}

async function addLedger() {
  await store.addCreditLedgerEstimate(1.2);
  feedback.message = "Added a local credit ledger estimate.";
}

async function adjustLedger(entryId: string, kind: "refund" | "reversal" | "freeze" | "release") {
  await store.adjustCreditLedger(entryId, kind, `${kind} created from Account preview.`);
  feedback.message = `Ledger ${kind} recorded.`;
}

async function submitStoryline() {
  const issues = await store.submitStorylineForReview(publishForm.storylineId);
  feedback.message = issues.length ? `Blocked by ${issues.length} validation issue(s).` : "Submitted to local review queue.";
}

async function approveCase(caseId: string) {
  await store.resolveModerationCase(caseId, "dismissed", "approved");
  feedback.message = "Case approved locally; storyline is public-ready placeholder.";
}

async function requestChanges(caseId: string) {
  await store.resolveModerationCase(caseId, "actioned", "needs_changes");
  feedback.message = "Case actioned locally; target now needs changes.";
}

async function rejectCase(caseId: string) {
  await store.resolveModerationCase(caseId, "actioned", "rejected");
  feedback.message = "Case rejected locally; target is blocked from publishing.";
}

async function appealCase(caseId: string) {
  await store.appealModerationCase(caseId, appealForm.reason);
  feedback.message = "Appeal submitted locally with audit metadata.";
}

async function resolveAppeal(caseId: string, outcome: "upheld" | "denied") {
  await store.resolveModerationCaseAppeal(caseId, outcome);
  feedback.message = outcome === "upheld"
    ? "Appeal upheld locally; target is public-ready placeholder."
    : "Appeal denied locally; target remains blocked.";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">Cloud Platform Preview</p>
        <h2>Account, Sync, UGC & Credits</h2>
      </div>
    </div>

    <div class="page-grid">
      <div class="field-grid">
        <form class="panel field-grid" @submit.prevent="signInAccount">
          <h3><UserRound :size="17" /> Local Account Preview</h3>
          <label class="field-box">
            <span>Display name</span>
            <input v-model="accountForm.displayName" class="input" />
          </label>
          <label class="field-box">
            <span>Email</span>
            <input v-model="accountForm.email" class="input" />
          </label>
          <label class="field-box">
            <span>Age gate</span>
            <select v-model="accountForm.ageGate" class="select">
              <option value="adult">Adult</option>
              <option value="minor">Minor</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <div class="cluster">
            <button class="primary-button" type="submit">Sign In Locally</button>
            <button v-if="account" class="ghost-button" type="button" @click="changeAgeGate">Update Age Gate</button>
            <button v-if="account" class="danger-button" type="button" @click="signOutAccount">Sign Out</button>
          </div>
          <div v-if="account" class="field-box">
            <strong>Signed in locally as {{ account.displayName }}</strong>
            <span class="muted">{{ account.email || "no email" }} · {{ account.ageGate }} · {{ account.status }}</span>
            <span class="muted">Permissions: {{ account.permissions.join(", ") }}</span>
          </div>
          <p class="muted">这是本地账号预览，不上传 Persona、Chat、草稿或 API key。</p>
        </form>

        <form class="panel field-grid" @submit.prevent="saveSync">
          <h3><Cloud :size="17" /> Private Sync</h3>
          <label class="field-box">
            <span>Mode</span>
            <select v-model="syncForm.enabled" class="select">
              <option :value="false">Local only</option>
              <option :value="true">Ready for cloud sync</option>
            </select>
          </label>
          <label class="field-box">
            <span>Endpoint</span>
            <input v-model="syncForm.endpoint" class="input" />
          </label>
          <button class="primary-button" type="submit">Save Sync State</button>
          <p class="muted">当前只保存同步意图，不上传本地 Persona、聊天或草稿。</p>
        </form>

        <section class="panel field-grid">
          <h3><GitBranch :size="17" /> Sync Operation Lab</h3>
          <label class="field-box">
            <span>Storyline</span>
            <select v-model="syncPlayground.storylineId" class="select">
              <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }}</option>
            </select>
          </label>
          <div class="cluster">
            <button class="secondary-button" type="button" @click="queueSync">Queue Update</button>
            <button class="ghost-button" type="button" @click="pushSync">Simulate Push</button>
            <button class="danger-button" type="button" @click="createConflict">Create Conflict</button>
          </div>
          <div v-if="openConflicts.length" class="field-grid">
            <div v-for="conflict in openConflicts" :key="conflict.id" class="field-box">
              <strong>{{ conflict.field }} conflict / {{ conflict.entityId }}</strong>
              <span class="muted">Local: {{ conflict.localValue }}</span>
              <span class="muted">Cloud: {{ conflict.remoteValue }}</span>
              <div class="cluster">
                <button class="ghost-button" type="button" @click="resolveConflict(conflict.id, 'local')">Keep Local</button>
                <button class="ghost-button" type="button" @click="resolveConflict(conflict.id, 'remote')">Use Cloud</button>
                <button class="ghost-button" type="button" @click="resolveConflict(conflict.id, 'copy')">Make Copy</button>
              </div>
            </div>
          </div>
          <p v-else class="muted">No open conflicts. 模拟冲突只改本地存档，方便验证 Beta 同步 UX。</p>
        </section>

        <form class="panel field-grid" @submit.prevent="createReport">
          <h3><Flag :size="17" /> Moderation Queue</h3>
          <label class="field-box">
            <span>Target storyline</span>
            <select v-model="reportForm.targetId" class="select">
              <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }}</option>
            </select>
          </label>
          <label class="field-box">
            <span>Reason</span>
            <textarea v-model="reportForm.reason" class="textarea" />
          </label>
          <button class="secondary-button" type="submit">Create Local Case</button>
        </form>

        <form class="panel field-grid" @submit.prevent="submitStoryline">
          <h3>Publish Simulation</h3>
          <label class="field-box">
            <span>Storyline</span>
            <select v-model="publishForm.storylineId" class="select">
              <option v-for="story in store.storylines" :key="story.id" :value="story.id">{{ story.title }} - {{ story.version.status }}</option>
            </select>
          </label>
          <button class="primary-button" type="submit">Submit for Review</button>
          <p v-if="feedback.message" class="muted">{{ feedback.message }}</p>
          <div v-if="store.lastPackageReport" class="field-box">
            <strong>Package verification {{ store.lastPackageReport.ok && !store.lastPackageReport.assetRefs.browserOnly.length ? "passed" : "needs attention" }}</strong>
            <span class="muted">
              {{ store.lastPackageReport.format }} ·
              {{ store.lastPackageReport.assetRefs.referenced.length }} referenced ·
              {{ store.lastPackageReport.assetRefs.browserOnly.length }} browser-only ·
              {{ store.lastPackageReport.issues.filter((issue) => issue.severity === "error").length }} errors
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
              {{ assetId }}: browser-only asset must be reimported with the Tauri desktop importer.
            </span>
          </div>
        </form>
      </div>

      <aside class="panel field-grid">
        <h3><Wallet :size="17" /> Creator Share</h3>
        <div class="field-box">
          <strong>Sync status</strong>
          <span class="muted">{{ store.envelope.settings.sync.status }} / conflicts {{ store.envelope.settings.sync.conflictCount }}</span>
        </div>
        <div class="field-box">
          <strong>Moderation cases</strong>
          <span class="muted">{{ store.moderationQueue.length }} local cases</span>
        </div>
        <label class="field-box">
          <span>Appeal reason</span>
          <textarea v-model="appealForm.reason" class="textarea" />
        </label>
        <div class="field-grid">
          <div v-for="item in store.moderationQueue.slice(0, 5)" :key="item.id" class="field-box">
            <strong>{{ item.status }} / {{ item.targetId }}</strong>
            <span class="muted">{{ item.reason }}</span>
            <span v-if="item.appeal" class="muted">
              Appeal {{ item.appeal.status }}: {{ item.appeal.reason }}
            </span>
            <div class="cluster">
              <button class="ghost-button" @click="approveCase(item.id)">Approve</button>
              <button class="ghost-button" @click="requestChanges(item.id)">Request Changes</button>
              <button class="danger-button" @click="rejectCase(item.id)">Reject</button>
              <button v-if="item.status === 'actioned'" class="ghost-button" @click="appealCase(item.id)">Appeal</button>
              <button v-if="item.status === 'appealed'" class="ghost-button" @click="resolveAppeal(item.id, 'upheld')">Uphold Appeal</button>
              <button v-if="item.status === 'appealed'" class="danger-button" @click="resolveAppeal(item.id, 'denied')">Deny Appeal</button>
            </div>
          </div>
        </div>
        <div class="field-box">
          <strong>Creator earnings</strong>
          <span class="muted">{{ store.creatorEarnings.length }} ledger placeholders</span>
        </div>
        <button class="ghost-button" @click="addEarning">Add Earning Estimate</button>

        <div class="field-box">
          <strong>Sync operations</strong>
          <span class="muted">{{ latestOperations.length }} recent operation(s)</span>
        </div>
        <div class="field-grid">
          <div v-for="operation in latestOperations" :key="operation.id" class="field-box">
            <strong>{{ operation.status }} / {{ operation.entityType }}</strong>
            <span class="muted">{{ operation.op }} {{ operation.entityId }}</span>
          </div>
        </div>

        <div class="field-box">
          <strong><Receipt :size="15" /> Credit ledger</strong>
          <span class="muted">{{ store.ledgerEntries.length }} cost record(s), {{ latestAdjustments.length }} adjustment(s)</span>
        </div>
        <button class="secondary-button" type="button" @click="addLedger">Add Credit Estimate</button>
        <div class="field-grid">
          <div v-for="entry in latestLedger" :key="entry.id" class="field-box">
            <strong>{{ entry.status }} / {{ entry.operation }}</strong>
            <span class="muted">{{ entry.estimatedCost }} {{ entry.currency }} · {{ entry.provider }}</span>
            <div class="cluster">
              <button class="ghost-button" type="button" @click="adjustLedger(entry.id, 'freeze')">Freeze</button>
              <button class="ghost-button" type="button" @click="adjustLedger(entry.id, 'release')">Release</button>
              <button class="ghost-button" type="button" @click="adjustLedger(entry.id, 'refund')">Refund</button>
              <button class="danger-button" type="button" @click="adjustLedger(entry.id, 'reversal')">Reverse</button>
            </div>
          </div>
        </div>
        <p class="muted small">支付、提现、真实积分和公开 UGC 发布仍保持禁用，直到云端审核与账本完成。</p>
      </aside>
    </div>
  </section>
</template>

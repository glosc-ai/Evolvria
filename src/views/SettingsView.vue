<script setup lang="ts">
import { reactive, ref } from "vue";
import { useAppStore } from "@/stores/app";
import type { AIProviderType } from "@/types/domain";

const store = useAppStore();
const provider = reactive({ ...store.envelope.settings.provider });
const budget = reactive({ ...store.envelope.settings.budget });
const apiKey = ref("");
const feedback = ref("");

async function saveSettings() {
  feedback.value = "Saving settings...";
  try {
    const secretResult = await store.updateProvider(
      {
        type: provider.type as AIProviderType,
        baseUrl: provider.baseUrl,
        model: provider.model,
        temperature: Number(provider.temperature),
        maxTokens: Number(provider.maxTokens),
      },
      apiKey.value || undefined,
    );
    apiKey.value = "";
    await store.updateBudgetSettings({
      maxInputTokens: Number(budget.maxInputTokens),
      maxOutputTokens: Number(budget.maxOutputTokens),
      maxEstimatedCostPerTurn: Number(budget.maxEstimatedCostPerTurn),
    });
    feedback.value = secretResult
      ? `Settings saved. API key backend: ${secretResult.backend}${secretResult.warning ? ` (${secretResult.warning})` : ""}`
      : "Settings saved.";
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  }
}

async function clearApiKey() {
  feedback.value = "Clearing provider key...";
  try {
    apiKey.value = "";
    const result = await store.clearProviderKey();
    feedback.value = `Provider key ${result.deleted ? "cleared" : "was not saved"}. Backend: ${result.backend}${result.warning ? ` (${result.warning})` : ""}`;
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">Settings</p>
        <h2>AI Provider & Safety</h2>
      </div>
    </div>

    <div class="page-grid">
      <form class="panel field-grid" @submit.prevent="saveSettings">
        <label class="field-box">
          <span>Provider</span>
          <select v-model="provider.type" class="select">
            <option value="mock">mock</option>
            <option value="openai-compatible">openai-compatible</option>
            <option value="local-http">local-http</option>
          </select>
        </label>
        <label class="field-box">
          <span>Base URL</span>
          <input v-model="provider.baseUrl" class="input" />
        </label>
        <label class="field-box">
          <span>Model</span>
          <input v-model="provider.model" class="input" />
        </label>
        <label class="field-box">
          <span>API Key</span>
          <input v-model="apiKey" class="input" type="password" placeholder="不会写入 workspace 导出包" />
          <span class="muted">Tauri 桌面版优先写入系统 Keychain；浏览器预览只适合临时测试。</span>
        </label>
        <div class="row">
          <label class="field-box" style="flex: 1">
            <span>Temperature</span>
            <input v-model.number="provider.temperature" class="input" type="number" min="0" max="2" step="0.05" />
          </label>
          <label class="field-box" style="flex: 1">
            <span>Max tokens</span>
            <input v-model.number="provider.maxTokens" class="input" type="number" min="128" max="4096" step="64" />
          </label>
        </div>
        <div class="field-box">
          <strong>Budget Guardrails</strong>
          <span class="muted">本地预估，不扣费；超过上限时阻止发送。</span>
        </div>
        <div class="row">
          <label class="field-box" style="flex: 1">
            <span>Max input tokens</span>
            <input v-model.number="budget.maxInputTokens" class="input" type="number" min="1" step="128" />
          </label>
          <label class="field-box" style="flex: 1">
            <span>Max output tokens</span>
            <input v-model.number="budget.maxOutputTokens" class="input" type="number" min="1" step="64" />
          </label>
        </div>
        <label class="field-box">
          <span>Max estimated cost per turn</span>
          <input v-model.number="budget.maxEstimatedCostPerTurn" class="input" type="number" min="0" step="0.000001" />
        </label>
        <div class="row">
          <button class="primary-button" type="button" @click="saveSettings">Save Settings</button>
          <button class="ghost-button" type="button" @click="clearApiKey">Clear API Key</button>
        </div>
        <p v-if="feedback" class="muted">{{ feedback }}</p>
      </form>

      <aside class="panel field-grid">
        <h3>Content Safety</h3>
        <label class="field-box">
          <span>AdultLocked content</span>
          <select
            class="select"
            :value="store.envelope.settings.adultContentUnlocked ? 'on' : 'off'"
            @change="store.updateAdultUnlock(($event.target as HTMLSelectElement).value === 'on')"
          >
            <option value="off">Locked by default</option>
            <option value="on">Unlocked locally</option>
          </select>
        </label>
        <p class="muted">
          MVP 默认 SFW。成人内容、支付、收益和公开 UGC 都留到云端审核体系成熟后再启用。
        </p>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useAppStore } from "@/stores/app";
import { AI_MODEL_IDS, GLOSC_ONE_BASE_URL } from "@/domain/ai-routing";
import type { AIProviderType } from "@/types/domain";

const store = useAppStore();
const provider = reactive({ ...store.envelope.settings.provider });
const budget = reactive({ ...store.envelope.settings.budget });
const apiKey = ref("");
const feedback = ref("");

async function saveSettings() {
  feedback.value = "正在保存设置...";
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
      ? `设置已保存。API Key 后端：${secretResult.backend}${secretResult.warning ? ` (${secretResult.warning})` : ""}`
      : "设置已保存。";
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  }
}

async function clearApiKey() {
  feedback.value = "正在清除提供方密钥...";
  try {
    apiKey.value = "";
    const result = await store.clearProviderKey();
    feedback.value = `提供方密钥${result.deleted ? "已清除" : "此前未保存"}。后端：${result.backend}${result.warning ? ` (${result.warning})` : ""}`;
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  }
}

function applyGloscOneDefaults() {
  provider.type = "openai-compatible";
  provider.baseUrl = GLOSC_ONE_BASE_URL;
  provider.model = AI_MODEL_IDS.chat;
  provider.temperature = 0.75;
  provider.maxTokens = 900;
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">设置</p>
        <h2>AI 提供方与安全</h2>
      </div>
    </div>

    <div class="page-grid">
      <form class="panel field-grid" @submit.prevent="saveSettings">
        <label class="field-box">
          <span>提供方</span>
          <select v-model="provider.type" class="select">
            <option value="mock">模拟</option>
            <option value="openai-compatible">OpenAI 兼容</option>
            <option value="local-http">本地 HTTP</option>
          </select>
        </label>
        <button class="ghost-button" type="button" @click="applyGloscOneDefaults">使用 Glosc One 默认配置</button>
        <label class="field-box">
          <span>基础 URL</span>
          <input v-model="provider.baseUrl" class="input" />
        </label>
        <label class="field-box">
          <span>模型</span>
          <input v-model="provider.model" class="input" />
        </label>
        <label class="field-box">
          <span>API Key</span>
          <input v-model="apiKey" class="input" type="password" placeholder="不会写入工作区导出包" />
          <span class="muted">Tauri 桌面版优先写入系统密钥链；浏览器预览只适合临时测试。</span>
        </label>
        <div class="row">
          <label class="field-box" style="flex: 1">
            <span>温度</span>
            <input v-model.number="provider.temperature" class="input" type="number" min="0" max="2" step="0.05" />
          </label>
          <label class="field-box" style="flex: 1">
            <span>最大 tokens</span>
            <input v-model.number="provider.maxTokens" class="input" type="number" min="128" max="4096" step="64" />
          </label>
        </div>
        <div class="field-box">
          <strong>预算护栏</strong>
          <span class="muted">本地预估，不扣费；超过上限时阻止发送。</span>
        </div>
        <div class="row">
          <label class="field-box" style="flex: 1">
            <span>最大输入 tokens</span>
            <input v-model.number="budget.maxInputTokens" class="input" type="number" min="1" step="128" />
          </label>
          <label class="field-box" style="flex: 1">
            <span>最大输出 tokens</span>
            <input v-model.number="budget.maxOutputTokens" class="input" type="number" min="1" step="64" />
          </label>
        </div>
        <label class="field-box">
          <span>单轮最大预估成本</span>
          <input v-model.number="budget.maxEstimatedCostPerTurn" class="input" type="number" min="0" step="0.000001" />
        </label>
        <div class="row">
          <button class="primary-button" type="button" @click="saveSettings">保存设置</button>
          <button class="ghost-button" type="button" @click="clearApiKey">清除 API Key</button>
        </div>
        <p v-if="feedback" class="muted">{{ feedback }}</p>
      </form>

      <aside class="panel field-grid">
        <h3>AI SDK 路由</h3>
        <div class="field-box">
          <strong>Glosc One</strong>
          <span class="muted">{{ GLOSC_ONE_BASE_URL }}</span>
          <span class="muted">聊天 {{ AI_MODEL_IDS.chat }}</span>
          <span class="muted">叙事 {{ AI_MODEL_IDS.narrative }}</span>
          <span class="muted">内容审核 {{ AI_MODEL_IDS.content }}</span>
          <span class="muted">图片 {{ AI_MODEL_IDS.image }}</span>
          <span class="muted">视频 {{ AI_MODEL_IDS.video }}</span>
          <span class="muted">语音 {{ AI_MODEL_IDS.voice }}</span>
        </div>
        <h3>内容安全</h3>
        <label class="field-box">
          <span>成人锁定内容</span>
          <select
            class="select"
            :value="store.envelope.settings.adultContentUnlocked ? 'on' : 'off'"
            @change="store.updateAdultUnlock(($event.target as HTMLSelectElement).value === 'on')"
          >
            <option value="off">默认锁定</option>
            <option value="on">本地解锁</option>
          </select>
        </label>
        <p class="muted">
          MVP 默认 SFW。成人内容、支付、收益和公开 UGC 都留到云端审核体系成熟后再启用。
        </p>
      </aside>
    </div>
  </section>
</template>

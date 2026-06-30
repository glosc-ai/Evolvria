<script setup lang="ts">
import { Save, RotateCcw } from "lucide-vue-next";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";

const app = useAppStore();
const settings = useSettingsStore();

async function save() {
  try {
    await settings.save();
    app.setNotice("设置已保存。");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "设置保存失败。");
  }
}

async function reset() {
  await settings.reset();
  app.setNotice("设置已重置。");
}
</script>

<template>
  <section class="mx-auto max-w-4xl">
    <h1 class="text-2xl font-semibold">设置</h1>
    <div class="mt-5 space-y-5">
      <div class="e-panel p-5">
        <h2 class="font-medium">Glosc One</h2>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="block text-sm">服务地址<input v-model="settings.settings.glosc_base_url" class="e-field mt-2" /></label>
          <label class="block text-sm">模型<input v-model="settings.settings.model" class="e-field mt-2" /></label>
          <label class="block text-sm">访问 Key<input v-model="settings.settings.glosc_token" class="e-field mt-2" type="password" /></label>
          <label class="block text-sm">超时秒数<input v-model.number="settings.settings.timeout_seconds" class="e-field mt-2" type="number" min="5" max="180" /></label>
        </div>
        <label class="mt-4 flex items-start gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm">
          <input v-model="settings.settings.local_token_risk_acknowledged" class="mt-1" type="checkbox" />
          <span>{{ settings.localTokenRiskText() }}</span>
        </label>
      </div>
      <div class="e-panel p-5">
        <h2 class="font-medium">行为</h2>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.confirm_ai_calls" type="checkbox" />AI 调用前确认</label>
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.show_usage_estimate" type="checkbox" />显示用量估算</label>
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.auto_save_enabled" type="checkbox" />自动保存</label>
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.auto_retry" type="checkbox" />失败自动重试</label>
          <label class="block text-sm">日志级别<select v-model="settings.settings.log_level" class="e-field mt-2"><option value="default">default</option><option value="debug">debug</option><option value="deep">deep（响应脱敏）</option></select></label>
          <label class="block text-sm">字体大小<select v-model="settings.settings.font_size" class="e-field mt-2"><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label>
        </div>
        <label class="mt-4 block text-sm">内容偏好<textarea v-model="settings.settings.content_preferences" class="e-field mt-2 min-h-28" /></label>
      </div>
      <div class="flex gap-3">
        <button class="e-btn e-btn-primary" type="button" @click="save"><Save :size="18" />保存设置</button>
        <button class="e-btn e-btn-danger" type="button" @click="reset"><RotateCcw :size="18" />重置</button>
      </div>
    </div>
  </section>
</template>

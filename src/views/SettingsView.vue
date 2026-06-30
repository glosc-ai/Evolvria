<script setup lang="ts">
import { computed, ref } from "vue";
import { PlugZap, RotateCcw, Save } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AppSelect from "@/components/AppSelect.vue";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";

const app = useAppStore();
const settings = useSettingsStore();
const checking = ref(false);
const canSave = computed(() => !settings.settings.glosc_token.trim() || settings.settings.local_token_risk_acknowledged);

async function testConnection() {
  checking.value = true;
  try {
    const result = await settings.checkConnection();
    if (result.ok) {
      app.setNotice(result.message ?? "Glosc One 连接测试通过。");
    } else {
      app.setError(result.error ?? result.message ?? "Glosc One 连接测试失败。");
    }
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "Glosc One 连接测试失败。");
  } finally {
    checking.value = false;
  }
}

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
      <Card class="p-5">
        <h2 class="font-medium">Glosc One</h2>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="block text-sm">服务地址<Input v-model="settings.settings.glosc_base_url" class="mt-2" /></label>
          <label class="block text-sm">模型<Input v-model="settings.settings.model" class="mt-2" /></label>
          <label class="block text-sm">访问 Key<Input v-model="settings.settings.glosc_token" class="mt-2" type="password" /></label>
          <label class="block text-sm">超时秒数<Input v-model.number="settings.settings.timeout_seconds" class="mt-2" type="number" min="5" max="180" /></label>
        </div>
        <label class="mt-4 flex items-start gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm">
          <input v-model="settings.settings.local_token_risk_acknowledged" class="mt-1" type="checkbox" />
          <span>{{ settings.localTokenRiskText() }}</span>
        </label>
      </Card>
      <Card class="p-5">
        <h2 class="font-medium">行为</h2>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.confirm_ai_calls" type="checkbox" />AI 调用前确认</label>
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.show_usage_estimate" type="checkbox" />显示用量估算</label>
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.auto_save_enabled" type="checkbox" />自动保存</label>
          <label class="flex items-center gap-3 text-sm"><input v-model="settings.settings.auto_retry" type="checkbox" />失败自动重试</label>
          <label class="block text-sm">
            日志级别
            <AppSelect
              v-model="settings.settings.log_level"
              :options="[
                { label: 'default', value: 'default' },
                { label: 'debug', value: 'debug' },
                { label: '深度（响应脱敏）', value: 'deep' }
              ]"
              class="mt-2"
            />
          </label>
          <label class="block text-sm">
            字体大小
            <AppSelect
              v-model="settings.settings.font_size"
              :options="[
                { label: '小', value: 'small' },
                { label: '中', value: 'medium' },
                { label: '大', value: 'large' }
              ]"
              class="mt-2"
            />
          </label>
        </div>
        <label class="mt-4 block text-sm">内容偏好<Textarea v-model="settings.settings.content_preferences" class="mt-2 min-h-28" /></label>
      </Card>
      <div class="flex gap-3">
        <Button variant="outline" type="button" :disabled="checking || !settings.settings.glosc_token.trim()" @click="testConnection"><PlugZap :size="18" />{{ checking ? "正在测试..." : "测试连接" }}</Button>
        <Button type="button" :disabled="!canSave" @click="save"><Save :size="18" />保存设置</Button>
        <Button variant="destructive" type="button" @click="reset"><RotateCcw :size="18" />重置</Button>
      </div>
      <p v-if="!canSave" class="text-sm text-amber-100/80">保存访问 Key 前需要勾选本机存储风险确认。</p>
    </div>
  </section>
</template>

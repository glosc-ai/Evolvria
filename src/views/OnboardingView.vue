<script setup lang="ts">
import { Save, SkipForward } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";

const router = useRouter();
const settings = useSettingsStore();
const app = useAppStore();

async function finish(saveToken: boolean) {
  try {
    if (!saveToken) settings.settings.glosc_token = "";
    settings.settings.onboarding_completed = true;
    await settings.save();
    app.setNotice(saveToken ? "Glosc One 设置已保存。" : "已跳过远端配置，当前使用本地模拟。");
    await router.push("/new-world");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "设置保存失败。");
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl">
    <h1 class="text-3xl font-semibold">初始配置</h1>
    <p class="e-muted mt-2 text-sm leading-6">Evolvria 可以离线运行；填写 Glosc One 后才会消耗远端额度。访问令牌会优先使用平台安全存储，平台不可用时需要确认本机保存风险。</p>
    <div class="e-panel mt-6 space-y-4 p-5">
      <label class="block text-sm">服务地址<input v-model="settings.settings.glosc_base_url" class="e-field mt-2" /></label>
      <label class="block text-sm">访问 Key<input v-model="settings.settings.glosc_token" class="e-field mt-2" type="password" placeholder="输入 Glosc AI Key" /></label>
      <label class="block text-sm">默认模型<input v-model="settings.settings.model" class="e-field mt-2" /></label>
      <label class="flex items-start gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm">
        <input v-model="settings.settings.local_token_risk_acknowledged" class="mt-1" type="checkbox" />
        <span>{{ settings.localTokenRiskText() }}</span>
      </label>
      <div class="flex flex-wrap gap-3">
        <button class="e-btn e-btn-primary" type="button" @click="finish(true)"><Save :size="18" />保存并开始</button>
        <button class="e-btn" type="button" @click="finish(false)"><SkipForward :size="18" />跳过，使用本地模拟</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PlugZap, Save, SkipForward } from "lucide-vue-next";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Input from "@/components/ui/Input.vue";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";

const router = useRouter();
const settings = useSettingsStore();
const app = useAppStore();
const checking = ref(false);
const hasToken = computed(() => Boolean(settings.settings.glosc_token.trim()));
const remoteSaveAllowed = computed(() => hasToken.value && settings.settings.local_token_risk_acknowledged);

async function testConnection() {
  checking.value = true;
  try {
    const result = await settings.checkConnection();
    if (result.ok) {
      app.setNotice(result.message ?? "Glosc One 连接测试通��。");
    } else {
      app.setError(result.error ?? result.message ?? "Glosc One 连接测试失败。");
    }
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "Glosc One 连接测试失败。");
  } finally {
    checking.value = false;
  }
}

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
    <p class="text-muted-foreground mt-2 text-sm leading-6">Evolvria 可以离线运行；填写 Glosc One 后才会消耗远端额度。访问令牌会保存在本机应用数据目录，保存前需要确认本机存储风险。</p>
    <Card class="mt-6 space-y-4 p-5">
      <label class="block text-sm">服务地址<Input v-model="settings.settings.glosc_base_url" class="mt-2" /></label>
      <label class="block text-sm">访问 Key<Input v-model="settings.settings.glosc_token" class="mt-2" type="password" placeholder="输入 Glosc AI Key" /></label>
      <label class="block text-sm">默认模型<Input v-model="settings.settings.model" class="mt-2" /></label>
      <label class="flex items-start gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm">
        <input v-model="settings.settings.local_token_risk_acknowledged" class="mt-1" type="checkbox" />
        <span>{{ settings.localTokenRiskText() }}</span>
      </label>
      <div class="flex flex-wrap gap-3">
        <Button variant="outline" type="button" :disabled="checking || !hasToken" @click="testConnection"><PlugZap :size="18" />{{ checking ? "正在测试..." : "测试连接" }}</Button>
        <Button type="button" :disabled="!remoteSaveAllowed" @click="finish(true)"><Save :size="18" />保存并开始</Button>
        <Button variant="outline" type="button" @click="finish(false)"><SkipForward :size="18" />跳过，使用本地模拟</Button>
      </div>
      <p v-if="hasToken && !settings.settings.local_token_risk_acknowledged" class="text-sm text-amber-100/80">保存访问 Key 前需要勾选本机存储风险确认。</p>
      <p v-else-if="!hasToken" class="text-sm text-white/54">不填写访问 Key 时，请使用本地模拟开始。</p>
    </Card>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PlugZap, Save, SkipForward } from "@lucide/vue";
import { useRouter } from "vue-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
    <Card class="mt-6">
      <CardHeader>
        <CardTitle>Glosc One</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel for="glosc-base-url">服务地址</FieldLabel>
            <Input id="glosc-base-url" v-model="settings.settings.glosc_base_url" />
          </Field>
          <Field>
            <FieldLabel for="glosc-token">访问 Key</FieldLabel>
            <Input id="glosc-token" v-model="settings.settings.glosc_token" type="password" placeholder="输入 Glosc AI Key" />
          </Field>
          <Field>
            <FieldLabel for="glosc-model">默认模型</FieldLabel>
            <Input id="glosc-model" v-model="settings.settings.model" />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="token-risk" v-model="settings.settings.local_token_risk_acknowledged" />
            <FieldLabel for="token-risk" class="font-normal">{{ settings.localTokenRiskText() }}</FieldLabel>
          </Field>
        </FieldGroup>
        <Alert v-if="hasToken && !settings.settings.local_token_risk_acknowledged" class="mt-5">
          <AlertDescription>保存访问 Key 前需要勾选本机存储风险确认。</AlertDescription>
        </Alert>
        <FieldDescription v-else-if="!hasToken" class="mt-5">不填写访问 Key 时，请使用本地模拟开始。</FieldDescription>
      </CardContent>
      <CardFooter class="flex flex-wrap gap-3">
        <Button variant="outline" type="button" :disabled="checking || !hasToken" @click="testConnection">
          <Spinner v-if="checking" data-icon="inline-start" />
          <PlugZap v-else data-icon="inline-start" />
          {{ checking ? "正在测试..." : "测试连接" }}
        </Button>
        <Button type="button" :disabled="!remoteSaveAllowed" @click="finish(true)">
          <Save data-icon="inline-start" />
          保存并开始
        </Button>
        <Button variant="outline" type="button" @click="finish(false)">
          <SkipForward data-icon="inline-start" />
          跳过，使用本地模拟
        </Button>
      </CardFooter>
    </Card>
  </section>
</template>

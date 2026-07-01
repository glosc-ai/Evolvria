<script setup lang="ts">
import { computed, ref } from "vue";
import { Monitor, Moon, PlugZap, RotateCcw, Save, Sun } from "@lucide/vue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import AppSelect from "@/components/AppSelect.vue";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";
import { useTheme } from "@/composables/useTheme";

const app = useAppStore();
const settings = useSettingsStore();
const { set: setTheme } = useTheme();
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
    <h1 class="font-serif text-2xl font-semibold">设置</h1>
    <Tabs default-value="glosc" class="mt-5">
      <TabsList>
        <TabsTrigger value="glosc">Glosc One</TabsTrigger>
        <TabsTrigger value="behavior">行为</TabsTrigger>
        <TabsTrigger value="appearance">外观</TabsTrigger>
      </TabsList>

      <TabsContent value="glosc">
        <Card>
          <CardHeader>
            <CardTitle>Glosc One</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel for="settings-base-url">服务地址</FieldLabel>
                <Input id="settings-base-url" v-model="settings.settings.glosc_base_url" />
              </Field>
              <Field>
                <FieldLabel for="settings-model">模型</FieldLabel>
                <Input id="settings-model" v-model="settings.settings.model" />
              </Field>
              <Field>
                <FieldLabel for="settings-token">访问 Key</FieldLabel>
                <Input id="settings-token" v-model="settings.settings.glosc_token" type="password" />
              </Field>
              <Field>
                <FieldLabel for="settings-timeout">超时秒数</FieldLabel>
                <Input id="settings-timeout" v-model.number="settings.settings.timeout_seconds" type="number" min="5" max="180" />
              </Field>
            </FieldGroup>
            <Field orientation="horizontal" class="mt-4">
              <Checkbox id="settings-token-risk" v-model="settings.settings.local_token_risk_acknowledged" />
              <FieldLabel for="settings-token-risk" class="font-normal">{{ settings.localTokenRiskText() }}</FieldLabel>
            </Field>
          </CardContent>
          <CardFooter class="flex flex-wrap gap-3">
            <Button variant="outline" type="button" :disabled="checking || !settings.settings.glosc_token.trim()" @click="testConnection">
              <Spinner v-if="checking" data-icon="inline-start" />
              <PlugZap v-else data-icon="inline-start" />
              {{ checking ? "正在测试..." : "测试连接" }}
            </Button>
            <Button type="button" :disabled="!canSave" @click="save">
              <Save data-icon="inline-start" />
              保存设置
            </Button>
            <Button variant="destructive" type="button" @click="reset">
              <RotateCcw data-icon="inline-start" />
              重置
            </Button>
          </CardFooter>
        </Card>
        <Alert v-if="!canSave" class="mt-4">
          <AlertDescription>保存访问 Key 前需要勾选本机存储风险确认。</AlertDescription>
        </Alert>
      </TabsContent>

      <TabsContent value="behavior">
        <Card>
          <CardHeader>
            <CardTitle>行为</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend variant="label">运行偏好</FieldLegend>
              <FieldGroup class="grid gap-3 md:grid-cols-2">
                <Field orientation="horizontal">
                  <FieldLabel for="auto-save">自动保存</FieldLabel>
                  <Switch id="auto-save" v-model="settings.settings.auto_save_enabled" />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel for="auto-retry">失败自动重试</FieldLabel>
                  <Switch id="auto-retry" v-model="settings.settings.auto_retry" />
                </Field>
              </FieldGroup>
            </FieldSet>
            <FieldGroup class="mt-6 grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>日志级别</FieldLabel>
                <AppSelect
                  v-model="settings.settings.log_level"
                  :options="[
                    { label: 'default', value: 'default' },
                    { label: 'debug', value: 'debug' },
                    { label: '深度（响应脱敏）', value: 'deep' }
                  ]"
                />
              </Field>
              <Field>
                <FieldLabel>字体大小</FieldLabel>
                <AppSelect
                  v-model="settings.settings.font_size"
                  :options="[
                    { label: '小', value: 'small' },
                    { label: '中', value: 'medium' },
                    { label: '大', value: 'large' }
                  ]"
                />
              </Field>
            </FieldGroup>
            <Field class="mt-6">
              <FieldLabel for="content-preferences">内容偏好</FieldLabel>
              <Textarea id="content-preferences" v-model="settings.settings.content_preferences" class="min-h-28" />
              <FieldDescription>会随世界扩写和行动解析一起传给模型。</FieldDescription>
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance">
        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent>
            <Field orientation="horizontal">
              <FieldTitle id="theme-label">主题</FieldTitle>
              <ToggleGroup type="single" aria-labelledby="theme-label" :spacing="2" :model-value="settings.settings.theme" @update:model-value="(v) => { if (v) setTheme(v as 'dark' | 'light') }">
                <ToggleGroupItem value="light"><Sun />浅色</ToggleGroupItem>
                <ToggleGroupItem value="dark"><Moon />深色</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription class="sr-only">跟随系统暂未支持,请手动选择浅色或深色。</FieldDescription>
            </Field>
            <Alert class="mt-4">
              <Monitor />
              <AlertDescription>羊皮纸主题在不同光线下的观感会略有差异,深色模式适合夜间沉浸阅读。</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </section>
</template>

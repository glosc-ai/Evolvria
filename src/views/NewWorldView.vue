<script setup lang="ts">
import { Plus, Sparkles, Trash2, UsersRound } from "lucide-vue-next";
import { computed, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import AppSelect from "@/components/AppSelect.vue";
import { cn } from "@/lib/utils";
import { completeSeedCharacter } from "@/services/ai";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settings";
import { useWorldStore } from "@/stores/world";
import type { WorldSeed } from "@/types/domain";

const router = useRouter();
const app = useAppStore();
const settings = useSettingsStore();
const world = useWorldStore();
const step = ref(1);
const bulkCharactersText = ref("");
const smartCompletionTarget = ref("");
const smartCompletionPulseTarget = ref("");
let smartCompletionPulseTimer: ReturnType<typeof setTimeout> | null = null;
type KeyCharacterDraft = WorldSeed["key_characters"][number];
const defaultGender = "其他";
const genderOptions = [
  { label: "男", value: "男" },
  { label: "女", value: "女" },
  { label: "其他", value: "其他" },
];
const genderOptionValues = new Set(genderOptions.map((option) => option.value));
const draft = reactive<WorldSeed>({
  world_name: "烟测世界",
  genre: "奇幻",
  tone: "冒险",
  limits: "保持可读性，避免极端血腥和酷刑描写。",
  narrative_detail: "详细",
  npc_autonomy_frequency: "中频",
  hero: { name: "测试者", gender: defaultGender, description: "记录员", goal: "验证世界循环", ability: "观察,推理", weakness: "过度谨慎", appearance_description: "" },
  key_characters: [
    { name: "璃安", gender: "女", role: "旧友", relationship: "同行", personality: "温和,谨慎", goal: "查清徽记来源", secret: "知道徽记与旧档案有关", action_tendency: "保护主角并暗中确认线索", description: "提供线索的人", appearance_description: "" },
    { name: "赛拉", gender: "女", role: "竞争者", relationship: "竞争", personality: "果断,好胜", goal: "抢先得到档案", secret: "曾为边境守望工作", action_tendency: "主动追踪遗迹并试探玩家", description: "推动冲突的人", appearance_description: "" },
  ],
});

const stepTitle = computed(() => ["世界设定", "主角", "关键角色", "偏好", "确认"][step.value - 1] ?? "新建世界");
const completionRunning = computed(() => Boolean(smartCompletionTarget.value));
const formBusy = computed(() => world.busy || completionRunning.value);

function normalizeGender(value?: string): string {
  const gender = value?.trim();
  return gender && genderOptionValues.has(gender) ? gender : defaultGender;
}

function emptyCharacter(overrides: Partial<KeyCharacterDraft> = {}): KeyCharacterDraft {
  return {
    name: "",
    role: "",
    relationship: "",
    personality: "",
    goal: "",
    secret: "",
    action_tendency: "",
    description: "",
    appearance_description: "",
    ...overrides,
    gender: normalizeGender(overrides.gender),
  };
}

function addCharacter(): void {
  draft.key_characters.push(emptyCharacter());
}

function removeCharacter(index: number): void {
  draft.key_characters.splice(index, 1);
}

function addBulkCharacters(): void {
  const parsed = parseBulkCharacters(bulkCharactersText.value);
  if (parsed.length === 0) {
    app.setError("没有识别到可添加的角色。");
    return;
  }
  draft.key_characters.push(...parsed);
  bulkCharactersText.value = "";
  app.setNotice(`已添加 ${parsed.length} 个角色。`);
}

function parseBulkCharacters(text: string): KeyCharacterDraft[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(parseCharacterLine)
    .filter((character) => Boolean(character.name.trim() || character.role.trim() || character.description.trim()));
}

function parseCharacterLine(line: string): KeyCharacterDraft {
  const keyed = parseKeyedCharacterLine(line);
  if (keyed) return emptyCharacter(keyed);
  const separator = /[|｜\t]/.test(line) ? /[|｜\t]/ : /[,，;；]/;
  const parts = line
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
  return emptyCharacter({
    name: parts[0] ?? "",
    gender: parts[1],
    role: parts[2] ?? "",
    relationship: parts[3] ?? "",
    personality: parts[4] ?? "",
    goal: parts[5] ?? "",
    secret: parts[6] ?? "",
    action_tendency: parts[7] ?? "",
    description: parts[8] ?? "",
    appearance_description: parts[9] ?? "",
  });
}

function parseKeyedCharacterLine(line: string): Partial<KeyCharacterDraft> | null {
  const result: Partial<KeyCharacterDraft> = {};
  const keyPattern = "姓名|名字|name|性别|gender|身份|role|关系|relationship|性格|personality|目标|goal|秘密|secret|行动倾向|倾向|描述|简介|description|外貌|形象|appearance";
  const matches = line.matchAll(new RegExp(`(${keyPattern})\\s*[:：]\\s*(.*?)(?=\\s+(?:${keyPattern})\\s*[:：]|[；;]|$)`, "gi"));
  for (const match of matches) {
    const key = normalizeCharacterKey(match[1]);
    if (!key) continue;
    result[key] = match[2].trim();
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeCharacterKey(key: string): keyof KeyCharacterDraft | null {
  const normalized = key.toLowerCase();
  if (["姓名", "名字", "name"].includes(normalized)) return "name";
  if (["性别", "gender"].includes(normalized)) return "gender";
  if (["身份", "role"].includes(normalized)) return "role";
  if (["关系", "relationship"].includes(normalized)) return "relationship";
  if (["性格", "personality"].includes(normalized)) return "personality";
  if (["目标", "goal"].includes(normalized)) return "goal";
  if (["秘密", "secret"].includes(normalized)) return "secret";
  if (["行动倾向", "倾向"].includes(normalized)) return "action_tendency";
  if (["描述", "简介", "description"].includes(normalized)) return "description";
  if (["外貌", "形象", "appearance"].includes(normalized)) return "appearance_description";
  return null;
}

function snapshotSeed(): WorldSeed {
  return JSON.parse(JSON.stringify(draft)) as WorldSeed;
}

function completionTarget(id: string): boolean {
  return smartCompletionTarget.value === id;
}

function triggerCompletionFeedback(id: string): void {
  smartCompletionPulseTarget.value = id;
  if (smartCompletionPulseTimer) clearTimeout(smartCompletionPulseTimer);
  smartCompletionPulseTimer = setTimeout(() => {
    if (smartCompletionPulseTarget.value === id) smartCompletionPulseTarget.value = "";
  }, 900);
}

function smartGenerateButtonClass(id: string): string {
  return cn(
    "min-w-28 transition-all duration-200 active:scale-95",
    smartCompletionPulseTarget.value === id && "scale-[1.03] ring-2 ring-ring/60",
    completionTarget(id) && "animate-pulse shadow-md",
  );
}

function smartGenerateButtonLabel(id: string): string {
  return completionTarget(id) ? "生成中..." : "智能生成";
}

onUnmounted(() => {
  if (smartCompletionPulseTimer) clearTimeout(smartCompletionPulseTimer);
});

async function smartCompleteHero(): Promise<void> {
  if (completionRunning.value) return;
  triggerCompletionFeedback("hero");
  smartCompletionTarget.value = "hero";
  try {
    if (!settings.loaded) await settings.load();
    const result = await completeSeedCharacter(
      {
        kind: "hero",
        seed: snapshotSeed(),
        character: { ...draft.hero },
      },
      settings.settings,
    );
    if (result.status !== "ok") {
      throw new Error(result.error || result.warnings.join("；") || "主角智能生成失败。");
    }
    assignCompletionFields(draft.hero as Record<string, string | undefined>, result.fields, heroCompletionKeys);
    app.setNotice(result.warnings.length > 0 ? `主角已智能生成：${result.warnings.join("；")}` : "主角已智能生成。");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "主角智能生成失败。");
  } finally {
    smartCompletionTarget.value = "";
  }
}

async function smartCompleteCharacter(character: KeyCharacterDraft, index: number): Promise<void> {
  if (completionRunning.value) return;
  const target = `character-${index}`;
  triggerCompletionFeedback(target);
  smartCompletionTarget.value = target;
  try {
    if (!settings.loaded) await settings.load();
    const result = await completeSeedCharacter(
      {
        kind: "key_character",
        seed: snapshotSeed(),
        character: { ...character },
      },
      settings.settings,
    );
    if (result.status !== "ok") {
      throw new Error(result.error || result.warnings.join("；") || "关键角色智能生成失败。");
    }
    assignCompletionFields(character as Record<string, string | undefined>, result.fields, keyCharacterCompletionKeys);
    app.setNotice(result.warnings.length > 0 ? `关键角色已智能生成：${result.warnings.join("；")}` : "关键角色已智能生成。");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "关键角色智能生成失败。");
  } finally {
    smartCompletionTarget.value = "";
  }
}

const heroCompletionKeys = ["name", "gender", "description", "goal", "ability", "weakness", "appearance_description"];
const keyCharacterCompletionKeys = ["name", "gender", "role", "relationship", "personality", "goal", "secret", "action_tendency", "description", "appearance_description"];

function assignCompletionFields(target: Record<string, string | undefined>, fields: Record<string, string>, keys: string[]): void {
  for (const key of keys) {
    const value = fields[key]?.trim();
    if (value) target[key] = key === "gender" ? normalizeGender(value) : value;
  }
}

async function requestCreate() {
  if (formBusy.value) return;
  await create();
}

async function create() {
  try {
    const result = await world.createWorld(JSON.parse(JSON.stringify(draft)));
    app.setNotice(result.message);
    await router.push("/exploration");
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "世界创建失败。");
  }
}
</script>

<template>
  <section class="mx-auto max-w-5xl">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-serif text-3xl font-semibold">新建世界</h1>
        <Badge variant="secondary" class="mt-2">第 {{ step }} / 5 步</Badge>
      </div>
      <Button variant="outline" type="button" @click="router.push('/')">返回首页</Button>
    </div>
    <Progress :model-value="(step / 5) * 100" class="mt-4" />

    <div class="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <CardTitle>{{ stepTitle }}</CardTitle>
          <CardDescription>按步骤填写世界种子，最后再调用模型扩写。</CardDescription>
        </CardHeader>
        <CardContent>
        <FieldGroup v-if="step === 1" class="gap-4">
          <Field>
            <FieldLabel for="world-name">世界名称</FieldLabel>
            <Input id="world-name" v-model="draft.world_name" />
          </Field>
          <Field>
            <FieldLabel>类型</FieldLabel>
            <AppSelect v-model="draft.genre" :options="[{label: '奇幻', value: '奇幻'}, {label: '科幻', value: '科幻'}, {label: '现代都市', value: '现代都市'}, {label: '武侠', value: '武侠'}]" />
          </Field>
          <Field>
            <FieldLabel>基调</FieldLabel>
            <AppSelect v-model="draft.tone" :options="[{label: '冒险', value: '冒险'}, {label: '政治', value: '政治'}, {label: '悬疑', value: '悬疑'}, {label: '温情', value: '温情'}]" />
          </Field>
        </FieldGroup>
        <FieldGroup v-else-if="step === 2" class="gap-4">
          <div class="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              type="button"
              :class="smartGenerateButtonClass('hero')"
              :aria-busy="completionTarget('hero')"
              :disabled="formBusy"
              @click="smartCompleteHero"
            >
              <Spinner v-if="completionTarget('hero')" data-icon="inline-start" />
              <Sparkles v-else data-icon="inline-start" />
              {{ smartGenerateButtonLabel('hero') }}
            </Button>
          </div>
          <FieldGroup class="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel for="hero-name">主角姓名</FieldLabel>
              <Input id="hero-name" v-model="draft.hero.name" />
            </Field>
            <Field>
              <FieldLabel>性别</FieldLabel>
              <AppSelect v-model="draft.hero.gender" :options="genderOptions" />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel for="hero-description">身份描述</FieldLabel>
            <Textarea id="hero-description" v-model="draft.hero.description" class="min-h-24" />
          </Field>
          <Field>
            <FieldLabel for="hero-appearance">外貌描述</FieldLabel>
            <Textarea id="hero-appearance" v-model="draft.hero.appearance_description" class="min-h-24" placeholder="可留空；生成形象时会根据身份、目标和世界观自动补全" />
          </Field>
          <Field>
            <FieldLabel for="hero-goal">目标</FieldLabel>
            <Input id="hero-goal" v-model="draft.hero.goal" />
          </Field>
          <FieldGroup class="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel for="hero-ability">能力</FieldLabel>
              <Input id="hero-ability" v-model="draft.hero.ability" />
            </Field>
            <Field>
              <FieldLabel for="hero-weakness">弱点</FieldLabel>
              <Input id="hero-weakness" v-model="draft.hero.weakness" />
            </Field>
          </FieldGroup>
        </FieldGroup>
        <div v-else-if="step === 3" class="flex flex-col gap-4">
          <FieldSet class="rounded-md border p-4">
            <FieldLegend>批量添加</FieldLegend>
            <Field>
              <FieldLabel for="bulk-characters">角色文本</FieldLabel>
              <Textarea
                id="bulk-characters"
                v-model="bulkCharactersText"
                class="min-h-28"
                placeholder="璃安｜女｜旧友｜同行｜温和,谨慎｜查清徽记来源｜知道徽记与旧档案有关｜保护主角并暗中确认线索｜提供线索的人｜银灰短发，旧式斗篷"
              />
            </Field>
            <Button variant="outline" type="button" :disabled="formBusy" @click="addBulkCharacters">
              <UsersRound data-icon="inline-start" />
              批量添加
            </Button>
          </FieldSet>
          <FieldSet v-for="(character, index) in draft.key_characters" :key="index" class="rounded-md border p-4">
            <FieldLegend>关键角色 {{ index + 1 }}</FieldLegend>
            <div class="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                :class="smartGenerateButtonClass(`character-${index}`)"
                :aria-busy="completionTarget(`character-${index}`)"
                :disabled="formBusy"
                @click="smartCompleteCharacter(character, index)"
              >
                <Spinner v-if="completionTarget(`character-${index}`)" data-icon="inline-start" />
                <Sparkles v-else data-icon="inline-start" />
                {{ smartGenerateButtonLabel(`character-${index}`) }}
              </Button>
              <Button variant="ghost" size="icon" type="button" title="删除角色" :disabled="formBusy" @click="removeCharacter(index)">
                <Trash2 />
              </Button>
            </div>
            <FieldGroup class="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel :for="`character-${index}-name`">姓名</FieldLabel>
                <Input :id="`character-${index}-name`" v-model="character.name" />
              </Field>
              <Field>
                <FieldLabel>性别</FieldLabel>
                <AppSelect v-model="character.gender" :options="genderOptions" />
              </Field>
              <Field>
                <FieldLabel :for="`character-${index}-role`">身份</FieldLabel>
                <Input :id="`character-${index}-role`" v-model="character.role" />
              </Field>
              <Field>
                <FieldLabel :for="`character-${index}-relationship`">与主角关系</FieldLabel>
                <Input :id="`character-${index}-relationship`" v-model="character.relationship" />
              </Field>
              <Field>
                <FieldLabel :for="`character-${index}-personality`">性格标签</FieldLabel>
                <Input :id="`character-${index}-personality`" v-model="character.personality" />
              </Field>
              <Field>
                <FieldLabel :for="`character-${index}-goal`">目标</FieldLabel>
                <Input :id="`character-${index}-goal`" v-model="character.goal" />
              </Field>
              <Field>
                <FieldLabel :for="`character-${index}-secret`">秘密</FieldLabel>
                <Input :id="`character-${index}-secret`" v-model="character.secret" />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel :for="`character-${index}-description`">描述</FieldLabel>
              <Input :id="`character-${index}-description`" v-model="character.description" />
            </Field>
            <Field>
              <FieldLabel :for="`character-${index}-appearance`">外貌描述</FieldLabel>
              <Textarea
                :id="`character-${index}-appearance`"
                v-model="character.appearance_description"
                class="min-h-20"
                placeholder="可留空；生成形象时会根据角色卡自动补全"
              />
            </Field>
            <Field>
              <FieldLabel :for="`character-${index}-tendency`">行动倾向</FieldLabel>
              <Textarea :id="`character-${index}-tendency`" v-model="character.action_tendency" class="min-h-20" />
            </Field>
          </FieldSet>
          <Button variant="outline" type="button" :disabled="formBusy" @click="addCharacter">
            <Plus data-icon="inline-start" />
            添加角色
          </Button>
        </div>
        <FieldGroup v-else-if="step === 4" class="gap-4">
          <Field>
            <FieldLabel for="world-limits">内容偏好与禁用内容</FieldLabel>
            <Textarea id="world-limits" v-model="draft.limits" class="min-h-24" />
          </Field>
          <Field>
            <FieldLabel>叙事详细度</FieldLabel>
            <AppSelect v-model="draft.narrative_detail" :options="[{label: '简洁', value: '简洁'}, {label: '适中', value: '适中'}, {label: '详细', value: '详细'}]" />
          </Field>
          <Field>
            <FieldLabel>NPC 自主频率</FieldLabel>
            <AppSelect v-model="draft.npc_autonomy_frequency" :options="[{label: '低频', value: '低频'}, {label: '中频', value: '中频'}, {label: '高频', value: '高频'}]" />
          </Field>
        </FieldGroup>
        <div v-else class="flex flex-col gap-4">
          <Alert>
            <AlertTitle>{{ draft.world_name }} · {{ draft.genre }} · {{ draft.tone }}</AlertTitle>
            <AlertDescription>
              主角：{{ draft.hero.name }}，目标：{{ draft.hero.goal }}<br />
              关键角色：{{ draft.key_characters.map((c) => c.name ? `${c.name}（${c.gender || defaultGender}）` : "").filter(Boolean).join("、") }}
            </AlertDescription>
          </Alert>
        </div>
        </CardContent>

        <CardFooter class="flex justify-between">
          <Button variant="outline" :disabled="step === 1 || formBusy" type="button" @click="step -= 1">上一步</Button>
          <Button v-if="step < 5" :disabled="formBusy" type="button" @click="step += 1">下一步</Button>
          <Button v-else :disabled="formBusy" type="button" @click="requestCreate">
            <Spinner v-if="world.busy" data-icon="inline-start" />
            {{ world.busy ? "正在扩写..." : "创建并扩写世界" }}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>预览</CardTitle>
          <CardDescription>种子会先进入结构校验，再用于生成初始世界。</CardDescription>
        </CardHeader>
        <CardContent>
        <div class="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{{ draft.limits }}</p>
          <p>叙事：{{ draft.narrative_detail }} · NPC：{{ draft.npc_autonomy_frequency }}</p>
          <p>地图、地区、地点和路线会在创建世界时一次性生成，创建后只能探索和记录，不能再修改地图结构。</p>
          <p>所有 AI 请求都会先校验 JSON 和状态 patch，失败不会修改世界。</p>
        </div>
        </CardContent>
      </Card>
    </div>

  </section>
</template>

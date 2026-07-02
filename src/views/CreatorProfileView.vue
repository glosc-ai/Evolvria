<script setup lang="ts">
import { computed, reactive } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { Flag, PenTool, ShieldCheck, Sparkles, Wallet } from "lucide-vue-next";
import { labelFor } from "@/lib/display";
import { useAppStore } from "@/stores/app";

const route = useRoute();
const store = useAppStore();
const creatorId = computed(() => String(route.params.creatorId || "creator_local"));
const creatorName = computed(() =>
  store.envelope.settings.cloudAccount?.id === creatorId.value
    ? store.envelope.settings.cloudAccount.displayName
    : createdStorylines.value[0]?.createdBy.name ?? createdCharacters.value[0]?.createdBy.name ?? creatorId.value,
);
const createdStorylines = computed(() =>
  Object.values(store.envelope.entities.storylines)
    .filter((storyline) => storyline.createdBy.id === creatorId.value && !storyline.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);
const createdCharacters = computed(() =>
  Object.values(store.envelope.entities.characters)
    .filter((character) => character.createdBy.id === creatorId.value && !character.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
);
const publicReadyStorylines = computed(() =>
  createdStorylines.value.filter((storyline) =>
    storyline.visibility === "public" ||
    storyline.version.status === "published" ||
    storyline.moderation.state === "approved",
  ),
);
const localDraftStorylines = computed(() =>
  createdStorylines.value.filter((storyline) => !publicReadyStorylines.value.some((publicStory) => publicStory.id === storyline.id)),
);
const moderationCases = computed(() =>
  store.moderationQueue.filter((item) =>
    item.targetType === "creator" && item.targetId === creatorId.value ||
    createdStorylines.value.some((storyline) => item.targetType === "storyline" && item.targetId === storyline.id) ||
    createdCharacters.value.some((character) => item.targetType === "character" && item.targetId === character.id),
  ),
);
const earnings = computed(() => store.creatorEarnings.filter((earning) =>
  createdStorylines.value.some((storyline) => storyline.id === earning.sourceEntityId),
));
const totalStats = computed(() => {
  const starts = createdStorylines.value.reduce((sum, storyline) => sum + (store.envelope.entities.engagementStats[storyline.id]?.starts ?? 0), 0);
  const messages = createdStorylines.value.reduce((sum, storyline) => sum + (store.envelope.entities.engagementStats[storyline.id]?.messages ?? 0), 0);
  const available = earnings.value.filter((earning) => earning.status === "available").reduce((sum, earning) => sum + earning.amount, 0);
  return { starts, messages, available };
});
const reportForm = reactive({
  reason: "创作者主页本地举报预览。",
});
const feedback = reactive({ message: "" });

async function reportCreator() {
  await store.submitLocalModerationCase("creator", creatorId.value, reportForm.reason);
  feedback.message = "创作者举报已加入本地审核队列。";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">创作者主页预览</p>
        <h2>{{ creatorName }}</h2>
      </div>
      <RouterLink class="ghost-button" to="/account">
        <ShieldCheck :size="16" />
        审核队列
      </RouterLink>
    </div>

    <div class="page-grid">
      <div class="field-grid">
        <section class="panel field-grid">
          <h3><Sparkles :size="17" /> 已发布与公开就绪</h3>
          <div v-if="publicReadyStorylines.length" class="field-grid">
            <article v-for="storyline in publicReadyStorylines" :key="storyline.id" class="field-box">
              <strong>{{ storyline.title }}</strong>
              <span class="muted">{{ labelFor(storyline.version.status) }} · {{ labelFor(storyline.moderation.state) }} · {{ storyline.rating }}</span>
              <span class="muted">{{ storyline.summary }}</span>
              <RouterLink class="ghost-button" :to="`/storylines/${storyline.id}`">打开故事线</RouterLink>
            </article>
          </div>
          <p v-else class="muted">还没有公开就绪的故事线。本地审核通过的条目会显示在这里。</p>
        </section>

        <section class="panel field-grid">
          <h3><PenTool :size="17" /> 本地草稿</h3>
          <div v-if="localDraftStorylines.length" class="field-grid">
            <article v-for="storyline in localDraftStorylines" :key="storyline.id" class="field-box">
              <strong>{{ storyline.title }}</strong>
              <span class="muted">{{ labelFor(storyline.version.status) }} · {{ labelFor(storyline.moderation.state) }} · {{ labelFor(storyline.visibility) }}</span>
              <span class="muted">{{ storyline.tags.join(", ") }}</span>
              <RouterLink class="ghost-button" :to="`/create?storyId=${storyline.id}`">编辑内容包</RouterLink>
            </article>
          </div>
          <p v-else class="muted">此创作者还没有私有草稿。</p>
        </section>

        <form class="panel field-grid" @submit.prevent="reportCreator">
          <h3><Flag :size="17" /> 举报创作者</h3>
          <label class="field-box">
            <span>原因</span>
            <textarea v-model="reportForm.reason" class="textarea" />
          </label>
          <button class="danger-button" type="submit">创建本地创作者举报</button>
          <p v-if="feedback.message" class="muted">{{ feedback.message }}</p>
        </form>
      </div>

      <aside class="panel field-grid">
        <h3><Wallet :size="17" /> 主页快照</h3>
        <div class="field-box">
          <strong>{{ createdStorylines.length }} 条故事线</strong>
          <span class="muted">{{ createdCharacters.length }} 个角色</span>
          <span class="muted">{{ publicReadyStorylines.length }} 条公开就绪 · {{ localDraftStorylines.length }} 个本地草稿</span>
        </div>
        <div class="field-box">
          <strong>{{ totalStats.starts }} 次启动</strong>
          <span class="muted">{{ totalStats.messages }} 条生成消息</span>
          <span class="muted">{{ totalStats.available }} 可用创作者积分预览</span>
        </div>
        <div class="field-box">
          <strong>{{ moderationCases.length }} 个审核案例</strong>
          <span class="muted">包含此主页拥有的创作者、故事线和角色目标。</span>
        </div>
        <div class="field-grid">
          <div v-for="item in moderationCases.slice(0, 5)" :key="item.id" class="field-box">
            <strong>{{ labelFor(item.status) }} / {{ labelFor(item.targetType) }}</strong>
            <span class="muted">{{ item.reason }}</span>
          </div>
        </div>
        <div class="field-box">
          <strong>{{ earnings.length }} 条收益预览</strong>
          <span v-for="earning in earnings.slice(0, 5)" :key="earning.id" class="muted">
            {{ labelFor(earning.status) }} · {{ earning.amount }} {{ earning.currency }} · {{ earning.sourceEntityId }}
          </span>
        </div>
      </aside>
    </div>
  </section>
</template>

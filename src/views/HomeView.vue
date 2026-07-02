<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { ArrowRight, BookOpen, Boxes, PenTool } from "lucide-vue-next";
import { labelFor } from "@/lib/display";
import { useAppStore } from "@/stores/app";

const store = useAppStore();
const recentChat = computed(() => store.activeChats[0]);
const featured = computed(() => store.storylines.slice(0, 4));
const ledgerTotal = computed(() =>
  Object.values(store.envelope.entities.creditLedger).reduce((sum, entry) => sum + entry.estimatedCost, 0).toFixed(4),
);
</script>

<template>
  <section class="page">
    <div class="hero-panel">
      <div>
        <p class="eyebrow">本地优先 AI 故事宇宙</p>
        <h2>打开一个会记住你的故事宇宙。</h2>
        <p>
          Evolvria 按项目文档的 MVP 先交付本地可玩闭环：原创故事线、玩家档案启动、模拟 AI 聊天、自动保存、创作草稿和导出。
        </p>
        <div class="cluster">
          <RouterLink class="primary-button" to="/library">
            <Boxes :size="17" />
            浏览内容库
          </RouterLink>
          <RouterLink class="secondary-button" to="/create">
            <PenTool :size="17" />
            创建故事
          </RouterLink>
        </div>
      </div>
      <div class="panel">
        <h3>工作区状态</h3>
        <p class="muted small">提供方</p>
        <strong>{{ labelFor(store.envelope.settings.provider.type) }} / {{ store.envelope.settings.provider.model }}</strong>
        <p class="muted small">本地预估</p>
        <strong>{{ ledgerTotal }} 积分</strong>
        <p class="muted small">内容锁</p>
        <strong>{{ store.envelope.settings.adultContentUnlocked ? "成人内容已解锁" : "默认 SFW" }}</strong>
      </div>
    </div>

    <div class="page-grid" style="margin-top: 22px">
      <div>
        <div class="section-title">
          <h2>精选故事</h2>
          <RouterLink class="ghost-button" to="/library">全部故事 <ArrowRight :size="16" /></RouterLink>
        </div>
        <div class="card-grid">
          <RouterLink v-for="story in featured" :key="story.id" class="media-card" :to="`/storylines/${story.id}`">
            <div class="cover" :class="{ mist: story.rating === 'M17' }">
              <span class="tag" :class="story.rating === 'SFW' ? 'sfw' : 'm17'">{{ story.rating }}</span>
            </div>
            <div class="card-body">
              <h3>{{ story.title }}</h3>
              <p>{{ story.tagline }}</p>
              <div class="tags">
                <span v-for="tag in story.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </div>
          </RouterLink>
        </div>
      </div>

      <aside class="panel">
        <h3>继续游玩</h3>
        <template v-if="recentChat">
          <p class="muted">{{ recentChat.title }}</p>
          <RouterLink class="primary-button" :to="`/chat/${recentChat.id}`">
            <BookOpen :size="16" />
            继续聊天
          </RouterLink>
        </template>
        <template v-else>
          <p class="muted">还没有聊天。选择一个故事线即可开始。</p>
          <RouterLink class="secondary-button" to="/library">从内容库开始</RouterLink>
        </template>
      </aside>
    </div>
  </section>
</template>

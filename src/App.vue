<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { BookOpen, Cloud, Home, PenTool, Save, Search, Settings, Sparkles } from "lucide-vue-next";
import { labelFor } from "@/lib/display";
import { useAppStore } from "@/stores/app";

const store = useAppStore();
const route = useRoute();

onMounted(() => {
  void store.init();
});

const nav = [
  { to: "/", label: "首页", icon: Home },
  { to: "/library", label: "内容库", icon: Search },
  { to: "/create", label: "创作", icon: PenTool },
  { to: "/saves", label: "存档", icon: Save },
  { to: "/settings", label: "设置", icon: Settings },
  { to: "/account", label: "云端", icon: Cloud },
];

const activeChat = computed(() => store.activeChats[0]);
</script>

<template>
  <div class="app-shell">
    <aside class="side-rail" aria-label="主导航">
      <RouterLink class="brand-mark" to="/" aria-label="Evolvria 首页">
        <Sparkles :size="22" />
      </RouterLink>
      <nav class="rail-nav">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="rail-link"
          :class="{ active: route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to)) }"
          :title="item.label"
        >
          <component :is="item.icon" :size="20" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="app-main">
      <header class="top-bar">
        <div>
          <p class="eyebrow">Evolvria 本地优先叙事工作室</p>
          <h1>{{ store.envelope.workspace.name }}</h1>
        </div>
        <div class="top-actions">
          <RouterLink v-if="activeChat" class="ghost-button" :to="`/chat/${activeChat.id}`">
            <BookOpen :size="16" />
            继续
          </RouterLink>
          <span class="status-pill" :class="{ saving: store.saving }">
            {{ store.saving ? "保存中" : "已保存" }}
          </span>
          <span class="status-pill provider">{{ labelFor(store.envelope.settings.provider.type) }}</span>
        </div>
      </header>

      <div v-if="!store.ready" class="loading-state">正在加载本地工作区...</div>
      <div v-else-if="store.error" class="error-banner">{{ store.error }}</div>
      <RouterView v-else />
    </main>

    <nav class="bottom-nav" aria-label="移动端主导航">
      <RouterLink v-for="item in nav.slice(0, 5)" :key="item.to" :to="item.to" class="bottom-link">
        <component :is="item.icon" :size="19" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

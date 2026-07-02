<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { BookOpen, Cloud, Home, PenTool, Save, Search, Settings, Sparkles } from "lucide-vue-next";
import { useAppStore } from "@/stores/app";

const store = useAppStore();
const route = useRoute();

onMounted(() => {
  void store.init();
});

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/library", label: "Library", icon: Search },
  { to: "/create", label: "Create", icon: PenTool },
  { to: "/saves", label: "Saves", icon: Save },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/account", label: "Cloud", icon: Cloud },
];

const activeChat = computed(() => store.activeChats[0]);
</script>

<template>
  <div class="app-shell">
    <aside class="side-rail" aria-label="Primary">
      <RouterLink class="brand-mark" to="/" aria-label="Evolvria home">
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
          <p class="eyebrow">Evolvria Local-First Narrative Studio</p>
          <h1>{{ store.envelope.workspace.name }}</h1>
        </div>
        <div class="top-actions">
          <RouterLink v-if="activeChat" class="ghost-button" :to="`/chat/${activeChat.id}`">
            <BookOpen :size="16" />
            Continue
          </RouterLink>
          <span class="status-pill" :class="{ saving: store.saving }">
            {{ store.saving ? "Saving" : "Saved" }}
          </span>
          <span class="status-pill provider">{{ store.envelope.settings.provider.type }}</span>
        </div>
      </header>

      <div v-if="!store.ready" class="loading-state">Loading local workspace...</div>
      <div v-else-if="store.error" class="error-banner">{{ store.error }}</div>
      <RouterView v-else />
    </main>

    <nav class="bottom-nav" aria-label="Mobile primary">
      <RouterLink v-for="item in nav.slice(0, 5)" :key="item.to" :to="item.to" class="bottom-link">
        <component :is="item.icon" :size="19" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

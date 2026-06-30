<script setup lang="ts">
import {
  BookOpen,
  Compass,
  Database,
  Home,
  Map,
  Menu,
  MessageSquareText,
  ScrollText,
  Settings,
  Users,
  X,
} from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { usePlatformStore } from "@/stores/platform";
import { useSettingsStore } from "@/stores/settings";
import { useWorldStore } from "@/stores/world";
import Button from "@/components/ui/Button.vue";

const app = useAppStore();
const settings = useSettingsStore();
const platform = usePlatformStore();
const world = useWorldStore();
const route = useRoute();
const router = useRouter();
const mobileMenuOpen = ref(false);

const navItems = computed(() => [
  { to: "/", label: "首页", icon: Home, enabled: true },
  { to: "/exploration", label: "探索", icon: Compass, enabled: world.hasWorld },
  { to: "/map", label: "地图", icon: Map, enabled: world.hasWorld },
  { to: "/characters", label: "人物", icon: Users, enabled: world.hasWorld },
  { to: "/locations", label: "地点", icon: BookOpen, enabled: world.hasWorld },
  { to: "/timeline", label: "时间线", icon: ScrollText, enabled: world.hasWorld },
  { to: "/threads", label: "线索", icon: MessageSquareText, enabled: world.hasWorld },
  { to: "/world-lore", label: "世界观", icon: BookOpen, enabled: world.hasWorld },
  { to: "/saves", label: "存档", icon: Database, enabled: true },
  { to: "/settings", label: "设置", icon: Settings, enabled: true },
]);

onMounted(async () => {
  await settings.load();
  await platform.load();
  await world.load();
  if (settings.onboardingRequired && route.name === "main_menu") {
    await router.replace({ name: "onboarding" });
  }
});

watch(
  () => route.fullPath,
  () => {
    app.clearBanners();
    mobileMenuOpen.value = false;
  },
);
</script>

<template>
  <div class="min-h-dvh text-white">
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[#111817]/95 p-4 lg:block">
      <div class="mb-6">
        <div class="text-lg font-semibold tracking-wide">Evolvria</div>
        <div class="text-muted-foreground mt-1 text-xs">AI 驱动的本地优先叙事世界</div>
      </div>
      <nav class="space-y-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.enabled ? item.to : route.fullPath"
          class="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition"
          :class="route.path === item.to ? 'bg-emerald-500/18 text-emerald-50' : item.enabled ? 'text-white/72 hover:bg-white/8 hover:text-white' : 'cursor-not-allowed text-white/28'"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="absolute inset-x-4 bottom-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-white/58">
        <div>{{ platform.capabilities.os }} · {{ platform.capabilities.mobile ? "移动端" : "桌面/浏览器" }}</div>
        <div v-if="world.hasWorld" class="mt-1 truncate">{{ world.world.name }} · 第 {{ world.world.current_time.day }} 天 {{ world.world.current_time.hour }} 时</div>
      </div>
    </aside>

    <header class="safe-top sticky top-0 z-20 border-b border-white/10 bg-[#101615]/95 px-4 py-3 backdrop-blur lg:hidden">
      <div class="flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="打开导航" @click="mobileMenuOpen = true">
          <Menu :size="20" />
        </Button>
        <div class="text-sm font-semibold">Evolvria</div>
        <RouterLink class="inline-flex h-10 w-10 items-center justify-center rounded-md" to="/settings" aria-label="设置">
          <Button variant="ghost" size="icon">
            <Settings :size="18" />
          </Button>
        </RouterLink>
      </div>
    </header>

    <div v-if="mobileMenuOpen" class="fixed inset-0 z-40 bg-black/60 lg:hidden" @click.self="mobileMenuOpen = false">
      <div class="safe-top h-full w-72 max-w-[86vw] border-r border-white/10 bg-[#111817] p-4">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <div class="font-semibold">Evolvria</div>
            <div class="text-muted-foreground text-xs">导航</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭导航" @click="mobileMenuOpen = false">
            <X :size="18" />
          </Button>
        </div>
        <nav class="space-y-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.enabled ? item.to : route.fullPath"
            class="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm"
            :class="route.path === item.to ? 'bg-emerald-500/18 text-emerald-50' : item.enabled ? 'text-white/72' : 'text-white/28'"
          >
            <component :is="item.icon" :size="18" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>
    </div>

    <main class="mobile-bottom-offset min-h-dvh px-4 py-5 sm:px-6 lg:ml-64 lg:px-8">
      <div v-if="app.lastError" class="mb-4 rounded-md border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-50">{{ app.lastError }}</div>
      <div v-if="app.lastNotice" class="mb-4 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-50">{{ app.lastNotice }}</div>
      <RouterView />
    </main>

    <nav class="safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-white/10 bg-[#101615]/96 px-2 pt-2 lg:hidden">
      <RouterLink v-for="item in navItems.slice(1, 6)" :key="item.to" :to="item.enabled ? item.to : route.fullPath" class="flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px]" :class="route.path === item.to ? 'text-emerald-300' : item.enabled ? 'text-white/62' : 'text-white/25'">
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import {
  BookOpen,
  Compass,
  Database,
  Home,
  Map as MapIcon,
  MessageSquareText,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Users,
} from "@lucide/vue";
import { computed, onMounted } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app";
import { usePlatformStore } from "@/stores/platform";
import { useSettingsStore } from "@/stores/settings";
import { useWorldStore } from "@/stores/world";
import { useTheme } from "@/composables/useTheme";

const app = useAppStore();
const settings = useSettingsStore();
const platform = usePlatformStore();
const world = useWorldStore();
const route = useRoute();
const router = useRouter();
const { isDark, apply: applyTheme, toggle: toggleTheme } = useTheme();

interface NavItem {
  to: string;
  label: string;
  icon: Component;
  enabled: boolean;
}

const navItems = computed<NavItem[]>(() => [
  { to: "/", label: "首页", icon: Home, enabled: true },
  { to: "/exploration", label: "探索", icon: Compass, enabled: world.hasWorld },
  { to: "/map", label: "地图", icon: MapIcon, enabled: world.hasWorld },
  { to: "/characters", label: "人物", icon: Users, enabled: world.hasWorld },
  { to: "/locations", label: "地点", icon: BookOpen, enabled: world.hasWorld },
  { to: "/timeline", label: "时间线", icon: ScrollText, enabled: world.hasWorld },
  { to: "/threads", label: "线索", icon: MessageSquareText, enabled: world.hasWorld },
  { to: "/world-lore", label: "世界观", icon: BookOpen, enabled: world.hasWorld },
  { to: "/saves", label: "存档", icon: Database, enabled: true },
  { to: "/settings", label: "设置", icon: Settings, enabled: true },
]);

function isActive(to: string): boolean {
  return route.path === to;
}

onMounted(async () => {
  await settings.load();
  applyTheme();
  await platform.load();
  await world.load();
  if (settings.onboardingRequired && route.name === "main_menu") {
    await router.replace({ name: "onboarding" });
  }
});
</script>

<template>
  <SidebarProvider>
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" as-child>
              <RouterLink to="/" class="flex items-center gap-2">
                <div class="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-serif text-lg font-semibold">E</div>
                <div class="flex flex-col gap-0.5 leading-none">
                  <span class="font-serif text-base font-semibold">Evolvria</span>
                  <span class="text-xs text-muted-foreground">AI 叙事世界</span>
                </div>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in navItems" :key="item.to">
                <SidebarMenuButton
                  v-if="item.enabled"
                  :is-active="isActive(item.to)"
                  :tooltip="item.label"
                  as-child
                >
                  <RouterLink :to="item.to">
                    <component :is="item.icon" />
                    <span>{{ item.label }}</span>
                  </RouterLink>
                </SidebarMenuButton>
                <SidebarMenuButton
                  v-else
                  :tooltip="`${item.label}（需先创建世界）`"
                  disabled
                >
                  <component :is="item.icon" />
                  <span>{{ item.label }}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div v-if="world.hasWorld" class="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs text-sidebar-foreground">
          <div class="truncate font-medium">{{ world.world.name }}</div>
          <div class="mt-1 text-muted-foreground">第 {{ world.world.current_time.day }} 天 {{ world.world.current_time.hour }} 时</div>
        </div>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton :tooltip="isDark ? '切换到浅色' : '切换到深色'" @click="toggleTheme">
              <Moon v-if="!isDark" />
              <Sun v-else />
              <span>{{ isDark ? "浅色" : "深色" }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="设置" as-child>
              <RouterLink to="/settings">
                <Settings />
                <span>设置</span>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p class="px-2 text-[10px] text-muted-foreground">{{ platform.capabilities.os }} · {{ platform.capabilities.mobile ? "移动端" : "桌面/浏览器" }}</p>
      </SidebarFooter>
    </Sidebar>

    <SidebarInset>
      <header class="safe-top sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
        <SidebarTrigger />
        <div class="font-serif text-sm font-medium">Evolvria</div>
      </header>

      <main class="mobile-bottom-offset min-h-[calc(100dvh-3.5rem)] px-4 py-5 sm:px-6 lg:px-8">
        <RouterView />
      </main>
    </SidebarInset>
  </SidebarProvider>

  <Toaster position="top-right" rich-colors close-button />
</template>

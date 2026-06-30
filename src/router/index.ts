import { createRouter, createWebHashHistory } from "vue-router";
import MainMenuView from "@/views/MainMenuView.vue";
import OnboardingView from "@/views/OnboardingView.vue";
import NewWorldView from "@/views/NewWorldView.vue";
import ExplorationView from "@/views/ExplorationView.vue";
import MapView from "@/views/MapView.vue";
import CharactersView from "@/views/CharactersView.vue";
import LocationsView from "@/views/LocationsView.vue";
import TimelineView from "@/views/TimelineView.vue";
import ThreadsView from "@/views/ThreadsView.vue";
import WorldLoreView from "@/views/WorldLoreView.vue";
import SavesView from "@/views/SavesView.vue";
import SettingsView from "@/views/SettingsView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "main_menu", component: MainMenuView },
    { path: "/onboarding", name: "onboarding", component: OnboardingView },
    { path: "/new-world", name: "new_world", component: NewWorldView },
    { path: "/exploration", name: "exploration", component: ExplorationView },
    { path: "/map", name: "map", component: MapView },
    { path: "/locations", name: "locations", component: LocationsView },
    { path: "/characters", name: "characters", component: CharactersView },
    { path: "/timeline", name: "timeline", component: TimelineView },
    { path: "/threads", name: "threads", component: ThreadsView },
    { path: "/world-lore", name: "world_lore", component: WorldLoreView },
    { path: "/saves", name: "saves", component: SavesView },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});

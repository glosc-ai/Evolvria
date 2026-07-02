import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import LibraryView from "@/views/LibraryView.vue";
import StorylineDetailView from "@/views/StorylineDetailView.vue";
import StartStoryView from "@/views/StartStoryView.vue";
import ChatView from "@/views/ChatView.vue";
import CreatorStudioView from "@/views/CreatorStudioView.vue";
import SavesView from "@/views/SavesView.vue";
import SettingsView from "@/views/SettingsView.vue";
import SceneModeView from "@/views/SceneModeView.vue";
import AccountCloudView from "@/views/AccountCloudView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/library", name: "library", component: LibraryView },
    { path: "/storylines/:id", name: "storyline-detail", component: StorylineDetailView },
    { path: "/start/:storylineId", name: "start-story", component: StartStoryView },
    { path: "/chat/:chatId", name: "chat", component: ChatView },
    { path: "/scene/:chatId", name: "scene-mode", component: SceneModeView },
    { path: "/create", name: "creator-studio", component: CreatorStudioView },
    { path: "/saves", name: "saves", component: SavesView },
    { path: "/settings", name: "settings", component: SettingsView },
    { path: "/account", name: "account-cloud", component: AccountCloudView },
  ],
});

export default router;

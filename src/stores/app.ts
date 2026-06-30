import { defineStore } from "pinia";
import { ref } from "vue";
import type { RouteName } from "@/types/domain";

export const useAppStore = defineStore("app", () => {
  const routeBeforeSettings = ref<RouteName>("main_menu");
  const lastError = ref("");
  const lastNotice = ref("");
  const focusedCharacterId = ref("");
  const focusedLocationId = ref("");

  function setError(message: string): void {
    lastError.value = message;
    lastNotice.value = "";
  }

  function setNotice(message: string): void {
    lastNotice.value = message;
    lastError.value = "";
  }

  function clearBanners(): void {
    lastError.value = "";
    lastNotice.value = "";
  }

  return {
    routeBeforeSettings,
    lastError,
    lastNotice,
    focusedCharacterId,
    focusedLocationId,
    setError,
    setNotice,
    clearBanners,
  };
});

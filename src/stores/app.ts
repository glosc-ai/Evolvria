import { defineStore } from "pinia";
import { ref } from "vue";
import { toast } from "vue-sonner";
import type { RouteName } from "@/types/domain";

/**
 * 应用级状态。
 * 错误/通知横幅已改为 vue-sonner toast:setError/setNotice 直接弹 toast,
 * 不再维护 lastError/lastNotice 引用。clearBanners 保留为空操作以兼容路由切换调用。
 */
export const useAppStore = defineStore("app", () => {
  const routeBeforeSettings = ref<RouteName>("main_menu");
  const focusedCharacterId = ref("");
  const focusedLocationId = ref("");

  function setError(message: string): void {
    toast.error(message || "操作失败。");
  }

  function setNotice(message: string): void {
    toast.success(message || "操作完成。");
  }

  function clearBanners(): void {
    // toast 由 vue-sonner 自行管理生命周期,无需清理。
  }

  return {
    routeBeforeSettings,
    focusedCharacterId,
    focusedLocationId,
    setError,
    setNotice,
    clearBanners,
  };
});

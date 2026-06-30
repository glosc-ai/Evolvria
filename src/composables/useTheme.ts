import { computed } from "vue";
import { useSettingsStore } from "@/stores/settings";

/**
 * 主题切换:把 settings.theme ("dark" | "light") 应用到 <html class="dark">。
 * 用法:在根组件 onMounted 调用 apply(),并提供 toggle()/set() 给切换按钮。
 */
export function useTheme() {
  const settings = useSettingsStore();

  const isDark = computed(() => settings.settings.theme === "dark");

  function apply(): void {
    document.documentElement.classList.toggle("dark", isDark.value);
  }

  async function set(theme: "dark" | "light"): Promise<void> {
    if (settings.settings.theme === theme) return;
    settings.settings.theme = theme;
    apply();
    try {
      await settings.save();
    } catch {
      // 保存失败不回滚视觉,已在 toast 中提示
    }
  }

  async function toggle(): Promise<void> {
    await set(isDark.value ? "light" : "dark");
  }

  return { isDark, apply, set, toggle };
}

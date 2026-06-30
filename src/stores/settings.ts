import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { canStoreGloscToken, DEFAULT_SETTINGS, loadSettings, localTokenRiskText, saveSettings as persistSettings } from "@/services/settings";
import type { Settings } from "@/types/domain";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);

  const gloscConfigured = computed(() => Boolean(settings.value.glosc_base_url.trim() && settings.value.glosc_token.trim()));
  const onboardingRequired = computed(() => !settings.value.onboarding_completed && !gloscConfigured.value);

  async function load(): Promise<void> {
    settings.value = await loadSettings();
    loaded.value = true;
  }

  async function save(): Promise<void> {
    if (!canStoreGloscToken(settings.value.glosc_token, settings.value.local_token_risk_acknowledged)) {
      throw new Error("保存 Key 前需要确认本机存储风险。");
    }
    await persistSettings(settings.value);
  }

  async function patch(partial: Partial<Settings>): Promise<void> {
    settings.value = { ...settings.value, ...partial };
    await save();
  }

  async function reset(): Promise<void> {
    settings.value = { ...DEFAULT_SETTINGS };
    await save();
  }

  return {
    settings,
    loaded,
    gloscConfigured,
    onboardingRequired,
    localTokenRiskText,
    load,
    save,
    patch,
    reset,
  };
});

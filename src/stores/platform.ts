import { defineStore } from "pinia";
import { ref } from "vue";
import { safeInvoke } from "@/services/tauri";
import type { PlatformCapabilities } from "@/types/domain";

const browserCapabilities: PlatformCapabilities = {
  os: "browser",
  mobile: false,
  can_reveal_directories: false,
  can_share_files: false,
  can_use_file_picker: true,
};

export const usePlatformStore = defineStore("platform", () => {
  const capabilities = ref<PlatformCapabilities>({ ...browserCapabilities });

  async function load(): Promise<void> {
    capabilities.value = (await safeInvoke<PlatformCapabilities>("get_platform_capabilities")) ?? { ...browserCapabilities };
  }

  async function revealOrShare(path: string): Promise<void> {
    await safeInvoke<boolean>("reveal_or_share_path", { path });
  }

  return { capabilities, load, revealOrShare };
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "yarn dev",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "narrow", use: { viewport: { width: 900, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 1024, height: 768 } } },
  ],
});

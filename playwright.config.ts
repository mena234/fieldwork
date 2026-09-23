import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    channel: process.env.PW_CHANNEL,
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: "list",
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 20000,
  },
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "python ../scripts/run_e2e_backend.py",
      url: "http://127.0.0.1:39011/api/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npx vite --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        APP_CONFIG_PATH: "config/app_config.e2e.yaml",
      },
    },
  ],
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_APP_CONFIG_PATH = path.resolve(PROJECT_ROOT, "config", "app_config.yaml");
const APP_CONFIG_PATH = path.resolve(
  PROJECT_ROOT,
  process.env.APP_CONFIG_PATH || DEFAULT_APP_CONFIG_PATH
);

function loadYamlConfig() {
  if (!fs.existsSync(APP_CONFIG_PATH)) {
    throw new Error(`Missing YAML config file: ${APP_CONFIG_PATH}`);
  }

  const raw = fs.readFileSync(APP_CONFIG_PATH, "utf8");
  const parsed = yaml.load(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

const appConfig = loadYamlConfig();
const frontendConfig = appConfig.frontend || {};
const frontendApiBaseUrl = String(
  process.env.FRONTEND_API_BASE_URL || frontendConfig.api_base_url || ""
);
const frontendDevPort = Number(process.env.FRONTEND_DEV_SERVER_PORT || frontendConfig.dev_server_port || 5173);
const frontendDevProxyTarget = String(
  process.env.FRONTEND_DEV_PROXY_TARGET || frontendConfig.dev_proxy_target || "http://localhost:8000"
);

export default defineConfig({
  plugins: [react()],
  define: {
    __API_BASE_URL__: JSON.stringify(frontendApiBaseUrl),
  },
  server: {
    port: frontendDevPort,
    proxy: {
      "/api": {
        target: frontendDevProxyTarget,
        changeOrigin: true,
      },
    },
  },
});

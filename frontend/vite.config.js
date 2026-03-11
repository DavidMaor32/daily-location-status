import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const APP_CONFIG_PATH = path.resolve(PROJECT_ROOT, "config", "app_config.yaml");

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
const frontendApiBaseUrl = String(frontendConfig.api_base_url || "");
const frontendDevPort = Number(frontendConfig.dev_server_port || 5173);
const frontendDevProxyTarget = String(frontendConfig.dev_proxy_target || "http://localhost:8000");
const frontendWriteApiKey = String(frontendConfig.write_api_key || "");

export default defineConfig({
  plugins: [react()],
  define: {
    __API_BASE_URL__: JSON.stringify(frontendApiBaseUrl),
    __WRITE_API_KEY__: JSON.stringify(frontendWriteApiKey),
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

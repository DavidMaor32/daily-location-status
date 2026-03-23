import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendApiBaseUrl = String(process.env.FRONTEND_API_BASE_URL || "");
const frontendDevPort = Number(process.env.FRONTEND_DEV_SERVER_PORT || 5173);
const frontendDevProxyTarget = String(process.env.FRONTEND_DEV_PROXY_TARGET || "http://localhost:8000");

export default defineConfig({
  plugins: [react()],
  define: {
  },
  server: {
    proxy: {
      "/api": {
        target: frontendDevProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
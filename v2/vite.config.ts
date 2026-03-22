import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (mode === "production" && !env.VITE_API_BASE) {
    console.warn("[buildwise] VITE_API_BASE is empty — API calls will use same-origin relative paths");
  }
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5055";
  return {
    plugins: [react()],
    build: {
      target: "es2020",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-editor": ["@tiptap/react", "@tiptap/starter-kit"],
            "vendor-markdown": ["markdown-it"]
          }
        }
      }
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5055";
  return {
    plugins: [react()],
    build: {
      target: "es2020",
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-editor": ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-underline"],
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

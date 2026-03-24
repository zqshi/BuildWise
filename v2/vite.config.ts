import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { buildContentSecurityPolicy } from "./viteCsp";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (mode === "production" && !env.VITE_API_BASE) {
    console.warn("[buildwise] VITE_API_BASE is empty — API calls will use same-origin relative paths");
  }
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5055";
  const csp = buildContentSecurityPolicy({
    apiBase: env.VITE_API_BASE,
    mode
  });
  return {
    plugins: [
      react(),
      {
        name: "buildwise-csp",
        transformIndexHtml(html) {
          return html.replace("__BUILDWISE_CSP__", csp);
        }
      }
    ],
    build: {
      target: "es2020",
      sourcemap: false,
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }
            if (id.includes("markdown-it")) {
              return "vendor-markdown";
            }
            if (id.includes("prosemirror")) {
              return "vendor-prosemirror";
            }
            if (
              id.includes("@tiptap/react") ||
              id.includes("@tiptap/starter-kit") ||
              id.includes("@tiptap/core") ||
              id.includes("@tiptap/pm")
            ) {
              return "vendor-editor";
            }
            return undefined;
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
    },
    preview: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});

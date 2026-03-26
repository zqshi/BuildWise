import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveViteRuntimeEnv } from "./viteRuntimeEnv";

export default defineConfig(({ mode }) => {
  const runtimeEnv = resolveViteRuntimeEnv(mode, process.cwd());
  if (mode === "production" && !runtimeEnv.apiBase) {
    console.warn("[buildwise] VITE_API_BASE is empty — API calls will use same-origin relative paths");
  }
  const proxyTarget = runtimeEnv.apiProxyTarget;
  return {
    plugins: [react()],
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

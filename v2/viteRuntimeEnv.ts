import { loadEnv } from "vite";

export function resolveViteRuntimeEnv(mode: string, cwd: string) {
  const fileEnv = loadEnv(mode, cwd, "VITE_");
  return {
    apiBase: process.env.VITE_API_BASE || fileEnv.VITE_API_BASE || "",
    apiProxyTarget: process.env.VITE_API_PROXY_TARGET || fileEnv.VITE_API_PROXY_TARGET || "http://127.0.0.1:5055"
  };
}

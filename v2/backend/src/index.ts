import { join } from "node:path";
import { createBuildwiseApp } from "./app";
import { loadEnvFileIntoMap } from "./infrastructure/runtime/envFileLoader";
import { createLogger } from "./infrastructure/runtime/logger";

function loadEnvFileIntoProcessEnv() {
  const log = createLogger("env-load");
  const processRef = (globalThis as { process?: { cwd: () => string; env?: Record<string, string | undefined> } }).process;
  if (!processRef?.env) {
    return;
  }
  const preferProcessEnv = (processRef.env.BUILDWISE_PREFER_PROCESS_ENV || "").trim() === "1";
  const llmOverrideKeys = preferProcessEnv
    ? []
    : [
        "LLM_PROVIDER",
        "LLM_API_BASE",
        "LLM_API_KEY",
        "LLM_MODEL",
        "LLM_REQUEST_TIMEOUT_MS",
        "LLM_MAX_OUTPUT_TOKENS",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_MODEL"
      ];
  const result = loadEnvFileIntoMap({
    cwd: processRef.cwd(),
    env: processRef.env,
    overrideKeys: llmOverrideKeys
  });
  if (result.overridden > 0) {
    log.info("env file overrides applied", { overridden: result.overridden, file: result.filePath });
  }
}

async function bootstrap() {
  loadEnvFileIntoProcessEnv();
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const backendRoot = join(__dirname, "..");
  const context = await createBuildwiseApp({
    env,
    dataFile: join(backendRoot, "data.runtime.json")
  });
  await context.app.listen({ port: context.config.port, host: context.config.host });
  createLogger("bootstrap").info("server started", { host: context.config.host, port: context.config.port });
  context.startBackgroundTasks();
}

process.on("unhandledRejection", (reason) => {
  createLogger("process").error("unhandled rejection", { error: reason instanceof Error ? reason.message : String(reason) });
});

process.on("uncaughtException", (err) => {
  createLogger("process").error("uncaught exception — shutting down", { error: err.message, stack: err.stack });
  process.exit(1);
});

bootstrap().catch((err) => {
  createLogger("bootstrap").error("bootstrap failed", { error: err instanceof Error ? err.message : String(err) });
  (globalThis as { process?: { exit?: (code?: number) => void } }).process?.exit?.(1);
});

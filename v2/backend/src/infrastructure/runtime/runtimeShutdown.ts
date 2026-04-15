import type { FastifyInstance } from "fastify";
import type { RuntimeConfig } from "./runtimeConfig";
import type { RuntimeState } from "./runtimeState";
import { createLogger } from "./logger";

const log = createLogger("shutdown");

type ProcessLike = {
  on: (event: string, handler: () => void) => void;
  exit: (code?: number) => void;
};

export function registerGracefulShutdown(
  app: FastifyInstance,
  state: RuntimeState,
  config: RuntimeConfig,
  processLike: ProcessLike
) {
  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    state.setShuttingDown(true);
    log.warn("graceful shutdown started", { signal });

    const timer = setTimeout(() => {
      log.error("forced shutdown timeout reached", { timeoutMs: config.shutdownTimeoutMs });
      processLike.exit(1);
    }, config.shutdownTimeoutMs);
    timer.unref();

    try {
      await app.close();
      clearTimeout(timer);
      processLike.exit(0);
    } catch (error) {
      clearTimeout(timer);
      log.error("graceful shutdown failed", { error: error instanceof Error ? error.message : String(error) });
      processLike.exit(1);
    }
  };

  processLike.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  processLike.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

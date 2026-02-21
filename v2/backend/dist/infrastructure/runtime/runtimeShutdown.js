"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGracefulShutdown = registerGracefulShutdown;
function registerGracefulShutdown(app, state, config, processLike) {
    let closing = false;
    const shutdown = async (signal) => {
        if (closing) {
            return;
        }
        closing = true;
        state.setShuttingDown(true);
        console.warn("Graceful shutdown started", { signal });
        const timer = setTimeout(() => {
            console.error("Forced shutdown timeout reached", { timeoutMs: config.shutdownTimeoutMs });
            processLike.exit(1);
        }, config.shutdownTimeoutMs);
        timer.unref();
        try {
            await app.close();
            clearTimeout(timer);
            processLike.exit(0);
        }
        catch (error) {
            clearTimeout(timer);
            console.error("Graceful shutdown failed", error);
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

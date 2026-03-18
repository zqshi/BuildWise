export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export type Logger = {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

function formatContext(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }
  const parts = Object.entries(context).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return ` ${parts.join(" ")}`;
}

export function createLogger(tag: string, minLevel: LogLevel = "info"): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < threshold) {
      return;
    }
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase()}] [${tag}]${message ? ` ${message}` : ""}${formatContext(context)}`;
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context)
  };
}

import type { LogLevel, Logger } from "../../domain/shared/logger";
export type { LogLevel, Logger } from "../../domain/shared/logger";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

type LogFormat = "text" | "json";

function resolveLogFormat(): LogFormat {
  const raw = (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.LOG_FORMAT || ""
  )
    .trim()
    .toLowerCase();
  if (raw === "json") {
    return "json";
  }
  return "text";
}

function formatContext(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }
  const parts = Object.entries(context).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return ` ${parts.join(" ")}`;
}

function formatJsonLine(level: LogLevel, tag: string, message: string, context?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level: level.toUpperCase(),
    tag,
    msg: message
  };
  if (context) {
    const { requestId, ...rest } = context;
    if (requestId !== undefined) {
      entry.requestId = requestId;
    }
    for (const [k, v] of Object.entries(rest)) {
      entry[k] = v;
    }
  }
  return JSON.stringify(entry);
}

function resolveLogLevel(): LogLevel {
  const raw = (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.LOG_LEVEL || ""
  )
    .trim()
    .toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

export function createLogger(tag: string, minLevel: LogLevel = resolveLogLevel()): Logger {
  const threshold = LEVEL_ORDER[minLevel];
  const format = resolveLogFormat();

  function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < threshold) {
      return;
    }

    const line =
      format === "json"
        ? formatJsonLine(level, tag, message, context)
        : `[${new Date().toISOString()}] [${level.toUpperCase()}] [${tag}]${message ? ` ${message}` : ""}${formatContext(context)}`;

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

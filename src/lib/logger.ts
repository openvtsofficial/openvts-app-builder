type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const enabled = process.env.LOGGER_ENABLED === "true";
const threshold = LEVELS[(process.env.LOGGER_LEVEL as LogLevel) ?? "info"] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function format(level: LogLevel, context: string, message: string, meta?: Record<string, unknown>) {
  const base = { timestamp: timestamp(), level, context, message, ...meta };
  if (process.env.NODE_ENV === "production") return JSON.stringify(base);
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${base.timestamp}] ${level.toUpperCase().padEnd(5)} [${context}] ${message}${metaStr}`;
}

function shouldLog(level: LogLevel): boolean {
  if (!enabled) return false;
  return LEVELS[level] >= threshold;
}

export function createLogger(context: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("debug")) console.debug(format("debug", context, message, meta));
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("info")) console.info(format("info", context, message, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("warn")) console.warn(format("warn", context, message, meta));
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("error")) console.error(format("error", context, message, meta));
    },
  };
}

export const logger = createLogger("app");

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const enabled = process.env.LOGGER_ENABLED === "true";
const threshold = LEVELS[(process.env.LOGGER_LEVEL as LogLevel) ?? "info"] ?? LEVELS.info;
const logFilePath = process.env.LOG_FILE_PATH || null;

if (logFilePath && typeof window === "undefined") {
  try {
    mkdirSync(dirname(logFilePath), { recursive: true });
  } catch { /* directory may already exist */ }
}

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

function writeToFile(formatted: string) {
  if (!logFilePath || typeof window !== "undefined") return;
  try {
    appendFileSync(logFilePath, formatted + "\n");
  } catch { /* fall back to console-only */ }
}

export function createLogger(context: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("debug")) return;
      const formatted = format("debug", context, message, meta);
      console.debug(formatted);
      writeToFile(formatted);
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("info")) return;
      const formatted = format("info", context, message, meta);
      console.info(formatted);
      writeToFile(formatted);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("warn")) return;
      const formatted = format("warn", context, message, meta);
      console.warn(formatted);
      writeToFile(formatted);
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("error")) return;
      const formatted = format("error", context, message, meta);
      console.error(formatted);
      writeToFile(formatted);
    },
  };
}

export const logger = createLogger("app");

// Bare i18next singleton: same instance as '@/i18n' without its init side effects.
import i18n from "i18next";

export function normalizeInline(value: unknown): string {
  return String(value ?? "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(i18n.language || undefined).format(value);
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

export { formatTokens } from "@/utils/format";

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0m";
  const totalMinutes = Math.round(value / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTimestamp(value: number | string | undefined): string {
  const timestamp = typeof value === "number" ? value : Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(i18n.language || undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function formatClock(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

export function safeJson(value: unknown, space = 2): string {
  try {
    return JSON.stringify(value, null, space);
  } catch (error) {
    return `无法序列化：${error instanceof Error ? error.message : String(error)}`;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function modelLabel(provider: string, modelId: string): string {
  if (!provider) return modelId || "unknown model";
  if (!modelId) return provider;
  return `${provider}/${modelId}`;
}

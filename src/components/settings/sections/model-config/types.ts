export type JsonValue = Record<string, unknown>;

export type FeedbackTone = "success" | "error" | "warning" | "info";
export type ImportMode = "merge" | "replace";
export type HistoryTab = "backups" | "versions";
export type ConfirmTone = "danger" | "warning" | "info";
export type ModelConfigMainTab = "configure" | "test" | "tools" | "history";
export type ConfigDetailTab = "provider" | "model";
export type ModelInputType = "text" | "image";
export type ModelThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type ThinkingLevelMap = Partial<Record<ModelThinkingLevel, string | null>>;

export const MODEL_INPUT_TYPE_OPTIONS = ["text", "image"] as const;
export const MODEL_THINKING_LEVEL_OPTIONS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export interface ModelCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelEntry {
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input?: ModelInputType[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: ModelCost;
}

export interface ProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  authHeader?: boolean;
  headers?: Record<string, string>;
  models?: ModelEntry[];
}

export interface ModelConfigShape {
  providers: Record<string, ProviderEntry>;
}

export interface ModelConfigBackupMeta {
  id: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
  note?: string | null;
}

export interface ConfigVersionMeta {
  id: number;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
}

export interface ModelHttpTestResult {
  provider: string;
  model: string;
  api: string;
  method: string;
  url: string;
  statusCode: number | null;
  ok: boolean;
  latencyMs: number;
  curlCommand: string;
  requestBody: string;
  requestStyle: string;
  responsePreview?: string | null;
  attemptCount: number;
  usedFallback: boolean;
  responseBody: string;
  error?: string | null;
}

export interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

export interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  tone: ConfirmTone;
  onConfirm: () => void | Promise<void>;
}

export const EMPTY_CONFIG: ModelConfigShape = { providers: {} };
export const MODEL_CONFIG_PATH = "~/.pi/agent/models.json";

export const API_TYPE_OPTIONS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;

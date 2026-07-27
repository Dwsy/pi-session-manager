import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileJson,
  FlaskConical,
  Loader2,
  Play,
  Terminal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import type { ProviderEntry, ModelEntry, ModelHttpTestResult } from "../types";

interface TestTabProps {
  selectedProvider: string;
  selectedProviderEntry?: ProviderEntry;
  selectedModelEntry?: ModelEntry;
  activeModelLabel: string;
  testPrompt: string;
  onTestPromptChange: (value: string) => void;
  testResult: ModelHttpTestResult | null;
  onRunTest: () => void;
  onCopyCurlCommand: () => void;
  onBackToConfigure: () => void;
  busy: string | null;
}

export function TestTab({
  selectedProvider,
  selectedProviderEntry,
  selectedModelEntry,
  activeModelLabel,
  testPrompt,
  onTestPromptChange,
  testResult,
  onRunTest,
  onCopyCurlCommand,
  onBackToConfigure,
  busy,
}: TestTabProps) {
  const { t } = useTranslation();

  return (
    <SettingsCard
      icon={<FlaskConical className="h-5 w-5" />}
      title={t(
        "settings.modelConfigCenter.httpTestTitle",
        "Online HTTP / cURL Test",
      )}
      description={t(
        "settings.modelConfigCenter.httpTestDesc",
        "Makes real request with currently selected Provider + Model to verify configuration.",
      )}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t(
                "settings.modelConfigCenter.fields.selectedProvider",
                "Current Provider",
              )}
            </div>
            <div className="mt-1 truncate text-base font-bold text-foreground">
              {selectedProvider || "-"}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t(
                "settings.modelConfigCenter.fields.selectedModel",
                "Current Model",
              )}
            </div>
            <div className="mt-1 truncate text-base font-bold text-foreground">
              {selectedModelEntry?.id?.trim() || activeModelLabel || "-"}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground">
              API
            </div>
            <div className="mt-1 truncate text-base font-bold text-primary font-mono">
              {selectedProviderEntry?.api ?? "-"}
            </div>
          </div>
        </div>

        {!selectedProviderEntry && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground bg-card/20">
            {t(
              "settings.modelConfigCenter.empty.testEmpty",
              "Go to config page to select Provider and model first, then come back to run test.",
            )}
          </div>
        )}

        {!selectedModelEntry?.id?.trim() && selectedProviderEntry && (
          <div className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/15 px-4 py-3.5 text-sm font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
            <span>
              {t(
                "settings.modelConfigCenter.help.noModelId",
                "Current model has no ID filled, cannot make HTTP test.",
              )}
            </span>
          </div>
        )}

        <div className="rounded-md border border-border bg-card p-5 space-y-4">
          <SettingsField
            label={t(
              "settings.modelConfigCenter.fields.prompt",
              "Test Prompt",
            )}
          >
            <SettingsInput
              value={testPrompt}
              onChange={(event) => onTestPromptChange(event.target.value)}
              placeholder={t(
                "settings.modelConfigCenter.placeholders.testPrompt",
                "Please reply only with OK",
              )}
            />
          </SettingsField>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void onRunTest()}
              disabled={
                !selectedProvider ||
                !selectedModelEntry?.id?.trim() ||
                busy === "http-test"
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-ring disabled:opacity-60"
            >
              {busy === "http-test" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {t(
                "settings.modelConfigCenter.actions.runTest",
                "Run Test",
              )}
            </button>
            {testResult && (
              <button
                type="button"
                onClick={() => void onCopyCurlCommand()}
                className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-surface/60 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface hover:border-border focus-ring"
              >
                <Copy className="h-4 w-4" />
                {t(
                  "settings.modelConfigCenter.actions.copyCurl",
                  "Copy cURL",
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToConfigure}
              className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/50 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface hover:border-border focus-ring"
            >
              <FileJson className="h-4 w-4" />
              {t(
                "settings.modelConfigCenter.actions.backToConfigure",
                "Back to Config",
              )}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-5 ">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    testResult.ok
                      ? "border border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300"
                      : "border border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {testResult.ok ? "200 OK" : "FAILED"}
                </span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {testResult.method} {testResult.url}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <span>
                  Status: <strong className="text-foreground">{testResult.statusCode ?? "-"}</strong>
                </span>
                <span>
                  Latency: <strong className="text-primary">{testResult.latencyMs} ms</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-md border border-border/50 bg-background/40 px-3.5 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  API Protocol
                </div>
                <div className="mt-1 font-bold text-foreground font-mono">
                  {testResult.api}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-3.5 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Request Style
                </div>
                <div className="mt-1 font-bold text-foreground">
                  {testResult.requestStyle}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-3.5 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Attempts
                </div>
                <div className="mt-1 font-bold text-foreground">
                  {testResult.attemptCount}
                  {testResult.usedFallback ? " (fallback used)" : ""}
                </div>
              </div>
            </div>

            {testResult.responsePreview && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {testResult.responsePreview}
              </div>
            )}
            {testResult.error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3.5 text-sm font-medium text-red-800 dark:text-red-300">
                {testResult.error}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <details className="group">
                <summary className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>cURL Command</span>
                </summary>
                <pre className="mt-2.5 whitespace-pre-wrap break-all rounded-md border border-border bg-background/80 p-4 font-mono text-xs text-foreground/90 overflow-x-auto">
                  {testResult.curlCommand}
                </pre>
              </details>
              <details className="group">
                <summary className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Request Body</span>
                </summary>
                <pre className="mt-2.5 whitespace-pre-wrap break-all rounded-md border border-border bg-background/80 p-4 font-mono text-xs text-foreground/90 overflow-x-auto">
                  {testResult.requestBody}
                </pre>
              </details>
              <details open className="group">
                <summary className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Response Body</span>
                </summary>
                <pre className="mt-2.5 max-h-[320px] overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background/80 p-4 font-mono text-xs text-foreground/90">
                  {testResult.responseBody || "(empty)"}
                </pre>
              </details>
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

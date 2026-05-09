import { AlertCircle, Check, Copy, FileJson, FlaskConical, Loader2, Play } from "lucide-react";
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
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {t(
                "settings.modelConfigCenter.fields.selectedProvider",
                "Current Provider",
              )}
            </div>
            <div className="mt-2 truncate text-sm font-medium text-foreground">
              {selectedProvider || "-"}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {t(
                "settings.modelConfigCenter.fields.selectedModel",
                "Current Model",
              )}
            </div>
            <div className="mt-2 truncate text-sm font-medium text-foreground">
              {selectedModelEntry?.id?.trim() || activeModelLabel || "-"}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              API
            </div>
            <div className="mt-2 truncate text-sm font-medium text-foreground">
              {selectedProviderEntry?.api ?? "-"}
            </div>
          </div>
        </div>

        {!selectedProviderEntry && (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t(
              "settings.modelConfigCenter.empty.testEmpty",
              "Go to config page to select Provider and model first, then come back to run test.",
            )}
          </div>
        )}

        {!selectedModelEntry?.id?.trim() && selectedProviderEntry && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {t(
              "settings.modelConfigCenter.help.noModelId",
              "Current model has no ID filled, cannot make HTTP test.",
            )}
          </div>
        )}

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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRunTest()}
            disabled={
              !selectedProvider ||
              !selectedModelEntry?.id?.trim() ||
              busy === "http-test"
            }
            className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
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
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
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
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
          >
            <FileJson className="h-4 w-4" />
            {t(
              "settings.modelConfigCenter.actions.backToConfigure",
              "Back to Config",
            )}
          </button>
        </div>

        {testResult && (
          <div className="rounded-xl border border-border/70 bg-background/30 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 font-medium ${testResult.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
              >
                {testResult.ok ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {testResult.ok ? "OK" : "FAILED"}
              </span>
              <span className="text-muted-foreground">
                {testResult.method} {testResult.url}
              </span>
              <span className="text-muted-foreground">
                status: {testResult.statusCode ?? "-"}
              </span>
              <span className="text-muted-foreground">
                latency: {testResult.latencyMs} ms
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  API
                </div>
                <div className="mt-1 font-medium text-foreground">
                  {testResult.api}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Request Style
                </div>
                <div className="mt-1 font-medium text-foreground">
                  {testResult.requestStyle}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Attempts
                </div>
                <div className="mt-1 font-medium text-foreground">
                  {testResult.attemptCount}
                  {testResult.usedFallback
                    ? " (fallback used)"
                    : ""}
                </div>
              </div>
            </div>
            {testResult.responsePreview && (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">
                {testResult.responsePreview}
              </div>
            )}
            {testResult.error && (
              <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {testResult.error}
              </div>
            )}
            <div className="mt-4 space-y-3 text-xs">
              <details>
                <summary className="cursor-pointer font-medium text-foreground">
                  cURL
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">
                  {testResult.curlCommand}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer font-medium text-foreground">
                  Request Body
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">
                  {testResult.requestBody}
                </pre>
              </details>
              <details open>
                <summary className="cursor-pointer font-medium text-foreground">
                  Response Body
                </summary>
                <pre className="mt-2 max-h-[280px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">
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

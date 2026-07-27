import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Wifi, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import SettingsRadioCardGroup from "@/components/settings/SettingsRadioCardGroup";

type TransportPref = "auto" | "ws" | "http";

function readCurrentRemoteConfig() {
  return {
    enabled: localStorage.getItem("psm.remoteMode") === "true",
    serverUrl: localStorage.getItem("psm.remoteServerUrl") || "",
    apiToken: localStorage.getItem("psm.remoteApiToken") || "",
    transport: (localStorage.getItem("psm.remoteTransport") as TransportPref) || "auto",
  };
}

function normalizeToWsUrl(input: string): string {
  const trimmed = input.trim()
  if (/^wss?:\/\//i.test(trimmed)) return trimmed
  let out = trimmed.replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(out)) out = `http://${out}`
  if (out.endsWith("/api")) out = out.slice(0, -4)
  const wsBase = out.startsWith("https://")
    ? `wss://${out.slice(8)}`
    : out.startsWith("http://")
      ? `ws://${out.slice(7)}`
      : `ws://${out}`
  return wsBase.endsWith("/ws") ? wsBase : `${wsBase}/ws`
}

function normalizeToHttpBase(input: string): string {
  let out = input.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(out)) out = `http://${out}`
  if (out.endsWith("/api")) out = out.slice(0, -4)
  return out
}

async function testConnection(
  serverUrl: string,
  apiToken: string,
  transport: TransportPref,
): Promise<{ ok: boolean; message: string }> {
  const httpBase = normalizeToHttpBase(serverUrl);
  const wsUrl = normalizeToWsUrl(serverUrl);
  const useHttp = transport === "http";

  if (useHttp) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`;
      const resp = await fetch(`${httpBase}/api`, {
        method: "POST",
        headers,
        body: JSON.stringify({ command: "get_app_version", payload: {} }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return { ok: !!data.success, message: data.success ? `v${data.data?.current_app_version || "?"}` : "Command failed" };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.close();
      resolve({ ok: false, message: "Connection timeout (5s)" });
    }, 5000);
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (apiToken) {
        ws.send(JSON.stringify({ auth: apiToken }));
        const authTimer = setTimeout(() => {
          clearTimeout(timer);
          ws.close();
          resolve({ ok: true, message: "Connected (no auth response)" });
        }, 2000);
        ws.onmessage = (evt) => {
          clearTimeout(timer);
          clearTimeout(authTimer);
          try {
            const data = JSON.parse(evt.data);
            if (data.auth === "ok") {
              ws.close();
              resolve({ ok: true, message: "Connected & authenticated" });
            } else if (data.error) {
              ws.close();
              resolve({ ok: false, message: `Auth error: ${data.error}` });
            } else {
              ws.close();
              resolve({ ok: true, message: "Connected" });
            }
          } catch {
            ws.close();
            resolve({ ok: true, message: "Connected" });
          }
        };
      } else {
        clearTimeout(timer);
        ws.close();
        resolve({ ok: true, message: "Connected" });
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, message: "WebSocket connection failed" });
    };
  });
}

export default function RemoteConnectionTab() {
  const { t } = useTranslation();
  const [initial] = useState(readCurrentRemoteConfig);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [serverUrl, setServerUrl] = useState(initial.serverUrl);
  const [apiToken, setApiToken] = useState(initial.apiToken);
  const [transport, setTransport] = useState<TransportPref>(initial.transport);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const dirty =
    enabled !== initial.enabled ||
    (enabled &&
      (serverUrl !== initial.serverUrl ||
        apiToken !== initial.apiToken ||
        transport !== initial.transport));

  const clearRemoteConfig = useCallback(() => {
    localStorage.removeItem("psm.remoteMode");
    localStorage.removeItem("psm.remoteServerUrl");
    localStorage.removeItem("psm.remoteApiToken");
    localStorage.removeItem("psm.remoteTransport");
  }, []);

  const writeRemoteConfig = useCallback(() => {
    const trimmedServerUrl = serverUrl.trim();
    if (!trimmedServerUrl) return;
    localStorage.setItem("psm.remoteMode", "true");
    localStorage.setItem("psm.remoteServerUrl", trimmedServerUrl);
    localStorage.setItem("psm.remoteApiToken", apiToken.trim());
    localStorage.setItem("psm.remoteTransport", transport);
  }, [serverUrl, apiToken, transport]);

  const handleEnabledChange = useCallback(
    (checked: boolean) => {
      setEnabled(checked);
      if (checked) {
        writeRemoteConfig();
      } else {
        clearRemoteConfig();
      }
    },
    [clearRemoteConfig, writeRemoteConfig],
  );

  const handleApply = useCallback(() => {
    if (enabled) {
      writeRemoteConfig();
    } else {
      clearRemoteConfig();
    }
    window.location.reload();
  }, [enabled, writeRemoteConfig, clearRemoteConfig]);

  const handleTest = useCallback(async () => {
    if (!serverUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    const result = await testConnection(serverUrl, apiToken, transport);
    setTestResult(result);
    setTesting(false);
  }, [serverUrl, apiToken, transport]);

  const transportOptions: readonly TransportPref[] = ["auto", "ws", "http"] as const;

  return (
    <SettingsCard
      title={t("settings.advanced.remoteTitle", "Remote Connection")}
      description={t(
        "settings.advanced.remoteDesc",
        "Connect to a remote PSM server instead of the local backend",
      )}
      icon={<Wifi className="h-4 w-4" />}
    >
      <div className="space-y-5">
        <SettingsToggleRow
          title={t("settings.advanced.remoteEnabled", "Remote Mode")}
          description={t(
            "settings.advanced.remoteEnabledHelp",
            "When enabled, the app connects to a remote server via WebSocket/HTTP instead of the local backend",
          )}
          checked={enabled}
          onChange={handleEnabledChange}
          searchKey="advanced-remoteEnabled"
        />

        {enabled && (
          <div className="space-y-4">
            <SettingsField
              label={t("settings.advanced.remoteServerUrl", "Server URL")}
              description={t(
                "settings.advanced.remoteServerUrlHelp",
                "Address of the remote PSM server (e.g. 192.168.1.100:52131 or https://psm.example.com)",
              )}
              className="space-y-2"
              searchKey="advanced-remoteServerUrl"
            >
              <SettingsInput
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="192.168.1.100:52131"
                searchKey="advanced-remoteServerUrl-input"
              />
            </SettingsField>

            <SettingsField
              label={t("settings.advanced.remoteToken", "API Token")}
              description={t(
                "settings.advanced.remoteTokenHelp",
                "Authentication token for the remote server (optional if auth is disabled)",
              )}
              className="space-y-2"
              searchKey="advanced-remoteToken"
            >
              <SettingsInput
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={t("settings.advanced.remoteTokenPlaceholder", "Optional authentication token")}
                searchKey="advanced-remoteToken-input"
              />
            </SettingsField>

            <SettingsField
              label={t("settings.advanced.remoteTransport", "Transport")}
              description={t(
                "settings.advanced.remoteTransportHelp",
                "How to communicate with the remote server",
              )}
              className="space-y-2"
              searchKey="advanced-remoteTransport"
            >
              <SettingsRadioCardGroup
                options={transportOptions}
                value={transport}
                onChange={setTransport}
                name="remote-transport"
                getLabel={(opt) =>
                  opt === "auto"
                    ? t("settings.advanced.remoteTransportAuto", "Auto (Recommended)")
                    : opt === "ws"
                      ? "WebSocket"
                      : "HTTP"
                }
                getDescription={(opt) =>
                  opt === "auto"
                    ? t("settings.advanced.remoteTransportAutoDesc", "Automatically choose the best transport")
                    : opt === "ws"
                      ? t("settings.advanced.remoteTransportWsDesc", "Persistent bidirectional connection with auto-reconnect")
                      : t("settings.advanced.remoteTransportHttpDesc", "Stateless request/response with event WebSocket")
                }
                containerClassName="grid grid-cols-3 gap-2"
              />
            </SettingsField>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleTest}
                disabled={testing || !serverUrl.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:border-border-hover bg-surface hover:bg-surface-hover text-foreground motion-color motion-surface disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("settings.advanced.remoteTesting", "Testing...")}
                  </span>
                ) : (
                  t("settings.advanced.remoteTest", "Test Connection")
                )}
              </button>

              {testResult && (
                <span
                  className={`flex items-center gap-1.5 text-xs ${
                    testResult.ok ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  {testResult.message}
                </span>
              )}
            </div>

            {enabled && initial.enabled && (
              <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
                <Wifi className="h-3 w-3" />
                {t(
                  "settings.advanced.remoteActive",
                  "Currently connected to remote server",
                )}
              </p>
            )}
          </div>
        )}

        {dirty && (
          <div className="flex items-center gap-3 pt-2 border-t border-border/40">
            <button
              onClick={handleApply}
              disabled={enabled && !serverUrl.trim()}
              className="px-4 py-2 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg motion-color focus-ring shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("settings.advanced.remoteApply", "Apply & Reload")}
            </button>
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {t(
                "settings.advanced.remoteApplyHelp",
                "The app will reload to switch transport layer",
              )}
            </span>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

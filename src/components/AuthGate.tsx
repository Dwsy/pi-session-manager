import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { shouldBypassAuthGate } from "@/runtime-data/mode";

interface AuthGateProps {
  children: React.ReactNode;
}

function isLocalHost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1"
  );
}

function getStoredToken(): string | null {
  return localStorage.getItem("psm.apiToken");
}

function storeToken(token: string): void {
  localStorage.setItem("psm.apiToken", token);
}

async function checkAuth(
  token?: string,
): Promise<{ needsAuth: boolean; authenticated: boolean }> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch("/api/auth-check", { headers });
    if (!resp.ok) return { needsAuth: true, authenticated: false };
    return await resp.json();
  } catch {
    return { needsAuth: false, authenticated: true };
  }
}

function AuthGate({ children }: AuthGateProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    "checking" | "needs-auth" | "authenticated"
  >("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);

  const verify = useCallback(async (token?: string) => {
    const result = await checkAuth(token);
    if (!result.needsAuth || result.authenticated) {
      setState("authenticated");
    } else {
      setState("needs-auth");
    }
  }, []);

  useEffect(() => {
    if (shouldBypassAuthGate()) {
      setState("authenticated");
      return;
    }

    if (isLocalHost()) {
      setState("authenticated");
      return;
    }
    const stored = getStoredToken();
    verify(stored || undefined);
  }, [verify]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const token = tokenInput.trim();
    if (!token) return;

    setLoading(true);
    try {
      const result = await checkAuth(token);
      if (result.authenticated) {
        storeToken(token);
        setState("authenticated");
      } else {
        setError(t("auth.invalidToken", "Token is invalid or expired"));
      }
    } finally {
      setLoading(false);
    }
  };

  if (state === "checking") {
    return (
      <div className="flex items-center justify-center h-screen-safe bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">
            {t("auth.connecting", "Connecting...")}
          </span>
        </div>
      </div>
    );
  }

  if (state === "needs-auth") {
    return (
      <div className="flex items-center justify-center h-screen-safe bg-background px-4">
        <div className="w-full max-w-sm">
          {/* Logo / Icon */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4 flex h-10 w-10 items-center justify-center text-muted-foreground">
              <Shield className="w-7 h-7 text-foreground/80" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Pi Session Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("auth.description", "Enter your API token to continue")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/90">
                {t("auth.tokenLabel", "API Token")}
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    setError("");
                  }}
                  placeholder="pi-session-manager-xxxx..."
                  autoFocus
                  autoComplete="off"
                  className={`
                    w-full px-3.5 py-2.5 pr-10 rounded-md text-sm
                    bg-card text-foreground placeholder:text-muted-foreground/60
                    border outline-none focus-ring
                    ${
                      error
                        ? "border-destructive/60 focus:border-destructive"
                        : "border-border focus:border-ring/60"
                    }
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken
                    ? t("auth.hideToken", "Hide token")
                    : t("auth.showToken", "Show token")}
                  className="focus-ring absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="
                w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-ring
                disabled:opacity-40 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
              "
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("auth.connect", "Connect")}
            </button>
          </form>

          {/* Hint */}
          <p className="text-xs text-muted-foreground/70 text-center mt-6 leading-relaxed">
            {t("auth.hint", "Token is shown in the server console on startup")}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthGate;

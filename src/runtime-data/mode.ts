import { getRuntimeMode } from "./runtimeMode";

export function shouldSkipOnboardingForRuntime(): boolean {
  return getRuntimeMode() === "demo";
}

export function shouldBypassAuthGate(): boolean {
  return getRuntimeMode() !== "backend";
}

export function shouldShowConnectionBanner(): boolean {
  return getRuntimeMode() === "backend";
}

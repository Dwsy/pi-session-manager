import { getRuntimeMode } from "./runtimeMode";
import { isStandaloneDatasetRuntime } from "@/browser-dataset";

export function shouldSkipOnboardingForRuntime(): boolean {
  return getRuntimeMode() === "demo" || isStandaloneDatasetRuntime();
}

export function shouldBypassAuthGate(): boolean {
  return getRuntimeMode() !== "backend";
}

export function shouldShowConnectionBanner(): boolean {
  return getRuntimeMode() === "backend";
}

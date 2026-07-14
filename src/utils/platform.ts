export type Platform = "macos" | "windows" | "linux";

export function detectPlatform(input?: {
  platform?: string;
  userAgent?: string;
}): Platform {
  const platform = input?.platform ?? (typeof navigator === "undefined" ? "" : navigator.platform);
  const userAgent = input?.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const value = `${platform} ${userAgent}`.toLowerCase();

  if (value.includes("mac") || value.includes("iphone") || value.includes("ipad")) {
    return "macos";
  }
  if (value.includes("win")) {
    return "windows";
  }
  return "linux";
}

export function isMacPlatform(input?: { platform?: string; userAgent?: string }): boolean {
  return detectPlatform(input) === "macos";
}

export function isWindowsPlatform(input?: { platform?: string; userAgent?: string }): boolean {
  return detectPlatform(input) === "windows";
}

export function isLinuxPlatform(input?: { platform?: string; userAgent?: string }): boolean {
  return detectPlatform(input) === "linux";
}

export function getPlatformModifier(input?: { platform?: string; userAgent?: string }): "Cmd" | "Ctrl" {
  return isMacPlatform(input) ? "Cmd" : "Ctrl";
}

export function shouldUseTauriDragRegion(input?: { platform?: string; userAgent?: string }): boolean {
  return isMacPlatform(input);
}

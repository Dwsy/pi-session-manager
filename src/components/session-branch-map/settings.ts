import type { GlobalMapSettings } from "@/utils/session-branch";

const STORAGE_KEY = "psm:branch-map:settings";

export const DEFAULT_BRANCH_MAP_SETTINGS: GlobalMapSettings = {
  scope: "structure",
  axis: "sequence",
  smartMapLayout: true,
  enabledNotes: {
    rename: true,
    label: true,
    model: true,
    thinking: true,
    user: true,
    assistant_reply: true,
    compaction: true,
    error: true,
  },
  selectedModels: [],
  showBridgeCounts: true,
  showSegmentLabels: true,
  showForkLabels: true,
};

export function readBranchMapSettings(): GlobalMapSettings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "null",
    ) as Partial<GlobalMapSettings> | null;
    if (!stored) return DEFAULT_BRANCH_MAP_SETTINGS;
    return {
      ...DEFAULT_BRANCH_MAP_SETTINGS,
      ...stored,
      scope: ["structure", "user", "conversation", "all"].includes(
        stored.scope ?? "",
      )
        ? stored.scope!
        : DEFAULT_BRANCH_MAP_SETTINGS.scope,
      axis: stored.axis === "time" ? "time" : "sequence",
      enabledNotes: {
        ...DEFAULT_BRANCH_MAP_SETTINGS.enabledNotes,
        ...(stored.enabledNotes ?? {}),
      },
      selectedModels: Array.isArray(stored.selectedModels)
        ? stored.selectedModels
        : [],
    };
  } catch {
    return DEFAULT_BRANCH_MAP_SETTINGS;
  }
}

export function writeBranchMapSettings(settings: GlobalMapSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is optional in restricted browser contexts.
  }
}

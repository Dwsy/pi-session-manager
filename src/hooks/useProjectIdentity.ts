import { useCallback } from "react";

import type {
  PsmProjectIdentity,
  PsmProjectReference,
} from "@dwsy/plugin-sdk";

import { usePsmPluginSessionUi } from "@/plugins/runtime-host";
import { resolveProjectIdentity } from "@/utils/projectIdentity";

export type ProjectIdentityResolver = (project: PsmProjectReference) => PsmProjectIdentity;

/**
 * Single entry point for project display identity.
 * Every project surface goes through this so plugins control one code path.
 */
export function useProjectIdentityResolver(): ProjectIdentityResolver {
  const { projectIdentityProviders } = usePsmPluginSessionUi();
  return useCallback(
    (project: PsmProjectReference) =>
      resolveProjectIdentity(project, projectIdentityProviders ?? []),
    [projectIdentityProviders],
  );
}

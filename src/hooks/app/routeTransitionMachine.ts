export type RouteTransitionMachineState =
  | { status: "idle" }
  | { status: "navigating"; targetPath: string };

export const IDLE_ROUTE_TRANSITION: RouteTransitionMachineState = {
  status: "idle",
};

export function normalizeRouteTransitionPath(path: string): string {
  const [pathname] = path.split(/[?#]/);
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, "") || "/";
}

export function beginRouteTransition(
  currentPath: string,
  targetPath: string,
): RouteTransitionMachineState {
  const current = normalizeRouteTransitionPath(currentPath);
  const target = normalizeRouteTransitionPath(targetPath);

  if (current === target) {
    return IDLE_ROUTE_TRANSITION;
  }

  return { status: "navigating", targetPath: target };
}

export function canApplyRouteState(
  state: RouteTransitionMachineState,
  locationPath: string,
): boolean {
  return (
    state.status === "idle" ||
    normalizeRouteTransitionPath(locationPath) === state.targetPath
  );
}

export function settleRouteTransition(
  state: RouteTransitionMachineState,
  locationPath: string,
): RouteTransitionMachineState {
  if (!canApplyRouteState(state, locationPath)) {
    return state;
  }

  return IDLE_ROUTE_TRANSITION;
}

import { describe, expect, it } from "vitest";

import {
  beginRouteTransition,
  canApplyRouteState,
  IDLE_ROUTE_TRANSITION,
  normalizeRouteTransitionPath,
  settleRouteTransition,
} from "../app/routeTransitionMachine";

describe("routeTransitionMachine", () => {
  it("normalizes routable app paths consistently", () => {
    expect(normalizeRouteTransitionPath("kanban/")).toBe("/kanban");
    expect(normalizeRouteTransitionPath("/projects?from=kanban")).toBe(
      "/projects",
    );
  });

  it("blocks stale app route state until the requested route arrives", () => {
    const transition = beginRouteTransition("/kanban", "/projects");

    expect(canApplyRouteState(transition, "/kanban")).toBe(false);
    expect(canApplyRouteState(transition, "/projects")).toBe(true);
    expect(settleRouteTransition(transition, "/projects")).toEqual(
      IDLE_ROUTE_TRANSITION,
    );
  });

  it("does not enter navigating state for same-route navigation", () => {
    expect(beginRouteTransition("/projects/", "/projects")).toEqual(
      IDLE_ROUTE_TRANSITION,
    );
  });
});

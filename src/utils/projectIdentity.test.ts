import { describe, expect, it, vi } from "vitest";

import type { PsmProjectIdentityProviderRegistration } from "@dwsy/plugin-sdk";

import {
  hueFromString,
  normalizeProjectIdentity,
  resolveProjectIdentity,
} from "@/utils/projectIdentity";

const project = { path: "/Users/dev/Work/some-dir", name: "some-dir" };

const provider = (
  id: string,
  resolve: PsmProjectIdentityProviderRegistration["resolve"],
  priority?: number,
): PsmProjectIdentityProviderRegistration => ({ id, priority, resolve });

describe("resolveProjectIdentity", () => {
  it("falls back to the directory basename when no provider matches", () => {
    expect(resolveProjectIdentity(project)).toEqual({ label: "some-dir" });
    expect(
      resolveProjectIdentity(project, [provider("p.defer", () => null)]),
    ).toEqual({ label: "some-dir" });
  });

  it("uses the provider identity, including avatar and subtitle", () => {
    const identity = resolveProjectIdentity(project, [
      provider("p.bot", () => ({
        label: "zero",
        subtitle: "OpenBot agent",
        avatar: { kind: "emoji", value: "🤖", hue: 320 },
      })),
    ]);

    expect(identity).toEqual({
      label: "zero",
      subtitle: "OpenBot agent",
      avatar: { kind: "emoji", value: "🤖", hue: 320 },
    });
  });

  it("orders providers by priority, then id, and stops at the first valid identity", () => {
    const low = vi.fn(() => ({ label: "low" }));
    const high = vi.fn(() => ({ label: "high" }));

    const identity = resolveProjectIdentity(project, [
      provider("p.low", low, 50),
      provider("p.a", () => ({ label: "a-default" })),
      provider("p.b", () => ({ label: "b-default" })),
      provider("p.high", high, 10),
    ]);

    expect(identity.label).toBe("high");
    expect(high).toHaveBeenCalledWith({ path: project.path, name: project.name });
    expect(low).not.toHaveBeenCalled();
  });

  it("skips a throwing provider instead of breaking the list", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const identity = resolveProjectIdentity(project, [
      provider("p.broken", () => {
        throw new Error("boom");
      }),
      provider("p.good", () => ({ label: "zero" })),
    ]);

    expect(identity.label).toBe("zero");
    expect(warn).toHaveBeenCalledWith(
      "[PSM plugins] Project identity provider failed: p.broken",
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("ignores malformed identities and keeps looking", () => {
    const identity = resolveProjectIdentity(project, [
      provider("p.empty", () => ({ label: "   " }) as never),
      provider("p.not-object", () => "zero" as never),
      provider("p.no-label", () => ({ subtitle: "x" }) as never),
      provider("p.good", () => ({ label: "fallback-name" })),
    ]);

    expect(identity).toEqual({ label: "fallback-name" });
  });

  it("normalizes over-long labels and drops unsafe avatar urls", () => {
    const identity = resolveProjectIdentity(project, [
      provider("p.long", () => ({
        label: `  ${"x".repeat(500)}  `,
        avatar: { kind: "url", value: "javascript:alert(1)" },
      })),
    ]);

    expect(identity.label).toHaveLength(200);
    expect(identity.avatar).toBeUndefined();
  });

  it("keeps hidePath only when the provider sets it to true", () => {
    expect(
      resolveProjectIdentity(project, [
        provider("p.hide", () => ({ label: "zero", avatar: { kind: "emoji", value: "🤖" }, hidePath: true })),
      ]).hidePath,
    ).toBe(true);

    expect(
      resolveProjectIdentity(project, [
        provider("p.false", () => ({ label: "zero", hidePath: false }) as never),
      ]).hidePath,
    ).toBeUndefined();

    expect(
      resolveProjectIdentity(project, [
        provider("p.truthy", () => ({ label: "zero", hidePath: "yes" }) as never),
      ]).hidePath,
    ).toBeUndefined();
  });

  it("renders only the first character for initial avatars", () => {
    const identity = resolveProjectIdentity(project, [
      provider("p.initial", () => ({
        label: "zero",
        avatar: { kind: "initial", value: "zero" },
      })),
    ]);

    expect(identity.avatar).toEqual({ kind: "initial", value: "z", hue: undefined });
  });
});

describe("normalizeProjectIdentity", () => {
  it("rejects non-objects and accepts https and data image avatars", () => {
    expect(normalizeProjectIdentity(null)).toBeNull();
    expect(normalizeProjectIdentity({ label: "a" })).toEqual({ label: "a" });
    expect(
      normalizeProjectIdentity({
        label: "a",
        avatar: { kind: "url", value: "https://example.com/a.png" },
      }),
    ).toEqual({ label: "a", avatar: { kind: "url", value: "https://example.com/a.png", hue: undefined } });
    expect(
      normalizeProjectIdentity({
        label: "a",
        avatar: { kind: "url", value: "data:image/svg+xml;base64,abc" },
      })?.avatar?.kind,
    ).toBe("url");
  });

  it("folds hues into 0-359", () => {
    expect(
      normalizeProjectIdentity({ label: "a", avatar: { kind: "initial", value: "a", hue: -90 } })
        ?.avatar?.hue,
    ).toBe(270);
    expect(
      normalizeProjectIdentity({ label: "a", avatar: { kind: "initial", value: "a", hue: 725 } })
        ?.avatar?.hue,
    ).toBe(5);
  });
});

describe("hueFromString", () => {
  it("is stable and stays in range", () => {
    expect(hueFromString("zero")).toBe(hueFromString("zero"));
    expect(hueFromString("zero")).toBeGreaterThanOrEqual(0);
    expect(hueFromString("zero")).toBeLessThan(360);
  });
});

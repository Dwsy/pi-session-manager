import { describe, expect, it } from "vitest";
import {
  formatDirectory,
  formatSkillInvocationTitle,
  getSessionListDisplayName,
} from "./sessionDisplay";

describe("formatSkillInvocationTitle", () => {
  it("formats skill invocation tags as SKILL:name", () => {
    expect(
      formatSkillInvocationTitle(
        '<skill name="work-pdca-loop" location="/Users/dengwenyu/.agents/skills/work-pdca-loop/SKILL.md">',
      ),
    ).toBe("SKILL:work-pdca-loop");
  });

  it("accepts single-quoted name attributes", () => {
    expect(
      formatSkillInvocationTitle(
        "<skill name='grill-me' location='/tmp/SKILL.md'>",
      ),
    ).toBe("SKILL:grill-me");
  });

  it("returns null for ordinary titles", () => {
    expect(formatSkillInvocationTitle("fix the login bug")).toBeNull();
    expect(formatSkillInvocationTitle("")).toBeNull();
  });
});

describe("getSessionListDisplayName", () => {
  it("prefers explicit name over first_message", () => {
    expect(
      getSessionListDisplayName(
        { name: "My session", first_message: "hello" },
        "Untitled",
      ),
    ).toBe("My session");
  });

  it("pretty-prints skill first messages", () => {
    expect(
      getSessionListDisplayName(
        {
          first_message:
            '<skill name="work-pdca-loop" location="/Users/dengwenyu/.agents/skills/work-pdca-loop/SKILL.md">',
        },
        "Untitled",
      ),
    ).toBe("SKILL:work-pdca-loop");
  });

  it("falls back to untitled", () => {
    expect(getSessionListDisplayName({}, "Untitled")).toBe("Untitled");
  });
});

describe("formatDirectory", () => {
  it("shows only the current cwd name for deep paths", () => {
    expect(formatDirectory("/Users/dengwenyu/Dev/AI/pi-session-manager")).toBe(
      "pi-session-manager",
    );
  });

  it("drops temporary parent directories and keeps only the cwd name", () => {
    const path =
      "/var/folders/wy/ml565j655zj9cv2b6z9xkqj80000gn/T/pi-clipboard-988a8854-c58d-4147-8ee3-f81f9ff294c4.png";

    expect(formatDirectory(path)).toBe(
      "pi-clipboard-988a8854-c58d-4147-8ee3-f81f9ff294c4.png",
    );
  });

  it("returns single segment paths unchanged", () => {
    expect(formatDirectory("pi-session-manager")).toBe("pi-session-manager");
    expect(formatDirectory("/tmp")).toBe("tmp");
  });
});

import { describe, expect, it } from "vitest";
import { formatDirectory } from "./sessionDisplay";

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

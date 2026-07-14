import type { BranchSegment } from "@/utils/session-branch";

export interface BranchColorPalette {
  accent: string;
  branches: readonly string[];
}

/**
 * Gives every terminal route a stable color in visual branch order. Shared
 * trunk segments keep the accent until their routes actually diverge.
 */
export function buildSegmentBranchColors(
  segments: readonly BranchSegment[],
  terminalSegments: readonly BranchSegment[],
  palette: BranchColorPalette,
): Map<string, string> {
  const terminalIndexByUid = new Map(
    terminalSegments.map((segment, index) => [segment.uid, index]),
  );
  const colorByUid = new Map<string, string>();

  function colorFor(segment: BranchSegment): string {
    const cached = colorByUid.get(segment.uid);
    if (cached) return cached;

    const terminalIndex = terminalIndexByUid.get(segment.uid);
    if (terminalIndex != null) {
      const color = palette.branches[terminalIndex % palette.branches.length];
      colorByUid.set(segment.uid, color ?? palette.accent);
      return color ?? palette.accent;
    }

    const childColors = new Set(segment.children.map(colorFor));
    const color = childColors.size === 1 ? [...childColors][0] : palette.accent;
    colorByUid.set(segment.uid, color);
    return color;
  }

  for (const segment of segments) colorFor(segment);
  return colorByUid;
}

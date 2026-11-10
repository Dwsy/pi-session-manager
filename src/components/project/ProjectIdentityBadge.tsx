import { FolderOpen } from "lucide-react";

import type { PsmProjectIdentity } from "@dwsy/plugin-sdk";

import { hueFromString } from "@/utils/projectIdentity";

interface ProjectIdentityBadgeProps {
  identity: PsmProjectIdentity;
  /** `sm` matches sidebar rows, `md` matches explorer headers. */
  size?: "sm" | "md";
  /** Rendered when the identity has no avatar. Defaults to the folder icon projects always had. */
  fallbackIcon?: "folder" | "none";
}

// Avatars get one size step above the icon they replace so the face stays legible at row height.
const SIZE_CLASSES = {
  sm: { box: "h-7 w-7 text-[12px]", icon: "h-4 w-4" },
  md: { box: "h-8 w-8 text-[13px]", icon: "h-3.5 w-3.5" },
} as const;

export default function ProjectIdentityBadge({
  identity,
  size = "sm",
  fallbackIcon = "folder",
}: ProjectIdentityBadgeProps) {
  const classes = SIZE_CLASSES[size];
  const avatar = identity.avatar;

  if (!avatar) {
    if (fallbackIcon === "none") return null;
    return (
      <FolderOpen
        className={`${classes.icon} flex-shrink-0 text-blue-400`}
        aria-hidden="true"
      />
    );
  }

  if (avatar.kind === "url") {
    return (
      <img
        src={avatar.value}
        alt=""
        aria-hidden="true"
        className={`${classes.box} flex-shrink-0 rounded-full object-cover`}
      />
    );
  }

  const hue = avatar.hue ?? hueFromString(identity.label);
  const glyph = avatar.kind === "emoji" ? avatar.value : avatar.value.slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`${classes.box} flex flex-shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white`}
      style={{ backgroundColor: `hsl(${hue} 68% 52%)` }}
    >
      {glyph}
    </span>
  );
}

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const FolderIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 7.5h7l2 2h9v9.5H3z" />
    <path d="M3 7.5V5h7l2 2" />
  </IconBase>
);
export const MapIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2z" />
    <path d="M8 4v13m8-10v13" />
  </IconBase>
);
export const ExpandIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" />
  </IconBase>
);
export const CollapseIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m7 14 5-5 5 5" />
  </IconBase>
);
export const SearchIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </IconBase>
);
export const CloseIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </IconBase>
);
export const TargetIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
  </IconBase>
);
export const FilterIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 5h16l-6 7v5l-4 2v-7z" />
  </IconBase>
);
export const NoteIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M16 3v4h4M8 11h8M8 15h6" />
  </IconBase>
);
export const ModelIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 3 4 7v10l8 4 8-4V7z" />
    <path d="m4 7 8 4 8-4M12 11v10" />
  </IconBase>
);
export const SunIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
  </IconBase>
);
export const MoonIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5" />
  </IconBase>
);
export const ChevronDownIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m7 10 5 5 5-5" />
  </IconBase>
);
export const ChevronRightIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m10 7 5 5-5 5" />
  </IconBase>
);
export const ChevronLeftIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m14 7-5 5 5 5" />
  </IconBase>
);
export const BranchIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="18" cy="7" r="2" />
    <circle cx="18" cy="17" r="2" />
    <path d="M8 5h2a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4M14 11a4 4 0 0 0 4-4" />
  </IconBase>
);
export const CopyIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </IconBase>
);
export const RawIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m8 4-5 8 5 8M16 4l5 8-5 8M14 2l-4 20" />
  </IconBase>
);
export const AlertIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 3 2.7 20h18.6z" />
    <path d="M12 9v4m0 3h.01" />
  </IconBase>
);
export const CheckIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m5 12 4 4L19 6" />
  </IconBase>
);
export const ResetIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 10a8 8 0 1 1 2 7" />
    <path d="M4 4v6h6" />
  </IconBase>
);
export const ZoomInIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5M10.5 7v7m-3.5-3.5h7" />
  </IconBase>
);
export const ZoomOutIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5M7 10.5h7" />
  </IconBase>
);
export const PlayIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m8 5 11 7-11 7z" />
  </IconBase>
);
export const PauseIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M8 5v14M16 5v14" />
  </IconBase>
);
export const StepIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m6 5 9 7-9 7zM18 5v14" />
  </IconBase>
);

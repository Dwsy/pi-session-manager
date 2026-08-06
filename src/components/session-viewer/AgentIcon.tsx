import { ClaudeCode, Codex, GeminiCLI, OpenCode } from "@lobehub/icons";
import { Bot, Boxes, Orbit, Sparkles } from "lucide-react";
import type { CSSProperties, SVGProps } from "react";

interface AgentIconProps {
  source: string;
  className?: string;
  size?: number | string;
  style?: CSSProperties;
}

function svgStyle(style: CSSProperties | undefined): CSSProperties {
  return {
    flex: "none",
    lineHeight: 1,
    ...style,
  };
}

function ClaudeCodeMono({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <path
        clipRule="evenodd"
        d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
      />
    </svg>
  );
}

function CodexMono({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <path
        clipRule="evenodd"
        d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
      />
    </svg>
  );
}

function GeminiCLIMono({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <path d="M16.793 10.358v3.867L7.236 18.82v-2.8l7.751-3.728-7.75-3.728V5.763l9.556 4.595z" />
      <path
        clipRule="evenodd"
        d="M19.608 0A4.392 4.392 0 0124 4.392v15.216A4.392 4.392 0 0119.608 24H4.392A4.392 4.392 0 010 19.608V4.392A4.392 4.392 0 014.392 0h15.216zM4.26 1.444A2.816 2.816 0 001.444 4.26v15.48a2.816 2.816 0 002.816 2.816h15.48a2.816 2.816 0 002.816-2.816V4.26a2.816 2.816 0 00-2.816-2.816H4.26z"
      />
    </svg>
  );
}

function OpenCodeMono({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <path d="M16 6H8v12h8V6zm4 16H4V2h16v20z" />
    </svg>
  );
}

function PiMono({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      viewBox="0 0 800 800"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path fill="currentColor" d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

function PiColor({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      viewBox="0 0 800 800"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <rect x="120" y="120" width="560" height="560" rx="96" fill="#0A0A0A" />
      <path
        fill="#FFFFFF"
        fillRule="evenodd"
        d="M220 220H500V400H400V500H300V600H220ZM300 300V400H400V300Z"
      />
      <path fill="#FFFFFF" d="M500 400H600V600H500Z" />
    </svg>
  );
}

function OmpMono({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <rect x="10" y="8" width="100" height="12" rx="2" />
      <rect x="25" y="20" width="12" height="62" rx="2" />
      <rect x="75" y="20" width="12" height="45" rx="2" />
      <rect x="71" y="55" width="20" height="16" rx="3" />
      <rect x="76" y="59" width="3" height="8" rx="1" />
      <rect x="82" y="59" width="3" height="8" rx="1" />
    </svg>
  );
}

function OmpColor({
  size = "1em",
  style,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      style={svgStyle(style)}
      {...rest}
    >
      <rect x="10" y="8" width="100" height="12" rx="2" fill="#fafafa" />
      <rect x="25" y="20" width="12" height="62" rx="2" fill="#fafafa" />
      <rect x="75" y="20" width="12" height="45" rx="2" fill="#fafafa" />
      <rect x="71" y="55" width="20" height="16" rx="3" fill="#f97316" />
      <rect x="76" y="59" width="3" height="8" rx="1" fill="#0d0d0d" />
      <rect x="82" y="59" width="3" height="8" rx="1" fill="#0d0d0d" />
      <circle cx="18" cy="14" r="2" fill="#f97316" opacity="0.8" />
      <circle cx="102" cy="14" r="2" fill="#f97316" opacity="0.8" />
    </svg>
  );
}

function normalizeSource(value: string): string {
  return value.trim().replace(/_/g, "-").toLowerCase();
}

export function getAgentIconColor(source: string): string {
  switch (normalizeSource(source)) {
    case "pi":
    case "pi-agent":
      return "#0A0A0A";
    case "omp":
    case "oh-my-pi":
      return "#EA580C";
    case "claude-code":
      return ClaudeCode.colorPrimary;
    case "codex":
      return "#7A9DFF";
    case "opencode":
      return OpenCode.colorPrimary;
    case "gemini":
    case "gemini-cli":
      return "#207CFE";
    case "factory":
      return "rgb(var(--color-success))";
    case "clawdbot":
      return "rgb(var(--color-purple))";
    case "cursor":
      return "#7C8CFF";
    case "antigravity":
    case "agy":
      return "#34D399";
    default:
      return "var(--accent)";
  }
}

export function AgentIcon({
  source,
  className = "",
  size = 12,
  style,
}: AgentIconProps) {
  const normalized = normalizeSource(source);
  const iconProps = { className, size, style } as const;

  switch (normalized) {
    case "pi":
    case "pi-agent":
      return <PiMono {...iconProps} />;
    case "omp":
    case "oh-my-pi":
      return <OmpMono {...iconProps} />;
    case "claude-code":
      return <ClaudeCodeMono {...iconProps} />;
    case "codex":
      return <CodexMono {...iconProps} />;
    case "opencode":
      return <OpenCodeMono {...iconProps} />;
    case "gemini":
    case "gemini-cli":
      return <GeminiCLIMono {...iconProps} />;
    case "factory":
      return <Boxes className={className} size={size} style={style} />;
    case "clawdbot":
      return <Bot className={className} size={size} style={style} />;
    case "cursor":
      return <Sparkles className={className} size={size} style={style} />;
    case "antigravity":
    case "agy":
      return <Orbit className={className} size={size} style={style} />;
    default:
      return <Bot className={className} size={size} style={style} />;
  }
}

export function AgentColorIcon({
  source,
  className = "",
  size = 12,
  style,
}: AgentIconProps) {
  const normalized = normalizeSource(source);
  const iconProps = { className, size, style } as const;

  switch (normalized) {
    case "pi":
    case "pi-agent":
      return <PiColor {...iconProps} />;
    case "omp":
    case "oh-my-pi":
      return <OmpColor {...iconProps} />;
    case "claude-code":
      return <ClaudeCode.Color {...iconProps} />;
    case "codex":
      return <Codex.Color {...iconProps} />;
    case "opencode":
      return <OpenCode {...iconProps} />;
    case "gemini":
    case "gemini-cli":
      return <GeminiCLI.Color {...iconProps} />;
    case "factory":
      return <Boxes className={className} size={size} style={style} />;
    case "clawdbot":
      return <Bot className={className} size={size} style={style} />;
    case "cursor":
      return <Sparkles className={className} size={size} style={style} />;
    case "antigravity":
    case "agy":
      return <Orbit className={className} size={size} style={style} />;
    default:
      return <Bot className={className} size={size} style={style} />;
  }
}

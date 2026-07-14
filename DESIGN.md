# Pi Session Manager — Design System

> 「春は暁、夏は夜、秋は夕暮れ、冬はつとめて」— 清少納言『枕草子』
>
> *For every season, there is a time; for every mode, a theme. Just as the seasons flow naturally, our design shifts between darkness and light.*

## Who reads this

| File | Who reads it | What it defines |
|------|--------------|-----------------|
| `README.md` | Humans | What the project is |
| `AGENTS.md` | Coding agents | How to build the project |
| `DESIGN.md` | Design agents + AI | How the project should look and feel |

## Architecture Overview

### Application: Pi Session Manager
A developer productivity dashboard for managing AI coding agent sessions. The interface presents a **three-panel layout**: left sidebar (session tree), main content (session viewer), and overlay elements (command palette, search, filters).

### Core Identity
**Dark-themed terminal aesthetic** — developer tool vibes, high information density, low visual noise. Inspired by Tokyo Night color palette: deep navy surfaces with teal accents, warm markdown text colors.

---

## Color System

### Design Philosophy
The color system uses **CSS custom properties** (variables) referenced via `var(--*)` in Less and `rgb(var(--color-*) / <alpha>)` in Tailwind. This enables seamless dark/light theme switching with full alpha compositing support.

> 「闇の中でこそ、光は輝く」— 光の中にこそ闇があるように、色は文脈によって意味を変える。

### Dark Mode (Default)
The primary theme. Deep space atmosphere with carefully chosen accent colors that glow against dark backgrounds.

```
:root {
  /* Surface Colors (RGB space-separated for alpha) */
  --color-background:        26  27  38    /* #1A1B26 — Deep space background (Tokyo Night base) */
  --color-foreground:        229 229 231   /* #E5E5E7 — Primary text on dark */
  --color-card:              36  37  54    /* #242536 — Elevated surfaces (sidebar panels) */
  --color-card-foreground:   229 229 231   /* #E5E5E7 — Text on cards */
  --color-popover:           36  37  54    /* #242536 — Dropdowns, menus, tooltips */
  --color-surface:           37  38  54    /* #252636 — Subtle surface areas */
  --color-surface-dark:      30  31  46    /* #1E1F2E — Deeper surfaces */

  /* Interactive Colors */
  --color-primary:           229 229 231   /* #E5E5E7 — Primary UI elements */
  --color-primary-foreground: 26  27  38   /* #1A1B26 — Text on primary */
  --color-secondary:         44  45  59    /* #2C2D3B — Secondary backgrounds */
  --color-secondary-foreground: 229 229 231 /* #E5E5E7 — Text on secondary */
  --color-accent:            44  45  59    /* Same as secondary */

  /* Semantic Brand Accent */
  --accent:                  #8abeb7       /* Teal — Main interactive accent */
  --accent-rgb:              138, 190, 183 /* RGB version for rgba() */
  --border:                  #5f87ff       /* Soft blue accent for borders */
  --borderAccent:            #00d7ff       /* Cyan for highlighted borders */
  --borderMuted:             #505050       /* Subtle borders */
  --color-ring:              138 190 183   /* Teal focus ring */

  /* State Colors */
  --color-success:           126 231 135   /* #7EE787 — Success indicators (tool success) */
  --color-warning:           255 166 87    /* #FFA657 — Warning indicators */
  --color-destructive:       239 68 68     /* #EF4444 — Error/destructive actions */
  --color-info:              86 156 214    /* #569CD6 — Info indicators */
  --color-purple:            199 146 234   /* #C792EA — Purple accent (custom messages) */

  /* Subtle Backgrounds (used for code blocks, inputs, etc.) */
  --bg-subtle:               rgba(0, 0, 0, 0.12)
  --bg-inset:                rgba(0, 0, 0, 0.2)
  --bg-inset-hover:          rgba(0, 0, 0, 0.3)
}
```

### Base46 Theme Presets
The app supports built-in base46-inspired presets through the same `custom` theme path used for Pi theme files. Built-in selections are stored as `base46:<id>` in `settings.appearance.customTheme`, while user theme files continue to use their existing `~/.pi/agent/themes/<name>.json` names.

Current built-in presets live in `src/utils/base46Themes.ts` and include dark and light families: Tokyo Night, Catppuccin Mocha/Latte, Gruvbox Dark/Light, One Dark, Dracula, and Nord. Each preset starts from a base16 palette and maps into the app's semantic tokens rather than raw component colors:

| Base46 role | App tokens |
|-------------|------------|
| `base00` | `background`, `bg`, `--color-background` |
| `base01` / `base02` | `panel`, `panelAlt`, card/surface/popover tokens |
| `base05` | `text`, `foreground`, primary text tokens |
| `base03` / `base04` | `muted`, `dim`, borders and secondary text |
| `base0D` / `base0C` / `base0E` | accent, info, code, links, list bullets |
| `base0B` / `base0A` / `base08` | success, warning, error, diffs and tool states |

Theme application still flows through `applyPiChatTheme()`: previous override variables are cleared, semantic CSS variables are applied, and `theme-dark` or `theme-light` is inferred from the theme background. The Appearance settings panel previews built-in base46 themes with surface, text, state, markdown, and code swatches before applying them.

### Light Mode
Activated via `.theme-light` class. Maintains the same semantic structure with inverted luminance.

```
.theme-light {
  --color-background:        248 249 250   /* #F8F9FA — Light background */
  --color-foreground:        26  27  46    /* #1A1B2E — Dark text */
  --color-card:              255 255 255   /* #FFFFFF — White cards */
  --color-secondary:         232 233 237   /* #E8E9ED — Light secondary */
  --color-muted:             232 233 237   /* #E8E9ED */
  --color-muted-foreground:  107 114 128   /* #6B7280 — Gray text */
  --color-destructive:       220 38 38     /* #DC2626 */
  --color-border:            209 213 219   /* #D1D5DB */
  --color-ring:              13 148 136    /* #0D9488 — Teal focus ring */
  --accent:                  #0d9488       /* Teal accent (darker for light bg) */
  --color-purple:            139 92 246    /* #8B5CF6 */
}
```

### Semantic Text Colors
Used across messages, markdown, and tool displays:

```
/* Message Bubbles */
--text:                      #e5e5e7    /* Primary text */
--text-secondary:            #d4d4d8    /* Secondary text */
--userMessageBg:             #343541    /* User message background (chat-like) */
--userMessageText:           #e5e5e7    /* User message text */
--customMessageBg:           #2d2838    /* Hook/custom message background (purple tint) */
--customMessageLabel:        #9575cd    /* Custom message label color */

/* Thinking Block Colors */
--thinkingText:              #9ca3af    /* Thinking text (muted gray) */
--thinkingOff:               #505050    /* Thinking level: off */
--thinkingMinimal:           #6e6e6e    /* Thinking level: minimal */
--thinkingLow:               #5f87af    /* Thinking level: low */
--thinkingMedium:            #81a2be    /* Thinking level: medium */
--thinkingHigh:              #b294bb    /* Thinking level: high */
--thinkingXhigh:             #d183e8    /* Thinking level: x-high */
```

### Tool Execution Colors
Colors that communicate tool state and type:

```
/* Tool States */
--toolPendingBg:             #282832    /* Pending tool execution */
--toolSuccessBg:             #283228    /* Successful tool execution */
--toolErrorBg:               #3c2828    /* Failed tool execution */

/* Tool Type Colors (8-color palette, inspired by One Dark) */
--tool-color-read:           #61afef    /* Blue — Read operations */
--tool-color-edit:           #e5c07b    /* Yellow — Edit operations */
--tool-color-write:          #c678dd    /* Purple — Write operations */
--tool-color-bash:           #98c379    /* Green — Bash commands */
--tool-color-search:         #56b6c2    /* Cyan — Search */
--tool-color-web-fetch:      #d19a66    /* Orange — Web fetch */

/* Full palette for tool categorization */
--tool-palette-0:            #e06c75    /* Red */
--tool-palette-1:            #d19a66    /* Orange */
--tool-palette-2:            #56b6c2    /* Cyan */
--tool-palette-3:            #c678dd    /* Purple */
--tool-palette-4:            #98c379    /* Green */
--tool-palette-5:            #ff6ac1    /* Pink */
--tool-palette-6:            #9cdcfe    /* Light blue */
--tool-palette-7:            #e5c07b    /* Yellow */
```

### Markdown Syntax Colors
Used for rendered markdown content within session messages:

```
--mdHeading:                 #f0c674    /* Gold — Headings */
--mdLink:                    #81a2be    /* Steel blue — Links */
--mdLinkUrl:                 #666666    /* Gray — Link URLs */
--mdCode:                    #8abeb7    /* Teal — Inline code */
--mdCodeBlock:               #b5bd68    /* Green — Code blocks */
--mdCodeBlockBorder:         #808080    /* Gray — Code block borders */
--mdQuote:                   #808080    /* Gray — Blockquote text */
--mdQuoteBorder:             #808080    /* Gray — Blockquote border */
--mdHr:                      #808080    /* Gray — Horizontal rules */
--mdListBullet:              #8abeb7    /* Teal — List bullets */

/* Diff Colors */
--toolDiffAdded:             #b5bd68    /* Green — Added lines */
--toolDiffRemoved:           #cc6666    /* Red — Removed lines */
--toolDiffContext:           #808080    /* Gray — Context lines */
```

### Syntax Highlighting (Code Theme)
Base syntax colors with support for multiple themes:

```
/* Default (VS Dark-like) */
--syntaxComment:             #6A9955    /* Green — Comments */
--syntaxKeyword:             #569CD6    /* Blue — Keywords */
--syntaxFunction:            #DCDCAA    /* Yellowish — Functions */
--syntaxVariable:            #9CDCFE    /* Light blue — Variables */
--syntaxString:              #CE9178    /* Orange-brown — Strings */
--syntaxNumber:              #B5CEA8    /* Light green — Numbers */
--syntaxType:                #4EC9B0    /* Teal — Types */
--syntaxOperator:            #D4D4D4    /* White — Operators */
--syntaxPunctuation:         #D4D4D4    /* White — Punctuation */
```

### Supported Code Themes
Apply via `data-code-theme` attribute:

| Theme | Description |
|-------|-------------|
| `monokai` | Vibrant, high contrast — `#F92672` pink keywords |
| `dracula` | Purple-pink aesthetic — `#FF79C6` keywords |
| `one-dark` | Classic Atom — `#61AFEF` blue functions |

---

## Typography

### Font Stack
```css
/* Primary Text */
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC',
               'Helvetica Neue', Arial, sans-serif;

/* Monospace (Code, Terminal, Paths) */
--font-family-mono: ui-monospace, 'Cascadia Code', 'Source Code Pro',
                    Menlo, Consolas, 'DejaVu Sans Mono', monospace;
```

### Type Scale
```
Base:        16px (1rem) — Body text, inputs
Small:       11px        — Code blocks, tree nodes, tool headers, labels
Micro:       10px        — Timestamps, hints, status labels, collapsed hints
Tiny:        12px        — Search results, compaction, model changes
Large:       14px        — Empty states, search bar
Code:        11px        — Code block content, line numbers
```

### Line Heights
```
--line-height:  18px   — Base line height (used as padding unit in messages)
1.4             — Thinking blocks, tool output
1.5–1.6         — Assistant text, markdown paragraphs
1.65            — Markdown content base
```

> 「言は短く、心は深く」— Words should be short, but hearts deep. Density wins.

---

## Spacing System

Spacing uses a **4px grid** with semantic naming:

```
4px   — Tight padding (tool toggle, search button)
6px   — Small gaps (filter buttons, tool meta)
8px   — Base gap (flex gaps, padding, margins)
10px  — Section spacing (sidebar controls)
12px  — Medium padding (code blocks, tool execution, search bar)
16px  — Large padding (session viewer, tool arguments, assistant text)
20px  — Viewers padding
24px  — Section margins (session header)
40px  — Empty state padding
```

### Message Spacing
```
Messages: gap 16px between messages (--line-height)
Session content: max-width 1200px, centered
```

---

## Border Radius

```
3px   — Inline code, FTS snippet highlights
4px   — Buttons, tool toggles, filter buttons, tree nodes
6px   — Input fields, search inputs, command wrappers
8px   — Code blocks, tool execution cards, search bar, hover previews, compaction
10px  — User message bubbles (chat-like rounded corners)
32px  — Pill chips (padded pill shapes, `rounded-full`)
```

> Sharp corners for code/data, rounded for interactions, pill for status.

---

## Shadows & Depth

```
/* Layered depth system */
Subtle:     0 1px 2px rgba(0,0,0,0.04)                /* Tool cards */
Base:       0 4px 12px rgba(var(--shadow-rgb), 0.3)   /* Search bar */
Sidebar:    4px 0 12px rgba(var(--shadow-rgb), 0.4)   /* Sidebar shadow */
Float:      0 8px 24px rgba(var(--shadow-rgb), 0.4)   /* Hover previews */
Card float: 0 4px 24px rgba(var(--shadow-rgb), 0.2)   /* Glass cards */
Lift hover: 0 8px 32px rgba(var(--shadow-rgb), 0.3)   /* Glass card hover */
```

---

## Layout Architecture

### Three-Panel Layout
```
┌─────────────────────────────────────────────────────┐
│ [ Sidebar (resizable) ] │ [ Main Content Area ]     │
│                         │                           │
│ • Session Tree         │ • Session Messages         │
│ • Search Bar           │ • Tools & Code Blocks      │
│ • Filter Pills         │ • Thinking Blocks           │
│ • View Mode Toggle     │ • Command Palette (overlay) │
│                         │ • Search (overlay)          │
└─────────────────────────────────────────────────────┘
```

### Multi-View Layouts
The application supports **multiple primary views** that share the same sidebar + viewer architecture:

| View | Description | Screenshot |
|------|-------------|------------|
| **Session Tree** | Default view — hierarchical session display | Dark/light modes |
| **Dashboard** | Stats, charts, activity overview (modal overlay) | Light theme |
| **Kanban Board** | Session board organized by labels/status | Light theme |
| **Favorites Panel** | Bookmarked sessions grid | Dark theme |
| **Settings Modal** | Full-screen settings with categories | Light theme |

### Sidebar
```css
.session-sidebar {
  background: card;
  flex-shrink: 0;
  border-right: 1px solid rgba(accent, 0.15);
  box-shadow: 4px 0 12px rgba(shadow, 0.4);
  position: absolute;
  z-index: 20;
}
```
- Resizable via drag handle with **animated reveal** (opacity + height + width)
- Contains: filters, search, session tree
- Filter pills: compact, uppercase labels, active state uses accent background

### Resize Handle Interaction
```
Default:     Transparent, no visual footprint
Hover:       Background rgba(accent, 0.05), inner line appears
Resizing:    Background rgba(accent, 0.1), inner bar expands, accent color
```

### Session Viewer
```css
.session-viewer {
  padding: 20px;
}
.messages {
  max-width: 1200px;
  margin: 0 auto;
  gap: 16px;
}
```

---

## Overlay Components

### Window Chrome & Titlebar
```css
/* Tauri drag region */
[data-tauri-drag-region] {
  -webkit-app-region: drag;
  app-region: drag;
  user-select: none;
}
```
- macOS traffic light buttons: standard red/yellow/green dots (Tauri handles)
- Window title: "Pi Session Manager" or contextual (e.g. "Kanban Board")
- Drag region spans the top bar area
- Window controls use `no-drag` class to remain interactive

### Connection Banner
```css
.disconnected { bg: red-500/15, text: red-400, border-b: red-500/20 }
.connecting   { bg: amber-500/15, text: amber-400, border-b: amber-500/20 }
.reconnected  { bg: green-500/15, text: green-400, border-b: green-500/20 }
```
- Position: **fixed top**, full-width, `z-50`, above all content
- Height: compact (`py-1.5`, ~24px), `text-xs`, `font-medium`
- Icons: `Loader2` (spinner, animating) for connecting, `WifiOff` for disconnected
- Auto-dismiss: 2s flash on reconnection
- Demo mode: banner hidden

### Dashboard Modal
```css
/* Overlay backdrop */
backdrop-filter: blur(8px);
```
- **Layout**: Centered modal over blurred backdrop
- **Header**: Date title ("Saturday, March 14, 2026") + mode toggle ("Low/1/5", "Detailed mode")
- **Stats Cards**: 4 cards in a row — Sessions, Messages, Tokens, Projects
  - Each card: icon (top-left), large number (2xl, ~24px), label (xs, muted)
  - Card bg: white (light) / card (dark), subtle shadow
- **Project Progress Bar**: Horizontal bar showing project distribution (green fill = 100%)
- **Hour Distribution**: Bar chart — 24h x-axis, activity y-axis
  - Bars: green fill, peak hours highlighted
- **Session List**: Bottom scrollable list
  - Each row: time, user icon, model name, token count
  - Compact, table-like layout

### Settings Modal
```css
/* Full-screen modal */
.position: fixed, inset: 0, z-40
.backdrop: bg-black/50 (optional blur)
```
- **Layout**: Two-panel — left nav (200px) + right content (flex)
- **Left Nav**: Vertical list of categories, active state highlighted (blue bg)
- **Right Panel**: Scrollable content, sections separated by horizontal rules
- **Toggle Switches**: Rounded pill, bg-gray when off, blue when on
- **Radio Groups**: Circular selectors for mutually exclusive options
- **Sliders**: Track + thumb, shows current value label
  - Example: Terminal font size slider 10px–20px with live preview
- **External Terminal Selector**: List of options (iTerm2, Terminal.app, tmux)
  - Each option: icon + name, radio button prefix, selected = blue ring
- **Bottom Actions**: "Reset Settings" (destructive) | "Cancel" | "Save" (primary)

### Kanban Board
```
┌──────────────────────────────────────────────────────────┐
│ [🍔] All Projects ▼  [🔍 Search sessions...]  4062      │
├────────────────┬─────────────────────────────────────────┤
│ Project Filter │ Unlabeled  待处理   进行中  已完成  重复│
│                │ (4047)    (5)      (3)     (3)     (1) │
│ 📁 All Prj     │ ┌─────┐  ┌─────┐  ┌─────┐            │
│  pi-session    │ │card │  │card │  │card │            │
│  dengwenyu     │ │card │  │card │  │card │            │
│  ...           │ │card │  └─────┘  └─────┘            │
└────────────────┴─────────────────────────────────────────┘
```
- **Top Toolbar**: Project dropdown + search input + session count
- **Left Sidebar**: Project list with folder icons, session/msg counts, selected = blue bg + checkmark
- **Columns**: 5 columns with colored dot indicators:
  - Unlabeled (gray), 待处理 (orange), 进行中 (blue), 已完成 (green), 重复 (red)
  - Column header: colored dot + name + count in parentheses
- **Task Cards**: White cards, 8px radius, subtle shadow
  - Content: Title (bold), description (muted, truncated), stats row
  - Stats: comment count, timestamp, source tag (e.g. "AI/pi-session-manager")
  - Card hover: subtle lift effect

---

## Dashboard & Charts

### Stats Cards (`StatCard.tsx`)
```css
.stat-card {
  glass-card + glass-card-hover;       /* See Glassmorphism section */
  border-radius: 8px (rounded-lg);
  padding: 12px (p-3);
  position: relative; overflow: hidden;
}
```
- **Icon**: Top-left, 24px (p-2) rounded-lg, colored bg at 15% opacity + 10% shadow
  - Hover: scale 1.1 + rotate 3deg with motion-transform
- **Trend Badge**: `bg-background/80`, `border-foreground/5`, `backdrop-blur-sm`, 10px, pill (`rounded-full`)
  - Colors: `text-success` (↑), `text-destructive` (↓), `text-muted-foreground` (neutral)
- **Value**: `text-xl` (~20px), `font-bold`, `text-gradient` (gradient overlay)
- **Label**: 10–11px, `text-muted-foreground`, `uppercase tracking-wider font-medium`
- **Hover Effects**:
  - Radial gradient overlay: `circle at top right`, 8% color opacity
  - Bottom glow line: 2px, linear gradient from transparent → 60% color → transparent
  - Shadow glow: `0 0 30px rgba(color, 0.25)` per color variant

**Color Variants (glow classes):**
| Color Hex | Usage | Glow |
|-----------|-------|------|
| `#569cd6` | Sessions | Blue glow |
| `#7ee787` | Messages | Green glow |
| `#ffa657` | Tokens | Orange glow |
| `#ff6b6b` | Cost/Errors | Red glow |

### Stat Icons (Dashboard)
| Icon | Label | Color |
|------|-------|-------|
| `Activity` / `BarChart3` | Sessions / Activity | Blue (#569cd6) |
| `MessageSquare` | Messages | Green (#7ee787) |
| `Zap` | Avg Session | Teal |
| `DollarSign` | Total Cost | Orange (#ffa657) |
| `Clock` | Time Distribution | Purple |

### Charts
- **Activity Heatmap** (`ActivityHeatmap.tsx`): GitHub-style contribution grid
  - Cell: ~12px square, 2px gap, 2px radius
  - Levels: gray→green→dark green (5 levels: 0%, 25%, 50%, 75%, 100%)
- **Token Trend Line Chart** (`TokenTrendChart.tsx`): Area chart with gradient fill
- **Top Models Bar Chart** (`TopModelsChart.tsx`): Horizontal bars with model name labels
- **Message Distribution**: Pie/donut showing user vs assistant ratio
- **Time Distribution**: Hourly breakdown, vertical bars
- **Projects Chart**: Project-level stats comparison
- **Session Length Chart**: Duration distribution

> 「グラフは心の鏡」— Charts reflect the heart of the data.

### Kanban Board (`KanbanCard.tsx`)
```css
.kanban-card {
  bg: card;
  border: 1px solid rgba(border, 0.4);       /* border-border/40 */
  border-radius: 6px (rounded-md);
  padding: 10px (p-2.5);
  cursor: pointer;
  motion-surface + motion-color;
}
.kanban-card.selected {
  border: primary/50;
  bg: primary/5;
  ring: 1px primary/20;
}
.kanban-card.dragging {
  opacity: 0.5;
  box-shadow: shadow-lg;
}
.kanban-card.overlay {
  transform: rotate(2deg) scale(1.05);
  box-shadow: shadow-xl;
}
```
- **Card Content**:
  - Title: truncate, ~13px, body font
  - Description: muted text, 2-line max with line-clamp
  - Stats row: `MessageSquare` icon + count, `Clock` icon + relative time (`12m`, `3h`, `2d`)
  - Project tag: source label (e.g. "AI/pi-session-manager"), 10px, muted
  - Tag badges: colored pills with tag names (from `TagBadge.tsx`)
- **Drag & Drop**: `@dnd-kit/sortable` — card transforms, shadow overlay, rotation

### Kanban Columns (`KanbanColumn.tsx`)
```css
/* Column Header */
.kanban-column-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px;
  font-size: 13px; font-weight: 600;
}
.column-dot { width: 8px; height: 8px; border-radius: 50%; }
.column-count { font-size: 11px; color: muted-foreground; margin-left: auto; }
```
- **Column dot colors**:
  - Unlabeled: `#9ca3af` (gray)
  - 待处理: `#f59e0b` (amber/orange)
  - 进行中: `#3b82f6` (blue)
  - 已完成: `#22c55e` (green)
  - 重复: `#ef4444` (red)
- **Card Stack**: Vertical list, 8px gap between cards
- **Drop Zone**: Dashed border on hover during drag

### Settings Modal (`SettingsPanel.tsx`)
```css
/* Modal Container */
.settings-modal {
  position: fixed; inset: 0; z-index: 40;
  display: flex; align-items: center; justify-content: center;
}
.settings-backdrop {
  position: absolute; inset: 0;
  bg: black/50; animation: ui-fade-in;
}
.settings-container {
  position: relative; z-index: 10;
  display: flex; flex-direction: column;
  max-width: 800px; max-height: 80vh;
  bg: card; border-radius: 12px;
  box-shadow: 0 24px 48px rgba(shadow, 0.3);
  animation: ui-zoom-in;
}
```

**Left Nav**: Category list, 200px wide max
```css
.settings-nav-item {
  padding: 8px 12px; border-radius: 6px;
  cursor: pointer; motion-color;
}
.settings-nav-item.active {
  bg: rgba(accent, 0.12);
  color: accent;
  font-weight: 500;
}
```

**Form Components**:

| Component | Visual | CSS Details |
|-----------|--------|-------------|
| `SettingsToggleRow` | Label + pill switch | Switch: `rounded-full` 20px×36px, bg-gray-300→blue-500 transition |
| `SettingsRadioCardGroup` | Card-style radios | Each: border + icon + label, checked = accent ring |
| `SettingsOptionGroup` | Segmented buttons | Pill group, active = bg-primary text-primary-foreground |
| `SettingsSliderField` | Track + thumb | Track: 4px bg-muted, Thumb: 20px circle with shadow |
| `SettingsVisualSliderField` | Visual preview | Slider + live preview (e.g. font size sample) |
| `SettingsSelect` | Dropdown selector | Native `<select>` styled, 6px radius |
| `SettingsInput` | Text input | 1px border, 6px radius, focus ring on :focus |
| `SettingsField` | Labeled section | Label (12px, 600 weight) + description (muted, 11px) + control |

**Terminal Settings Pattern** (visible in screenshots):
```css
.terminal-section { padding: 16px 0; }
.terminal-section-title { font-size: 14px; font-weight: 600; mb: 12px; }
.shell-option { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.font-size-slider { width: 100%; margin: 8px 0; }
.font-preview { font-family: mono; text-align: center; padding: 8px; bg: inset; border-radius: 6px; }
```

### Dialogs (`dialogs/`)
| Dialog | Purpose | Style |
|--------|---------|-------|
| `DeleteSessionConfirmDialog` | Destructive delete confirmation | Red accents, warning icon, path preview |
| `DeleteSessionPopover` | Quick delete from toolbar | Popover, compact |
| `ExportDialog` | Export sessions (JSON/Markdown) | File format selector, date range |
| `ForkDialog` | Fork/copy a session | Rename input, target path |
| `RenameDialog` | Rename session | Single input with validation |

All dialogs use:
- **Backdrop**: `bg-black/50` + fade-in animation
- **Container**: Card bg, 8–12px radius, shadow-xl
- **Actions**: "Cancel" (secondary) + confirm (primary/accent or destructive for delete)

### Onboarding
```css
.onboarding-overlay {
  position: fixed; inset: 0;
  bg: black/60; backdrop-filter: blur(4px);
}
.onboarding-card {
  max-width: 560px;
  bg: card; border-radius: 16px;
  padding: 32px;
  animation: ui-zoom-in;
}
```
- Multi-step wizard with progress dots
- Soft green theme accents (`#b5bd68`)
- Settings integration (`OnboardingServiceSettings.tsx`)

---

## Component Patterns

### Tool Execution Cards
```
┌─────────────────────────────────────────┐
│ 🔧 tool_name                    12:34pm │
│ └────── Arguments (JSON collapsed) ────┘│
│ └────── $bash_command ──────────────────┘│
│ └────── Output/Result ──────────────────┘│
│ └────── Diff (add/remove/context) ──────┘│
└─────────────────────────────────────────┘
```

- **Header**: Tool name (accent color), icon (14px), timestamp (micro)
- **States**: pending (neutral bg), success (green tint), error (red tint)
- **Border**: 1px solid `rgba(accent, 0.12)`
- **Padding**: 8–12px internal
- **Expandable**: All sections can be expanded with smooth transitions
- **Copy**: Each section has a copy button (appears on hover)

### Message Bubbles
```
User messages:
  ┌─────────────────────────┐
  │ [user] badge    📋 12pm │
  │                         │
  │ Message content...      │
  └─────────────────────────┘

Assistant messages:
  [12:34pm]
  Assistant text content...
  ┌─ Thinking block ──────┐
  │ (collapsible/expandable)
  └───────────────────────┘
  ┌─ Tool execution ──────┐
  │ (see above)           │
  └───────────────────────┘
```

- **User messages**: max-height 380px, overflow scrollable, rounded 10px, chat-like
- **Assistant messages**: no wrapper, direct text flow
- **Thinking block**: collapsible, muted color, can contain nested markdown/code
- **Timestamps**: Micro size, 70% opacity, left-padded

### Code Blocks
```
┌──────────────────────────────────────┐
│ 📄 filename.jsx             📋 Copy  │
├──────────────────────────────────────┤
│ 1 │ import { useState } from 'react';│
│ 2 │                                  │
│ 3 │ export default function App() {  │
│ 4 │   return <div>Hello</div>         │
│ 5 │ }                                │
└──────────────────────────────────────┘
```

- **Wrapper**: `bg-inset`, 8px radius, 16px margin
- **Header**: 8px 12px padding, language + filename in accent
- **Line numbers**: Right-aligned, muted color, mono font
- **Content**: 12px padding, mono font, syntax highlighting
- **Scrollable variant**: Inner scroll with thin scrollbar, no outer wrapper overflow
- **Scrollbar**: 8px height, rgba(accent, 0.3), hover to 0.5

### Session Tree Nodes
```
├─ user        "Can you help me?"
├─ assistant   "Sure! Let me..."
│  ├─ read    file.ts:15-20
│  ├─ bash    npm run build
│  └─ write   fix.ts (patch)
└─ compaction  [Message history compacted]
```

- **Height**: 16px line, 2px vertical spacing
- **Indentation**: Prefix characters for tree structure
- **Role colors**: user (accent), assistant (success), tool (muted)
- **Search match**: `rgba(56, 189, 248, 0.12)` background, sky-blue tint
- **Active**: Accent background, 600 weight, accent color text

### Search Bar
```
┌──────────────────────────────────┐
│ 🔍 Search...          3/12  ⬆⬇ ✕│
└──────────────────────────────────┘
```

- **Position**: Absolute, top-right of session viewer
- **Size**: min-width 320px
- **Border**: 1px solid `rgba(accent, 0.3)` with shadow float
- **Input**: bg-inset-hover, 6px radius
- **Results**: Accent color count, micro font

### Filter Pills
```
[ All ] [ Active ] [ Completed ] [ Archived ]
  ↑ inactive         ↑ active (teal bg)
```

- **Size**: 4px 10px padding, 10px font
- **Inactive**: Transparent bg, muted text
- **Active**: `rgba(accent, 0.15)` bg, accent text, 500 weight
- **Hover**: Subtle rgba(accent, 0.05) bg

### Command Palette
```
┌──────────────────────────────────────────┐
│ 🔍 Type a command or search...           │
├──────────────────────────────────────────┤
│ SESSIONS                                 │
│  ○ Recent session 1                      │
│  ○ Recent session 2                      │
│                                          │
│ ACTIONS                                  │
│  ○ Delete session                        │
│  ○ Copy path                             │
└──────────────────────────────────────────┘
```

- **Max height**: 50vh with scroll
- **Groups**: Uppercase heading, muted-foreground, 12px font, 600 weight
- **Items**: 0.5rem 0.75rem padding, 6px radius, hover/selected use bg-subtle

---

## Motion & Animation

> 「静と動の間に美がある」— Beauty lies between stillness and movement.

### Transition System
```
Instant:    80ms   — Press effects, scale transforms
Fast:       140ms  — Color changes, opacity, hover feedback
Base:       220ms  — Surfaces (bg, border, shadow), transforms
Overlay:    320ms  — Modal entry/exit, major state changes
Data:       480ms  — Width changes, layout shifts
```

### Transition Families
| Family | When to use | Stable anchor | Utility classes |
|--------|-------------|---------------|-----------------|
| Context | Same view, local content/state changes | surrounding frame | `motion-context`, `motion-context-enter` |
| Drill | Moving one level deeper, e.g. list to detail | parent navigation relation | `motion-drill`, `motion-drill-enter` |
| Continuity | Same visual object persists while expanding/morphing | shared element identity | `motion-continuity` |
| Overlay | Modal, command palette, popover surfaces | background app shell | `motion-overlay-backdrop`, `motion-overlay-surface`, `motion-overlay-enter`, `motion-overlay-surface-enter` |
| Layout | Width/flex-basis/panel resizing | app shell geometry | `motion-layout`, `motion-width` |

Use semantic classes before Tailwind `duration-*` and `ease-*` utilities. New motion should reference `--motion-*` tokens and honor `prefers-reduced-motion`.

### Easing Functions
```
Standard:  cubic-bezier(0.4, 0, 0.2, 1)  — Default for most transitions
Enter:     cubic-bezier(0.2, 0.8, 0.2, 1) — Spring-y, overshooting
Exit:      cubic-bezier(0.4, 0, 1, 1)    — Quick start, smooth end
Press:     scale(0.96)                      — 4% compression on press
```

### Keyframe Animations
| Animation | Duration | Effect |
|-----------|----------|--------|
| `ui-fade-in` | base/overlay | Fade 0→1 |
| `ui-zoom-in` | overlay | Scale 0.95→1 + fade in |
| `ui-slide-in-from-top` | overlay | TranslateY -8px + fade |
| `ui-slide-in-from-left` | overlay | TranslateX -8px + fade |
| `ui-slide-in-from-right` | overlay | TranslateX +8px + fade |
| `highlight-pulse` | 2s | Box-shadow pulse + bg flash |
| `blink` | 0.8s | Typing cursor blink |
| `subagent-scale-in` | — | Scale from below + fade |
| `subagent-skeleton-shimmer` | — | Shimmer loading effect |

### Motion Utility Classes
```
.motion-color      — Color/border transitions (fast)
.motion-surface    — Background/border/shadow transitions (base)
.motion-press      — Transform/opacity with active scale(0.96)
.motion-width      — Width transitions (data duration, 480ms)
```

### Reduced Motion
When `prefers-reduced-motion: reduce`, all animation durations collapse to 1ms and scroll behavior to `auto`.

---

## Glassmorphism

The design uses subtle glass effects for floating elements:

```
.glass {
  bg: rgba(glass, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(highlight, 0.08);
}

.glass-card {
  backdrop-filter: blur(16px);
  border: 1px solid rgba(highlight, 0.06);
  box-shadow: 0 4px 24px rgba(shadow, 0.2), 0 1px 2px rgba(highlight, 0.03) inset;
}

.glass-card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(shadow, 0.3), ...;
}
```

---

## Glow Effects

Status-based glow effects for visual feedback:

```
.glow-blue    — info (blue)     — Informational states
.glow-green   — success (green) — Success/complete states
.glow-orange  — warning (orange)— Warning/pending states
.glow-red     — destructive (red)— Error/failure states
```

---

## Accessibility

### Focus Ring
```css
.focus-ring:focus-visible {
  box-shadow:
    0 0 0 2px rgb(var(--color-ring) / 0.62),
    0 0 0 1px rgb(var(--color-background) / 0.9);
}
```
- Teal ring (the accent color)
- 2px width with 1px inner offset
- Visible only on `:focus-visible` (keyboard navigation)

### Safe Areas
All components support `env(safe-area-inset-*)` for mobile notches and keyboards.

### Touch Targets
- Mobile: hide scrollbars, use active feedback (scale 0.96)
- All interactive elements: minimum 32px touch target

### Contrast Ratios
- Body text: **≥4.5:1** (WCAG AA)
- Large text (≥18px): **≥3:1**
- Focus ring: **≥3:1**

---

## Do's and Don'ts

### ✅ Do
- Use Tailwind's `bg-background`, `text-foreground`, `border` etc. for theme-aware coloring
- Apply glassmorphism sparingly — only for floating overlays (search bar, hover previews)
- Use tool type colors consistently (blue=read, green=bash, purple=write, yellow=edit)
- Keep animations under 320ms except data-heavy transitions
- Use `prefers-reduced-motion` checks for all animations
- Use `--bg-inset` and `--bg-subtle` for code blocks, inputs, and nested surfaces
- Apply 8px border radius consistently for cards and code blocks
- Use 11px monospace for all code, path, and tree content
- Layer shadows for depth — subtle for inline, float for overlays

### ❌ Don't
- Mix rounded (10px) and sharp (0px) corners in the same view
- Use solid colors — always use RGBA or CSS variables for theme flexibility
- Exceed 480ms for non-data animations — keeps the UI feeling snappy
- Use more than 8px gap between elements inside cards
- Override line heights below 1.3 for readability
- Use bright saturated colors on dark backgrounds without alpha blending
- Ignore `prefers-reduced-motion` — always include the media query
- Add custom colors without defining them in `_variables.less` or `_themes.less`

---

## File References

### Styles
| File | Purpose |
|------|---------|
| `src/styles/_variables.less` | CSS custom properties, font stacks, all color tokens |
| `src/styles/_themes.less` | Light theme variables (dark is default in `:root`) |
| `src/styles/_base.less` | Reset, typography, drag regions, safe heights |
| `src/styles/_layout.less` | Sidebar, session viewer, resize handle |
| `src/styles/_messages.less` | User/assistant messages, thinking blocks, compaction |
| `src/styles/_markdown.less` | Markdown typography, syntax highlighting, code themes |
| `src/styles/_tool-execution.less` | Tool cards, diffs, bash commands, arguments |
| `src/styles/_code-block.less` | Code blocks, line numbers, scrollable mode |
| `src/styles/_tree.less` | Session tree, nodes, search, status bar |
| `src/styles/_search.less` | Search bar, highlights, navigation |
| `src/styles/_cmdk.less` | Command palette (cmdk library integration) |
| `src/styles/_filters.less` | Filter pills, view mode toggle |
| `src/styles/_animations.less` | Keyframes, animation classes, reduced motion |
| `src/styles/_utilities.less` | Motion, focus, glassmorphism, glow, typography utilities |
| `src/styles/_mobile.less` | Mobile responsive overrides |
| `src/styles/_scroll-markers.less` | Scroll behavior |
| `src/styles/_branch-atlas.less` | Branch Outline 与 Branch Map 样式 |
| `src/styles/_branch-atlas-timeline.less` | Active Path Timeline 样式 |
| `src/styles/_subagent.less` | Subagent-specific animations |
| `src/styles/_model-selector.less` | Model selector dropdown styles |
| `src/styles/index.less` | Main entry point, imports all partials |

### Components (Design-Relevant)
| Directory | Key Components | Design Notes |
|-----------|---------------|-------------|
| `components/dashboard/` | `StatCard`, `ActivityHeatmap`, `TokenTrendChart`, `TopModelsChart`, `RecentSessions` | Glass cards, stat cards with glow effects, charts |
| `components/app/` plugin panes | `AppPluginViewPane`, `AppPluginSidebarPane` | App-level plugin view shell and sidebar shell |
| `components/settings/` | `SettingsPanel`, `SettingsToggleRow`, `SettingsSliderField`, `SettingsRadioCardGroup` | Form inputs, modals, sliders, toggles |
| `components/dialogs/` | `DeleteSessionConfirmDialog`, `ExportDialog`, `ForkDialog`, `RenameDialog` | Modal dialogs, backdrop blur |
| `components/onboarding/` | `OnboardingStepContent` | Wizard overlay, multi-step progress |
| `components/ui/` | `Skeleton`, TagBadge | Loading states, tag pills |
| `components/session-tree/` | Tree view, search | Hierarchy display |
| `components/tool-calls/` | Tool execution cards | Expandable sections, diff rendering |

---

## Design Tokens Summary

> 「一を聞いて十を知る」— Hear one, understand ten. Tokens are the seed of all design.

### Primary Palette (Dark Mode)
| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#8abeb7` | Interactive elements, focus ring, links in code |
| `--text` | `#e5e5e7` | Primary body text |
| `--body-bg` | `rgb(26, 27, 38)` | Root background (Tokyo Night) |
| `--container-bg` | `rgb(44, 45, 59)` | Card backgrounds |
| `--borderAccent` | `#00d7ff` | Highlighted borders, compaction headers |
| `--success` | `#b5bd68` | Success states, tool success, assistant tree nodes |
| `--error` | `#cc6666` | Error states, tool errors |

### Type Scale Quick Reference
| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Heading H1 | 1.5em | 600 | `--mdHeading` (gold) |
| Heading H2 | 1.35em | 600 | `--mdHeading` |
| Body | 16px | 400 | `--text` |
| Code | 11px | 400 | mono stack |
| Label | 10-12px | 500-600 | `--muted-foreground` |
| Timestamp | 10px | 400 | `--muted-foreground`, 70% opacity |

---

*「美は細部に宿る」— Beauty dwells in details.*
*Auto-generated by analyzing `_variables.less`, `_themes.less`, and all `_*.less` style files in `src/styles/`. Last reviewed: 2026-04-07.*

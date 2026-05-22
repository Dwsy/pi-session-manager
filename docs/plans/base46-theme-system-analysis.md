# Base46 Theme System Analysis

## Scope

This note documents the current Pi Session Manager theme pipeline and the compatibility boundary for adding base46-inspired themes. It is the task note for the theme-system planning slice: identify the existing links, compare the base46 data model with the app's `PiThemeFile` model, and define the supported theme sources plus priority rules.

## Existing Theme Chain

### `AppearanceSettings.tsx`

`src/components/settings/sections/AppearanceSettings.tsx` is the user-facing entry point for appearance choices. It edits `settings.appearance.theme`, `settings.appearance.customTheme`, font families, font size, code block theme, message spacing, and tool success styling through the shared settings update callback.

For themes, it exposes the mode selector:

- `dark`
- `light`
- `system`
- `custom`

When `custom` is active, the custom theme selector lists built-in base46 presets and user Pi theme files. Built-in base46 selections use the `base46:<id>` value format. User theme files keep their existing plain theme-name value, matching `~/.pi/agent/themes/<name>.json`.

### `useAppearance.ts`

`src/hooks/useAppearance.ts` applies settings to the document root. Its order is:

1. For `dark`, `light`, and `system`, set `theme-dark` or `theme-light` directly on `document.documentElement`.
2. Always write layout and typography variables such as `--sidebar-width`, `--font-size-base`, `--font-family`, `--font-family-mono`, and `--spacing-base`.
3. Write `data-code-theme` from `appearance.codeBlockTheme`.
4. Call `applyPiChatTheme()` with `appearance.customTheme` only when `appearance.theme === "custom"`; otherwise call it with `app-default` to clear theme-specific overrides while preserving the active dark/light class.

### `utils/piTheme.ts`

`src/utils/piTheme.ts` is the theme adapter and application layer. It owns:

- safe user theme name normalization;
- loading user theme JSON from `themes/<name>.json` with `read_resource_file`;
- listing user theme resources with `scan_all_resources`;
- resolving dark/light scheme by theme name or background luminance;
- clearing previous override variables;
- mapping theme values onto app CSS variables;
- setting `data-chat-theme`, `data-chat-theme-scheme`, and `theme-dark`/`theme-light` for custom themes.

The important lifecycle rule is that `applyPiChatTheme()` clears all previous override variables before applying a custom theme. `app-default` is not a theme file; it means "remove custom overrides and use the normal app variables/classes."

### `_variables.less` and `_themes.less`

`src/styles/_variables.less` defines the dark/default token baseline on `:root`. It contains the semantic RGB variables used by Tailwind-style alpha composition, legacy hex variables used by existing Less modules, markdown colors, diff colors, syntax colors, and tool color palettes.

`src/styles/_themes.less` defines `.theme-light` overrides and system light-mode overrides for `:root:not(.theme-dark):not(.theme-light)`. Dark mode is the default `:root` state; light and system modes override the same semantic token set. Custom/base46 themes do not replace these files; they apply inline root-level overrides through `applyPiChatTheme()`.

## Base46 JSON Versus `PiThemeFile`

Base46 themes are palette-first. Pi Session Manager themes are semantic-token-first.

| Area | Base46/base16 shape | Current `PiThemeFile` shape | Compatibility rule |
|------|---------------------|-----------------------------|--------------------|
| Palette | `base_16`/base16 palette with indexed colors such as `base00` through `base0F` | `vars?: Record<string, string>` plus `colors?: Record<string, string>` | Convert indexed palette colors into named semantic vars before app application. |
| Background/foreground | Usually `base00` is background and `base05`/`base06` are foreground text | `background`, `bg`, `text`, `foreground`, plus `export.pageBg` | Map `base00` to background/page bg and `base05` to text/foreground. |
| Surfaces | Usually `base01`, `base02`, `base03` represent elevated/inset surfaces and selection | `panel`, `panelAlt`, `bgLighter`, `bgSlightlyLighter`, `selected`, `selection` | Map surfaces deterministically so cards, popovers, selected rows, and inset blocks stay coherent. |
| Semantic colors | Base46/base16 gives color roles indirectly: red/orange/yellow/green/cyan/blue/purple | `success`, `warning`, `error`, `accent`, `border`, `purple`, `muted`, `dim` | Derive state colors from palette roles: green success, yellow/orange warning, red error, blue/cyan accent/info. |
| Markdown | Base46 may not include app-specific markdown keys | `mdHeading`, `mdLink`, `mdCode`, `mdCodeBlock`, `mdQuote`, `mdHr`, `mdListBullet` | Generate markdown colors from semantic palette roles instead of requiring explicit JSON keys. |
| Tool/diff states | Base46 does not normally model tool cards | `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `toolTitle`, `toolOutput`, `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext` | Generate tool backgrounds from surfaces and diff colors from green/red/muted. |
| Code highlighting | Base46/base16 can provide syntax palette, but app code blocks also support `data-code-theme` | `--syntax*` variables live in Less; `codeBlockTheme` is separate | Base46 theme controls app/markdown/tool tokens; code block theme remains a separate setting unless a future task explicitly couples them. |

The adapter boundary should stay explicit: base46 data is normalized into a `PiThemeFile`-compatible object first, then the existing `resolveThemeHex()` and `applyPiChatTheme()` path applies it. This keeps user Pi themes and built-in base46 themes on one application lifecycle.

## Supported Theme Sources

The final theme system supports these sources:

1. `dark`: built-in app dark theme from `:root` in `_variables.less`.
2. `light`: built-in app light theme from `.theme-light` in `_themes.less`.
3. `system`: OS-driven mode; `useAppearance()` applies `theme-dark` or `theme-light` according to `prefers-color-scheme` and updates on OS changes.
4. `app-default`: sentinel selection used by `applyPiChatTheme()` to clear custom/base46 overrides while preserving the currently selected dark/light/system class.
5. Built-in base46 presets: stored as `base46:<id>` in `settings.appearance.customTheme`, resolved from the app bundle, then converted to the `PiThemeFile` shape.
6. User Pi themes: stored as plain theme names in `settings.appearance.customTheme`, loaded from `~/.pi/agent/themes/<name>.json` via the Pi resource API.

## Priority And Resolution Rules

The resolution rules are intentionally deterministic and testable:

1. `settings.appearance.theme` decides the mode first.
2. If the mode is `dark`, `light`, or `system`, `useAppearance()` applies the corresponding root class and calls `applyPiChatTheme("app-default")`; no custom theme file or base46 preset should remain active.
3. If the mode is `custom` and `customTheme` starts with `base46:`, resolve the built-in base46 preset first. Do not interpret that value as a user file path.
4. If the mode is `custom` and `customTheme` is a plain valid name, load `~/.pi/agent/themes/<name>.json`.
5. If the mode is `custom` and `customTheme` is `app-default` or invalid, clear custom overrides and fall back to app defaults.
6. Theme application always clears the previous override variables before applying a new custom/base46 theme.
7. Scheme inference sets `theme-dark`/`theme-light` from the custom/base46 theme background so downstream components that inspect root classes continue to work.

## Verification Hooks

The source-priority behavior can be verified by focused tests in `src/utils/piTheme.test.ts`:

- base46 catalog contains both dark and light presets;
- `base46:<id>` is recognized without colliding with user theme names;
- base46 palette values map to app semantic tokens;
- built-in themes apply DOM overrides and `app-default` clears them.

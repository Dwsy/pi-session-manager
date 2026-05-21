# Native Feel Rework Plan

Date: 2026-05-18

This note decomposes the product quality gap from the native-feel skill into concrete layers. The guiding boundary is simple: the native shell owns operating-system behavior, while the WebView owns dense app rendering.

## Product Standard

Pi Session Manager should feel like a focused desktop utility, not a website in a frame. The app should preserve state, respond to keyboard-first workflows, respect platform motion and appearance preferences, expose correct accessibility structure, and avoid browser chrome leaks such as smooth-scrolling surprises or web-only context menus.

## Current Strengths

- Tauri 2 already provides the native shell, window lifecycle, IPC, update plugin dependency, and platform-specific build targets.
- The React app has a stable three-panel productivity layout with command palette, terminal surface, session list, dashboard, and settings.
- The app already calls frontend-ready, overrides most non-editable WebView context menus, keeps the process warm in Tauri, and has a documented native-feel audit baseline.
- The design system is compact and developer-tool oriented, which fits the product domain.

## Gaps By Layer

### Native Shell

- Global shortcuts are still handled mostly in the WebView. System-level shortcuts should live in Tauri when they need to work outside focused DOM state.
- Settings is still an in-app panel. High-value preferences should eventually be available as a native-feeling window or dedicated shell route.
- File associations, updater behavior, and crash reporting need explicit product decisions rather than implicit defaults.
- Native menus and tray behavior should be audited per platform before release.

### Interaction Contract

- Navigation controls need semantic roles, active states, and pressed/checked state so keyboard and assistive tech users perceive the same structure as sighted users.
- Loading states need live-region semantics, otherwise startup and panel transitions are visually apparent but silent to assistive tech.
- Smooth scroll is inappropriate for a native utility unless explicitly user initiated and motion-safe.
- Row-level pointer affordances should be reviewed. Desktop utility lists should often behave like selectable rows instead of webpage links.

### Visual System

- Motion utilities need a hard reduced-motion path. Transform and opacity animations are acceptable only when they collapse cleanly for users who request less motion.
- Dense panels should keep stable dimensions. Hover and active states should not resize controls or shift neighboring content.
- Existing color tokens should remain the source of truth; new one-off hues should be avoided.

### Accessibility

- The app needs clear landmarks for navigation and main workspace.
- Icon-only buttons need labels independent of tooltips.
- Segmented view controls need radio semantics, not a group of unrelated buttons.
- Terminal and modal surfaces need separate focus-return audits.

## Phase 1 Implemented

- Added a navigation landmark to the desktop sidebar.
- Added toolbar semantics and labels for icon-only shell controls.
- Converted the view-mode segmented control to a radiogroup with checked state.
- Replaced hand-written sidebar SVG icons with lucide icons for consistency.
- Added a main workspace landmark and hidden-state semantics when the terminal is maximized.
- Added live-region loading semantics and hid decorative spinner icons from assistive tech.
- Removed remaining smooth-scroll calls in settings search and heatmap modal jumps.
- Added reduced-motion overrides for shared motion utility classes and entry/exit animation helpers.

## Next Phases

### Phase 2: Native Shell Ownership

- Move app-global shortcuts that should work outside focused content into Tauri global-shortcut handling.
- Add a native settings-window decision record: separate window, dedicated route, or current panel with native titlebar behavior.
- Define platform menu, tray, updater, and crash-reporting behavior explicitly.

### Phase 3: Dense Workflow Polish

- Audit all selectable rows and cards for cursor, focus, selected, hover, and context-menu behavior.
- Add roving keyboard behavior where list density makes Tab navigation inefficient.
- Ensure terminal, command palette, modals, and popovers always return focus to the invoking control.

### Phase 4: Release Readiness

- Add an accessibility pass with keyboard-only testing.
- Add reduced-motion and dark/light appearance screenshots to the release checklist.
- Re-run the native-feel audit and update the score from observed behavior, not intent.

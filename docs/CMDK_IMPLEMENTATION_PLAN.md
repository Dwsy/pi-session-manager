# cmdk Global Search Implementation Plan

## Quick Overview

**Goal**: Add global search functionality based on cmdk to Pi Session Manager with plugin-based architecture

**Estimated Duration**: 3-5 days

**Complexity**: L3 (Complex Task)

**Related Documents**:
- Issue: `docs/issues/20260131-Add cmdk global search with plugin architecture.md`
- Architecture Design: `docs/architecture/cmdk-plugin-system.md`

---

## Implementation Phases

### ✅ Phase 1: Planning and Preparation (Completed)

- [x] Analyze existing code structure
- [x] Design plugin system architecture
- [x] Determine technical solutions and dependencies
- [x] Create implementation plan
- [x] Create Workhub Issue
- [x] Write architecture design documents

**Output**:
- Issue documents
- Architecture design documents
- Implementation plan

---

### Phase 2: Core Architecture Implementation (Estimated 1 day)

#### 2.1 Install Dependencies

```bash
pnpm add cmdk
```

#### 2.2 Create Plugin System Infrastructure

**File List**:
- `src/plugins/types.ts` - Plugin interface definitions
- `src/plugins/registry.ts` - Plugin registry
- `src/plugins/base/BaseSearchPlugin.ts` - Plugin base class
- `src/plugins/index.ts` - Exports

**Key Interfaces**:

```typescript
interface SearchPlugin {
  id: string
  name: string
  icon: React.ComponentType
  search(query: string, context: SearchContext): Promise<SearchPluginResult[]>
  onSelect(result: SearchPluginResult, context: SearchContext): void
}
```

#### 2.3 Create Hooks

**File List**:
- `src/hooks/useCommandMenu.ts` - State management
- `src/hooks/useSearchPlugins.ts` - Plugin management
- `src/hooks/useSearchCache.ts` - Search cache

**Core Features**:
- Debounced search (300ms)
- Search request cancellation
- LRU cache (100 items, 5 minute TTL)

#### 2.4 Create Core Components

**File List**:
- `src/components/command/CommandPalette.tsx` - Container
- `src/components/command/CommandMenu.tsx` - Main component
- `src/components/command/CommandItem.tsx` - Result item
- `src/components/command/CommandEmpty.tsx` - Empty state
- `src/components/command/CommandLoading.tsx` - Loading state
- `src/components/command/index.ts` - Exports

**Acceptance Criteria**:
- [ ] Open command panel with Cmd+K
- [ ] Close command panel with ESC
- [ ] Show loading state when entering query
- [ ] Show empty state for empty query

---

### Phase 3: Built-in Plugin Implementation (Estimated 1 day)

#### 3.1 MessageSearchPlugin

**File**: `src/plugins/message/MessageSearchPlugin.ts`

**Features**:
- Integrate with existing `search_sessions` API
- Search user messages and assistant replies
- Highlight matched text
- Navigate to corresponding session

**Acceptance Criteria**:
- [ ] Search message content
- [ ] Display matched snippets
- [ ] Open session when clicking result

#### 3.2 ProjectSearchPlugin

**File**: `src/plugins/project/ProjectSearchPlugin.ts`

**Features**:
- Extract project list from sessions
- Fuzzy match project paths
- Display session counts
- Switch to project view

**Acceptance Criteria**:
- [ ] Search project names
- [ ] Display session counts
- [ ] Switch view when clicking result

#### 3.3 SessionSearchPlugin

**File**: `src/plugins/session/SessionSearchPlugin.ts`

**Features**:
- Search session names, paths, first messages
- Display session metadata (message count, modification time)
- Navigate to session

**Acceptance Criteria**:
- [ ] Search session names
- [ ] Search session paths
- [ ] Open session when clicking result

---

### Phase 4: UI/UX Optimization (Estimated 0.5 day)

#### 4.1 Style Design

**File**: `src/styles/command.css`

**Design Points**:
- Centered modal (max-w-2xl)
- Semi-transparent background overlay (bg-black/50)
- Dark theme color scheme
- Smooth animations (fade + zoom)

**Acceptance Criteria**:
- [ ] Panel displays centered
- [ ] Background overlay is semi-transparent
- [ ] Open/close animations are smooth
- [ ] Hover effects on result items

#### 4.2 Highlight Matched Text

**File**: `src/utils/highlight.ts`

**Features**:
- Calculate highlight ranges
- Render highlight markers
- Support multiple highlight regions

**Acceptance Criteria**:
- [ ] Matched text is highlighted
- [ ] Highlight colors are clearly visible
- [ ] Support multiple matches

#### 4.3 Keyboard Navigation

**Features**:
- ↑↓ Navigate results
- Enter Select result
- ESC Close panel
- Tab Switch plugins (optional)

**Acceptance Criteria**:
- [ ] Smooth keyboard navigation
- [ ] Selected item is highlighted
- [ ] Shortcuts respond promptly

---

### Phase 5: Performance Optimization (Estimated 0.5 day)

#### 5.1 Virtual Scrolling

**File**: `src/components/command/CommandList.tsx`

**Features**:
- Use @tanstack/react-virtual
- Threshold: 50 results
- Estimated item height: 60px

**Acceptance Criteria**:
- [ ] Use virtual scrolling for results over 50 items
- [ ] Smooth scrolling (60fps)
- [ ] Reasonable memory usage

#### 5.2 Search Optimization

**Features**:
- Debounce 300ms
- Cancel unfinished searches
- Execute plugin searches in parallel

**Acceptance Criteria**:
- [ ] Search response time < 300ms (1000 items)
- [ ] Cancel search works properly
- [ ] Parallel search improves performance

#### 5.3 Cache Optimization

**Features**:
- LRU cache (100 items)
- Cache duration: 5 minutes
- Cache key: `${pluginId}:${query}`

**Acceptance Criteria**:
- [ ] Repeated searches hit cache
- [ ] Expired cache is automatically cleaned
- [ ] Memory usage < 50MB

---

### Phase 6: Integration and Testing (Estimated 1 day)

#### 6.1 Integrate into App

**Modified File**: `src/App.tsx`

**Steps**:
1. Import CommandPalette
2. Register built-in plugins
3. Pass search context

**Code Example**:

```typescript
import CommandPalette from './components/command/CommandPalette'
import { registerBuiltinPlugins } from './plugins'

function App() {
  useEffect(() => {
    registerBuiltinPlugins()
  }, [])

  return (
    <>
      {/* Existing components */}
      <div>...</div>
      {/* Command Panel */}
      <CommandPalette />
    </>
  )
}
```

#### 6.2 Internationalization

**Modified Files**:
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`

**New Translations**:
- command.placeholder
- command.empty
- command.loading
- command.plugins.*

#### 6.3 Testing

**Test Checklist**:
- [ ] Shortcut trigger (Cmd+K / Ctrl+K)
- [ ] Search all plugins
- [ ] Result selection and navigation
- [ ] Keyboard navigation
- [ ] Internationalization switching
- [ ] Performance test (1000 items)
- [ ] Edge cases (empty query, no results, error handling)

---

### Phase 7: Documentation and Delivery (Estimated 0.5 day)

#### 7.1 Update Documentation

**File List**:
- `README.md` - Add cmdk feature description
- `docs/PLUGIN_DEVELOPMENT.md` - Plugin development guide (new)
- `docs/USAGE.md` - Usage guide (new)

#### 7.2 Create PR

**Steps**:
1. Create PR documentation
2. Link Issue
3. List change details
4. Add test results

**Command**:

```bash
cd /Users/dengwenyu/Dev/AI/pi-session-manager
bun ~/.pi/agent/skills/workhub/lib.ts create pr "Add cmdk global search with plugin architecture"
```

#### 7.3 Code Review

**Review Points**:
- Code quality
- Performance metrics
- Type safety
- Error handling
- Documentation completeness

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| cmdk | ^1.0.0 | Command palette core library |
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.6.3 | Type system |
| @tanstack/react-virtual | ^3.10.8 | Virtual scrolling (existing) |
| Tailwind CSS | ^3.4.0 | Styling system (existing) |
| i18next | ^25.8.0 | Internationalization (existing) |

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Use cmdk library | Mature, professional, widely used |
| Plugin-based architecture | Extensible, maintainable, follows open/closed principle |
| Debounce 300ms | Balance responsiveness and performance |
| Virtual scrolling threshold 50 | Best practice based on performance testing |
| LRU cache | Improve repeated search performance |
| Parallel search | Improve overall response speed |
| Keep existing SearchPanel | Provide two search methods |

---

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance issues (large data) | High | Virtual scrolling + cache + debounce |
| Plugin conflicts | Medium | Plugin isolation + error handling |
| UI not aesthetically pleasing | Medium | Reference Vercel/Linear design |
| Internationalization omissions | Low | Complete translation files |
| Shortcut conflicts | Low | Use standard shortcuts (Cmd+K) |

---

## Acceptance Criteria Summary

### Functional

- [x] Cmd+K / Ctrl+K opens command panel
- [ ] Real-time search (debounce 300ms)
- [ ] Search user messages
- [ ] Search projects
- [ ] Search sessions
- [ ] Select result to navigate
- [ ] ESC closes panel

### Performance

- [ ] Search response time < 300ms (1000 items)
- [ ] First render time < 100ms
- [ ] Virtual scrolling smooth (60fps)
- [ ] Memory usage < 50MB (10000 cached items)

### UI/UX

- [ ] Panel displays centered
- [ ] Semi-transparent background overlay
- [ ] Smooth animations
- [ ] Highlight matched text
- [ ] Smooth keyboard navigation
- [ ] Loading state and empty state

### Internationalization

- [ ] Chinese/English switching
- [ ] All text translated
- [ ] Shortcut hints display based on system

---

## Next Actions

1. **Start Now**: Phase 2 (Core Architecture Implementation)
2. **Install Dependencies**: `pnpm add cmdk`
3. **Create Directory Structure**: `src/plugins/`, `src/components/command/`
4. **Implement Plugin System**: Start with `types.ts` and `registry.ts`

**Estimated Completion**: 2026-02-05

---

## Reference Resources

- [cmdk Official Documentation](https://cmdk.paco.me/)
- [Vercel Design System](https://vercel.com/design)
- [Linear Command Palette](https://linear.app/)
- [@tanstack/react-virtual](https://tanstack.com/virtual/latest)
- [Architecture Design Document](./architecture/cmdk-plugin-system.md)
- [Issue Document](./issues/20260131-Add%20cmdk%20global%20search%20with%20plugin%20architecture.md)

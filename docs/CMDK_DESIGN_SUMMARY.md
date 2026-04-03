# cmdk Global Search Design Summary

## 📋 Project Overview

Add global search functionality based on the cmdk library to Pi Session Manager, adopting a plugin-based architecture design.

**Status**: ✅ Design complete, pending implementation

**Complexity**: L3 (Complex task)

**Estimated Duration**: 3-5 days

**Creation Date**: 2026-01-31

---

## 🎯 Core Goals

1. **Global Access**: `Cmd+K` / `Ctrl+K` shortcut for quick opening
2. **Multi-source Search**: Support searching user messages, projects, sessions
3. **Extensibility**: Plugin-based architecture for easy feature additions
4. **High Performance**: Debouncing, virtual scrolling, cache optimization
5. **Beautiful UI**: Modern design with smooth animations

---

## 🏗️ Architecture Design

### System Layers

```
┌─────────────────────────────────────┐
│         CommandPalette              │  ← UI Container Layer
│  ┌───────────────────────────────┐  │
│  │       CommandMenu             │  │  ← cmdk Component Layer
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      useCommandMenu Hook            │  ← State Management Layer
│      useSearchPlugins Hook          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│       PluginRegistry                │  ← Plugin System Layer
│  ┌─────┐  ┌─────┐  ┌─────┐         │
│  │Msg  │  │Proj │  │Sess │  ...    │  ← Plugin Implementation Layer
│  └─────┘  └─────┘  └─────┘         │
└─────────────────────────────────────┘
```

### Directory Structure

```
src/
├── components/command/          # cmdk components
│   ├── CommandPalette.tsx       # Container
│   ├── CommandMenu.tsx          # Main component
│   ├── CommandItem.tsx          # Result item
│   ├── CommandEmpty.tsx         # Empty state
│   └── CommandLoading.tsx       # Loading state
├── hooks/
│   ├── useCommandMenu.ts        # State management
│   ├── useSearchPlugins.ts      # Plugin management
│   └── useSearchCache.ts        # Search cache
├── plugins/
│   ├── types.ts                 # Plugin interfaces
│   ├── registry.ts              # Plugin registry
│   ├── base/
│   │   └── BaseSearchPlugin.ts  # Plugin base class
│   ├── message/
│   │   └── MessageSearchPlugin.ts
│   ├── project/
│   │   └── ProjectSearchPlugin.ts
│   └── session/
│       └── SessionSearchPlugin.ts
└── utils/
    ├── highlight.ts             # Highlight utilities
    └── search.ts                # Search utilities
```

---

## 🔌 Plugin System

### Core Interface

```typescript
interface SearchPlugin {
  // Metadata
  id: string
  name: string
  icon: React.ComponentType
  description: string
  keywords: string[]
  priority: number
  
  // Core methods
  search(query: string, context: SearchContext): Promise<SearchPluginResult[]>
  onSelect(result: SearchPluginResult, context: SearchContext): void
  
  // Optional methods
  renderItem?(result: SearchPluginResult): React.ReactNode
  isEnabled?(context: SearchContext): boolean
}
```

### Built-in Plugins

| Plugin | Function | Priority |
|--------|----------|----------|
| MessageSearchPlugin | Search user messages and assistant replies | 80 |
| ProjectSearchPlugin | Search projects | 70 |
| SessionSearchPlugin | Search session names and metadata | 60 |

### Extensibility

- ✅ Support for registering custom plugins
- ✅ Plugin isolation, no interference between plugins
- ✅ Plugin priority control
- ✅ Plugin enable/disable control

---

## ⚡ Performance Optimization

### Search Optimization

- **Debounce**: 300ms delay to avoid frequent searches
- **Cancel Requests**: Use AbortController to cancel unfinished searches
- **Parallel Search**: All plugins execute in parallel using Promise.all()

### Rendering Optimization

- **Virtual Scrolling**: Use @tanstack/react-virtual for results over 50 items
- **Lazy Loading**: Plugins load on demand
- **React.memo**: Optimize component re-rendering

### Cache Strategy

- **LRU Cache**: Cache the most recent 100 search results
- **Cache Key**: `${pluginId}:${query}`
- **Cache Time**: 5 minutes
- **Auto Cleanup**: Clean expired cache when closing panel

### Performance Metrics

| Metric | Target |
|--------|--------|
| Search response time | < 300ms (1000 items) |
| First render time | < 100ms |
| Virtual scrolling frame rate | 60fps |
| Memory usage | < 50MB (10000 cached items) |

---

## 🎨 UI/UX Design

### Layout

- **Panel Width**: 640px (max-w-2xl)
- **Panel Height**: Maximum 60vh
- **Position**: Vertically centered, 20vh from top
- **Background Overlay**: rgba(0, 0, 0, 0.5)

### Colors (Dark Theme)

| Element | Color |
|---------|-------|
| Background | #1a1b26 |
| Border | #2a2b36 |
| Input | #252636 |
| Selected | #2a2b36 |
| Text | #c0caf5 |
| Muted text | #565f89 |
| Highlight | #7aa2f7 |

### Animations

- **Open/Close**: fade + scale (200ms ease-out)
- **Result list**: fade + slide-up (150ms ease-out)
- **Loading state**: spin (1s linear infinite)

### Shortcuts

| Shortcut | Function |
|----------|----------|
| Cmd+K / Ctrl+K | Open command palette |
| ESC | Close command palette |
| ↑ / ↓ | Navigate results |
| Enter | Select result |

---

## 🌍 Internationalization

### Supported Languages

- ✅ Chinese (Simplified)
- ✅ English

### Translation Copy

```json
{
  "command": {
    "placeholder": "Search sessions, projects, messages...",
    "empty": "No results found",
    "loading": "Searching...",
    "plugins": {
      "messageSearch": "Message Search",
      "projectSearch": "Project Search",
      "sessionSearch": "Session Search"
    }
  }
}
```

---

## 📦 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| cmdk | ^1.0.0 | Command palette core library |
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.6.3 | Type system |
| @tanstack/react-virtual | ^3.10.8 | Virtual scrolling |
| Tailwind CSS | ^3.4.0 | Styling system |
| i18next | ^25.8.0 | Internationalization |

---

## 📝 Implementation Plan

### Phase 2: Core Architecture (1 day)

- Install cmdk dependency
- Create plugin system infrastructure
- Implement Hooks (useCommandMenu, useSearchPlugins, useSearchCache)
- Create core components (CommandPalette, CommandMenu, CommandItem)

### Phase 3: Built-in Plugins (1 day)

- Implement MessageSearchPlugin
- Implement ProjectSearchPlugin
- Implement SessionSearchPlugin

### Phase 4: UI/UX Optimization (0.5 day)

- Design styles (command.css)
- Implement matched text highlighting
- Optimize keyboard navigation

### Phase 5: Performance Optimization (0.5 day)

- Implement virtual scrolling
- Optimize search performance
- Implement cache strategy

### Phase 6: Integration and Testing (1 day)

- Integrate into App.tsx
- Add internationalization translations
- Functional testing
- Performance testing

### Phase 7: Documentation and Delivery (0.5 day)

- Update README.md
- Write plugin development guide
- Create PR
- Code review

**Estimated Completion**: 2026-02-05

---

## ✅ Acceptance Criteria

### Functional

- [ ] Cmd+K / Ctrl+K opens command palette
- [ ] Real-time search (300ms debounce)
- [ ] Search user messages, projects, sessions
- [ ] Select result to navigate
- [ ] ESC closes panel

### Performance

- [ ] Search response time < 300ms (1000 items)
- [ ] First render time < 100ms
- [ ] Virtual scrolling smooth (60fps)
- [ ] Memory usage < 50MB

### UI/UX

- [ ] Panel displays centered
- [ ] Semi-transparent background overlay
- [ ] Smooth animations
- [ ] Highlight matched text
- [ ] Smooth keyboard navigation

### Internationalization

- [ ] Chinese/English switching
- [ ] All text translated

---

## 🔮 Future Extensions

### Command Plugins

- Export session
- Delete session
- Switch theme
- Open settings

### AI Search

- Semantic search
- Vector similarity
- Natural language queries

### Search History

- Recent searches
- Popular searches
- Search suggestions

### Custom Plugins

- Plugin API documentation
- Plugin marketplace
- Plugin configuration interface

---

## 📚 Related Documents

- **Issue**: `docs/issues/20260131-Add cmdk global search with plugin architecture.md`
- **Architecture Design**: `docs/architecture/cmdk-plugin-system.md`
- **Implementation Plan**: `docs/CMDK_IMPLEMENTATION_PLAN.md`
- **cmdk Official Documentation**: https://cmdk.paco.me/

---

## 🎉 Summary

This design provides a complete, extensible cmdk global search system:

**Core Advantages**:

- ✅ Plugin-based architecture, easy to extend
- ✅ High-performance optimization (debounce, virtual scrolling, cache)
- ✅ Beautiful UI design
- ✅ Complete type system
- ✅ Internationalization support
- ✅ Good user experience

**Technical Highlights**:

- Uses cmdk library for professional command palette experience
- Plugin system based on interface design, following SOLID principles
- Comprehensive performance optimization strategy
- Modular component design with clear responsibilities
- Comprehensive error handling and edge case considerations

**Next Step**: Start Phase 2 (Core Architecture Implementation)

---

*Design Completion Date: 2026-01-31*

*Designer: Pi Agent*

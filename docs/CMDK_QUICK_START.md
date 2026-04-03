# cmdk Quick Start Guide

## 🚀 Quick Start

This guide helps you quickly understand the design and implementation steps for the cmdk global search feature.

---

## 📖 Understanding the Design in 5 Minutes

### Core Concepts

1. **Command Palette**: A global search interface quickly opened with `Cmd+K`
2. **Plugin System**: An extensible search functionality architecture
3. **High Performance**: Debouncing, virtual scrolling, cache optimization
4. **Beautiful UI**: Modern design with smooth animations

### User Experience

```
User presses Cmd+K
    ↓
Command palette pops up (centered, semi-transparent background)
    ↓
Type "auth"
    ↓
Real-time search results display (300ms debounce)
    ├─ 💬 Message Search: "auth implementation..."
    ├─ 📁 Project Search: "/auth-service"
    └─ 📄 Session Search: "auth session"
    ↓
Navigate with ↑↓, select with Enter
    ↓
Open corresponding session/project
```

### Tech Stack

- **cmdk**: Core command palette library
- **React + TypeScript**: UI framework
- **Tailwind CSS**: Styling system
- **@tanstack/react-virtual**: Virtual scrolling

---

## 📁 File Structure Overview

```
src/
├── components/command/          # UI Components
│   ├── CommandPalette.tsx       # Container (shortcuts, overlay)
│   ├── CommandMenu.tsx          # Main component (search box, result list)
│   ├── CommandItem.tsx          # Result item
│   ├── CommandEmpty.tsx         # Empty state
│   └── CommandLoading.tsx       # Loading state
│
├── hooks/                       # State Management
│   ├── useCommandMenu.ts        # Panel state (open/close/query)
│   ├── useSearchPlugins.ts      # Plugin management (search/registry)
│   └── useSearchCache.ts        # Search cache (LRU)
│
├── plugins/                     # Plugin System
│   ├── types.ts                 # Interface definitions
│   ├── registry.ts              # Plugin registry
│   ├── base/
│   │   └── BaseSearchPlugin.ts  # Plugin base class
│   ├── message/
│   │   └── MessageSearchPlugin.ts
│   ├── project/
│   │   └── ProjectSearchPlugin.ts
│   └── session/
│       └── SessionSearchPlugin.ts
│
└── utils/                       # Utility Functions
    ├── highlight.ts             # Highlight matched text
    └── search.ts                # Search utilities
```

---

## 🔌 Plugin System Overview

### Plugin Interface

```typescript
interface SearchPlugin {
  id: string                     // Unique identifier
  name: string                   // Display name
  icon: React.ComponentType      // Icon
  priority: number               // Priority (0-100)
  
  // Core methods
  search(query, context): Promise<SearchPluginResult[]>
  onSelect(result, context): void
}
```

### Built-in Plugins

| Plugin | ID | Priority | Function |
|--------|----|----------|----------|
| 💬 Message Search | message-search | 80 | Search user messages and assistant replies |
| 📁 Project Search | project-search | 70 | Search project paths |
| 📄 Session Search | session-search | 60 | Search session names and metadata |

### Creating Custom Plugins

```typescript
// 1. Extend base class
class MyPlugin extends BaseSearchPlugin {
  id = 'my-plugin'
  name = 'My Plugin'
  icon = MyIcon
  priority = 50
  
  // 2. Implement search
  async search(query: string, context: SearchContext) {
    // Your search logic
    return [
      {
        id: 'result-1',
        pluginId: this.id,
        title: 'Result 1',
        score: 0.9
      }
    ]
  }
  
  // 3. Implement selection handler
  onSelect(result: SearchPluginResult, context: SearchContext) {
    // Your handler logic
    console.log('Selected:', result)
  }
}

// 4. Register plugin
pluginRegistry.register(new MyPlugin())
```

---

## ⚡ Performance Optimization Overview

### Search Optimization

```typescript
// Debounce 300ms
useEffect(() => {
  const timer = setTimeout(() => {
    search(query)
  }, 300)
  return () => clearTimeout(timer)
}, [query])

// Cancel unfinished searches
const abortController = new AbortController()
// ... search logic
abortController.abort()

// Parallel search
const results = await Promise.all([
  plugin1.search(query, context),
  plugin2.search(query, context),
  plugin3.search(query, context)
])
```

### Rendering Optimization

```typescript
// Virtual scrolling (over 50 items)
const virtualizer = useVirtualizer({
  count: results.length,
  estimateSize: () => 60,
  enabled: results.length > 50
})

// React.memo
const CommandItem = React.memo(({ result }) => {
  // ...
})
```

### Cache Optimization

```typescript
// LRU cache
const cache = new Map<string, CacheEntry>()

function get(query: string) {
  const entry = cache.get(query)
  if (entry && Date.now() - entry.timestamp < 5 * 60 * 1000) {
    return entry.results
  }
  return null
}

function set(query: string, results: SearchPluginResult[]) {
  if (cache.size >= 100) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
  cache.set(query, { results, timestamp: Date.now() })
}
```

---

## 🎨 UI Design Overview

### Layout

```tsx
<div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50">
  <div className="w-full max-w-2xl max-h-[60vh] bg-[#1a1b26] rounded-lg">
    <CommandMenu />
  </div>
</div>
```

### Colors

```css
/* Dark theme */
--background: #1a1b26
--border: #2a2b36
--input: #252636
--selected: #2a2b36
--text: #c0caf5
--muted: #565f89
--highlight: #7aa2f7
```

### Animations

```css
/* Open animation */
.animate-in {
  animation: fadeIn 200ms ease-out, zoomIn 200ms ease-out;
}

/* Highlight */
mark {
  background: rgba(122, 162, 247, 0.2);
  color: #7aa2f7;
}
```

---

## 🛠️ Implementation Steps

### Phase 1: Preparation (Completed ✅)

- [x] Design architecture
- [x] Write documentation
- [x] Create plan

### Phase 2: Core Architecture (1 day)

```bash
# 1. Install dependencies
pnpm add cmdk

# 2. Create directories
mkdir -p src/components/command
mkdir -p src/plugins/{base,message,project,session}
mkdir -p src/hooks

# 3. Create files
touch src/plugins/types.ts
touch src/plugins/registry.ts
touch src/hooks/useCommandMenu.ts
touch src/components/command/CommandPalette.tsx
```

### Phase 3: Built-in Plugins (1 day)

```typescript
// Implement MessageSearchPlugin
export class MessageSearchPlugin extends BaseSearchPlugin {
  // ...
}

// Implement ProjectSearchPlugin
export class ProjectSearchPlugin extends BaseSearchPlugin {
  // ...
}

// Implement SessionSearchPlugin
export class SessionSearchPlugin extends BaseSearchPlugin {
  // ...
}
```

### Phase 4: UI/UX (0.5 day)

```css
/* Create command.css */
[cmdk-root] { /* ... */ }
[cmdk-input] { /* ... */ }
[cmdk-list] { /* ... */ }
```

### Phase 5: Performance Optimization (0.5 day)

```typescript
// Implement virtual scrolling
const virtualizer = useVirtualizer({ /* ... */ })

// Implement cache
const cache = useSearchCache()
```

### Phase 6: Integration Testing (1 day)

```typescript
// App.tsx
import CommandPalette from './components/command/CommandPalette'
import { registerBuiltinPlugins } from './plugins'

function App() {
  useEffect(() => {
    registerBuiltinPlugins()
  }, [])
  
  return (
    <>
      {/* Existing components */}
      <CommandPalette />
    </>
  )
}
```

### Phase 7: Documentation Delivery (0.5 day)

```bash
# Update documentation
vim README.md
vim docs/PLUGIN_DEVELOPMENT.md

# Create PR
bun ~/.pi/agent/skills/workhub/lib.ts create pr "Add cmdk global search"
```

---

## ✅ Acceptance Checklist

### Functional Testing

- [ ] Press Cmd+K to open command palette
- [ ] Enter query to display results
- [ ] Select result to navigate correctly
- [ ] Press ESC to close panel
- [ ] Keyboard navigation is smooth

### Performance Testing

- [ ] Search response < 300ms (1000 items)
- [ ] First render < 100ms
- [ ] Virtual scrolling smooth (60fps)
- [ ] Memory usage < 50MB

### UI Testing

- [ ] Panel displays centered
- [ ] Background overlay is semi-transparent
- [ ] Animations are smooth
- [ ] Match text is highlighted
- [ ] Responsive design

### Internationalization Testing

- [ ] Chinese/English switching
- [ ] All text is translated

---

## 📚 Related Documents

| Document | Description |
|----------|-------------|
| [Issue](./issues/20260131-Add%20cmdk%20global%20search%20with%20plugin%20architecture.md) | Task tracking |
| [Architecture Design](./architecture/cmdk-plugin-system.md) | Detailed architecture design |
| [Implementation Plan](./CMDK_IMPLEMENTATION_PLAN.md) | Phased implementation plan |
| [Design Summary](./CMDK_DESIGN_SUMMARY.md) | Design overview |
| [Architecture Diagram](./CMDK_ARCHITECTURE_DIAGRAM.md) | Visual architecture diagrams |

---

## 🎯 Next Steps

1. **Start Implementation**: Phase 2 (Core Architecture)
2. **Install Dependencies**: `pnpm add cmdk`
3. **Create Files**: Follow file structure
4. **Implement Plugins**: Start with MessageSearchPlugin

**Estimated Completion**: 2026-02-05

---

## 💡 Tips

### Development Tips

1. **Core first, optimize later**: Get functionality working first, then optimize performance
2. **Test-driven**: Test after each Phase completion
3. **Reference designs**: Look at Vercel, Linear command palettes for inspiration
4. **Performance monitoring**: Use React DevTools Profiler to monitor performance

### FAQ

**Q: How to debug plugins?**
A: Add `console.log` in the plugin's `search()` method to view the search process.

**Q: How to optimize search speed?**
A: Use debouncing, caching, and parallel search. Reference Phase 5.

**Q: How to customize styles?**
A: Modify `command.css` and Tailwind class names.

**Q: How to add new plugins?**
A: Extend `BaseSearchPlugin`, implement `search()` and `onSelect()`, then register.

---

## 🎉 Summary

This design provides a complete, extensible cmdk global search system:

- ✅ Plugin-based architecture, easy to extend
- ✅ High-performance optimization
- ✅ Beautiful UI design
- ✅ Comprehensive documentation

**Start implementing!** 🚀

---

*Quick Start Guide - 2026-01-31*

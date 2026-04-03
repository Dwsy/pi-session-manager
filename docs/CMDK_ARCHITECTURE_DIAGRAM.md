# cmdk Architecture Diagrams

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            App.tsx                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    CommandPalette                              │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                  CommandMenu                             │  │  │
│  │  │  ┌───────────────────────────────────────────────────┐  │  │  │
│  │  │  │  🔍 Input (Search Box)                            │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  │  ┌───────────────────────────────────────────────────┐  │  │  │
│  │  │  │  📋 CommandList (Result List)                     │  │  │  │
│  │  │  │    ┌─────────────────────────────────────────┐    │  │  │  │
│  │  │  │    │  💬 Message Search Results              │    │  │  │  │
│  │  │  │    │    - CommandItem                        │    │  │  │  │
│  │  │  │    │    - CommandItem                        │    │  │  │  │
│  │  │  │    └─────────────────────────────────────────┘    │  │  │  │
│  │  │  │    ┌─────────────────────────────────────────┐    │  │  │  │
│  │  │  │    │  📁 Project Search Results              │    │  │  │  │
│  │  │  │    │    - CommandItem                        │    │  │  │  │
│  │  │  │    └─────────────────────────────────────────┘    │  │  │  │
│  │  │  │    ┌─────────────────────────────────────────┐    │  │  │  │
│  │  │  │    │  📄 Session Search Results              │    │  │  │  │
│  │  │  │    │    - CommandItem                        │    │  │  │  │
│  │  │  │    └─────────────────────────────────────────┘    │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Hooks Layer                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ useCommandMenu   │  │ useSearchPlugins │  │ useSearchCache   │  │
│  │                  │  │                  │  │                  │  │
│  │ - isOpen         │  │ - registry       │  │ - get()          │  │
│  │ - query          │  │ - search()       │  │ - set()          │  │
│  │ - results        │  │ - isSearching    │  │ - clear()        │  │
│  │ - open()         │  │                  │  │                  │  │
│  │ - close()        │  │                  │  │ LRU Cache:       │  │
│  │ - setQuery()     │  │                  │  │ - 100 entries    │  │
│  │                  │  │                  │  │ - 5 min TTL      │  │
│  │ Debounce: 300ms  │  │ Parallel search  │  │                  │  │
│  │ Cancel requests  │  │                  │  │                  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      Plugin System Layer                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     PluginRegistry                             │  │
│  │                                                                │  │
│  │  - register(plugin)                                            │  │
│  │  - unregister(pluginId)                                        │  │
│  │  - get(pluginId)                                               │  │
│  │  - getAll()                                                    │  │
│  │  - search(query, context) → Promise<SearchPluginResult[]>     │  │
│  │                                                                │  │
│  │  Execute all plugin searches in parallel → Merge results → Sort by score │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       Plugin Implementations                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ 💬 Message       │  │ 📁 Project       │  │ 📄 Session       │  │
│  │ SearchPlugin     │  │ SearchPlugin     │  │ SearchPlugin     │  │
│  │                  │  │                  │  │                  │  │
│  │ Priority: 80     │  │ Priority: 70     │  │ Priority: 60     │  │
│  │                  │  │                  │  │                  │  │
│  │ search():        │  │ search():        │  │ search():        │  │
│  │ - Call Tauri API │  │ - Extract project│  │ - Search session │  │
│  │ - Search message │  │   list           │  │   name           │  │
│  │   content        │  │ - Fuzzy match    │  │ - Search path    │  │
│  │ - Format results │  │ - Show count     │  │ - Show metadata  │  │
│  │                  │  │                  │  │                  │  │
│  │ onSelect():      │  │ onSelect():      │  │ onSelect():      │  │
│  │ - Open session   │  │ - Switch project │  │ - Open session   │  │
│  │                  │  │   view           │  │                  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  BaseSearchPlugin                             │  │
│  │                                                               │  │
│  │  - fuzzyMatch(query, text) → score                           │  │
│  │  - calculateHighlights(query, text) → HighlightRange[]       │  │
│  │  - isEnabled(context) → boolean                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
User presses Cmd+K
    ↓
CommandPalette.open()
    ↓
useCommandMenu.open()
    ↓
Display command palette
    ↓
User enters query "auth"
    ↓
useCommandMenu.setQuery("auth")
    ↓
Debounce 300ms
    ↓
useSearchPlugins.search("auth")
    ↓
Check cache
    ├─ Hit → Return cached results
    └─ Miss ↓
         PluginRegistry.search("auth", context)
              ↓
         Promise.all([
           MessageSearchPlugin.search("auth", context),
           ProjectSearchPlugin.search("auth", context),
           SessionSearchPlugin.search("auth", context)
         ])
              ↓
         [
           { id: "msg-1", title: "auth implementation", score: 0.9, pluginId: "message-search" },
           { id: "proj-1", title: "/auth-service", score: 0.8, pluginId: "project-search" },
           { id: "sess-1", title: "auth session", score: 0.7, pluginId: "session-search" }
         ]
              ↓
         Merge results + Sort (by score × priority)
              ↓
         Cache results (key: "message-search:auth", "project-search:auth", ...)
              ↓
         Return results
    ↓
useCommandMenu.setResults(results)
    ↓
CommandMenu renders results
    ├─ Group by plugin
    ├─ Highlight matched text
    └─ Virtual scrolling (if > 50 items)
    ↓
User selects result (press Enter)
    ↓
plugin.onSelect(result, context)
    ├─ MessageSearchPlugin → Open session
    ├─ ProjectSearchPlugin → Switch project view
    └─ SessionSearchPlugin → Open session
    ↓
CommandPalette.close()
```

## Plugin System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SearchPlugin Interface                  │
│                                                              │
│  interface SearchPlugin {                                    │
│    // Metadata                                               │
│    id: string                                                │
│    name: string                                              │
│    icon: React.ComponentType                                 │
│    description: string                                       │
│    keywords: string[]                                        │
│    priority: number                                          │
│                                                              │
│    // Core methods                                           │
│    search(query, context): Promise<SearchPluginResult[]>    │
│    onSelect(result, context): void                           │
│                                                              │
│    // Optional methods                                       │
│    renderItem?(result): React.ReactNode                      │
│    isEnabled?(context): boolean                              │
│    onMount?(): void                                          │
│    onUnmount?(): void                                        │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                          ↓ implements
┌─────────────────────────────────────────────────────────────┐
│                    BaseSearchPlugin                          │
│                                                              │
│  abstract class BaseSearchPlugin implements SearchPlugin {  │
│    // Abstract properties (subclasses must implement)        │
│    abstract id: string                                       │
│    abstract name: string                                     │
│    abstract icon: React.ComponentType                        │
│                                                              │
│    // Default implementation                                 │
│    priority: number = 50                                     │
│                                                              │
│    // Utility methods                                        │
│    protected fuzzyMatch(query, text): number                 │
│    protected calculateHighlights(query, text): Range[]       │
│                                                              │
│    // Default implementation (can be overridden)             │
│    onSelect(result, context): void                           │
│    isEnabled(context): boolean                               │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                          ↓ extends
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ MessageSearch    │  │ ProjectSearch    │  │ SessionSearch    │
│ Plugin           │  │ Plugin           │  │ Plugin           │
│                  │  │                  │  │                  │
│ id: "message-    │  │ id: "project-    │  │ id: "session-    │
│      search"     │  │      search"     │  │      search"     │
│ priority: 80     │  │ priority: 70     │  │ priority: 60     │
│                  │  │                  │  │                  │
│ search():        │  │ search():        │  │ search():        │
│ - Tauri API      │  │ - Extract project│  │ - Search session │
│                  │  │                  │  │                  │
│ onSelect():      │  │ onSelect():      │  │ onSelect():      │
│ - Open session   │  │ - Switch project │  │ - Open session   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Performance Optimization Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Performance Layer                       │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │   Debounce     │  │   Virtual      │  │   LRU Cache    ││
│  │   Search       │  │   Scroll       │  │                ││
│  │                │  │                │  │                ││
│  │ Delay: 300ms   │  │ Threshold: 50  │  │ Size: 100      ││
│  │ Cancel pending │  │ Item height:   │  │ TTL: 5 min     ││
│  │ requests       │  │ 60px           │  │                ││
│  │                │  │ Frame rate:    │  │                ││
│  │                │  │ 60fps          │  │                ││
│  └────────────────┘  └────────────────┘  └────────────────┘│
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │   Parallel     │  │   Lazy Plugin  │  │   React.memo   ││
│  │   Search       │  │   Loading      │  │                ││
│  │                │  │                │  │                ││
│  │ Promise.all()  │  │ Load on demand │  │ Optimize       ││
│  │ All plugins    │  │ Reduce initial │  │ re-renders     ││
│  │ in parallel    │  │ load           │  │                ││
│  └────────────────┘  └────────────────┘  └────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App
└── CommandPalette
    ├── Background overlay (onClick → close)
    └── Panel container (max-w-2xl, max-h-60vh)
        └── CommandMenu
            ├── Search box area
            │   ├── Search Icon
            │   ├── Input (cmdk)
            │   ├── Loading Spinner (conditional render)
            │   └── ESC hint
            │
            └── Result list area (cmdk-list)
                ├── CommandLoading (isSearching)
                ├── CommandEmpty (no results)
                └── CommandGroup[] (grouped by plugin)
                    ├── Group Heading (plugin name)
                    └── CommandItem[]
                        ├── Icon
                        ├── Content
                        │   ├── Title (highlighted)
                        │   ├── Subtitle (highlighted)
                        │   └── Description (highlighted)
                        └── Score (dev mode)
```

## State Management Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    useCommandMenu Store                      │
│                                                              │
│  State:                                                      │
│  ├── isOpen: boolean                                         │
│  ├── query: string                                           │
│  ├── results: SearchPluginResult[]                           │
│  ├── isSearching: boolean                                    │
│  └── selectedIndex: number                                   │
│                                                              │
│  Actions:                                                    │
│  ├── open()                                                  │
│  ├── close()                                                 │
│  ├── toggle()                                                │
│  ├── setQuery(query)                                         │
│  ├── setResults(results)                                     │
│  ├── setIsSearching(isSearching)                             │
│  ├── setSelectedIndex(index)                                 │
│  └── reset()                                                 │
│                                                              │
│  Side Effects:                                               │
│  ├── Listen for query changes → Debounce search              │
│  ├── Listen for isOpen changes → Clear state                 │
│  └── Cancel unfinished search requests                       │
└─────────────────────────────────────────────────────────────┘
```

## Cache Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LRU Cache                               │
│                                                              │
│  Map<string, CacheEntry>                                     │
│  ├── "message-search:auth" → { results: [...], ts: ... }    │
│  ├── "project-search:auth" → { results: [...], ts: ... }    │
│  ├── "session-search:auth" → { results: [...], ts: ... }    │
│  └── ...                                                     │
│                                                              │
│  Configuration:                                              │
│  ├── Max entries: 100                                        │
│  ├── TTL: 5 minutes                                          │
│  └── Eviction policy: LRU (Least Recently Used)              │
│                                                              │
│  Operations:                                                 │
│  ├── get(query) → results | null                             │
│  │   ├── Check if exists                                     │
│  │   ├── Check if expired                                     │
│  │   └── Return result or null                               │
│  │                                                            │
│  ├── set(query, results)                                     │
│  │   ├── Check if cache is full                              │
│  │   ├── If full, delete oldest entry                        │
│  │   └── Add new entry                                       │
│  │                                                            │
│  └── clear()                                                 │
│      └── Clear all cache                                     │
└─────────────────────────────────────────────────────────────┘
```

---

*Architecture Diagrams Generated: 2026-01-31*

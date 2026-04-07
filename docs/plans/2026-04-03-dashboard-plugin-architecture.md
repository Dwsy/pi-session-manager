# Dashboard 插件化多模态架构实施计划

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** 重构 Dashboard 为插件化架构，支持多预设模式 + 多自定义模式 + 切换分享功能

**Architecture:**
- 采用 **Strategy Pattern** 管理不同布局模式
- 使用 **Registry Pattern** 管理插件
- 基于 **react-grid-layout** 实现可拖拽网格
- 配置采用 **Layered Storage** 分层存储

**Tech Stack:** React + TypeScript + react-grid-layout + Zustand（状态管理）

---

## 核心概念定义

```typescript
// 模式类型
enum LayoutModeType {
  PRESET = 'preset',      // 内置预设
  CUSTOM = 'custom',      // 用户自定义
}

// 模式定义
interface LayoutMode {
  id: string;                    // 唯一标识
  type: LayoutModeType;          // 类型
  name: string;                  // 显示名称
  description?: string;          // 描述
  icon?: string;                 // 图标
  layout: LayoutConfig;          // 布局配置
  filters?: FilterConfig;        // 筛选状态
  isDefault?: boolean;           // 是否默认
  createdAt?: number;            // 创建时间
  updatedAt?: number;            // 更新时间
}

// 布局配置
interface LayoutConfig {
  items: LayoutItem[];           // 组件列表
  cols: number;                  // 列数
  rowHeight: number;             // 行高
  margin: [number, number];      // 间距
}

// 组件实例
interface LayoutItem {
  i: string;                     // 实例 ID
  pluginId: string;              // 插件 ID
  x: number; y: number;          // 位置
  w: number; h: number;          // 尺寸
  minW?: number; minH?: number;  // 最小尺寸
  config?: WidgetConfig;         // 组件配置
}
```

---

## 第一阶段：核心基础设施 (MVP)

### Task 1: 创建类型定义文件

**目标:** 建立完整的 TypeScript 类型系统

**Files:**
- Create: `src/dashboard/types/index.ts`
- Create: `src/dashboard/types/plugin.ts`
- Create: `src/dashboard/types/layout.ts`

**代码:**

```typescript
// src/dashboard/types/index.ts
export * from './plugin';
export * from './layout';

// src/dashboard/types/plugin.ts
import type { ComponentType, ReactNode } from 'react';

export interface DashboardPlugin {
  id: string;
  name: string;
  version: string;
  category: 'stats' | 'chart' | 'list' | 'custom';
  icon?: string;
  description?: string;

  // 尺寸默认
  defaultSize: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
  };

  // 渲染
  component: ComponentType<WidgetProps>;
  configPanel?: ComponentType<ConfigPanelProps>;

  // 数据
  dataFetcher?: DataFetcher;

  // 生命周期
  onInit?: (ctx: PluginContext) => void | Promise<void>;
  onMount?: (ctx: PluginContext) => void;
  onUnmount?: (ctx: PluginContext) => void;
}

export interface WidgetProps {
  size: { w: number; h: number };
  config: WidgetConfig;
  data?: any;
  loading?: boolean;
  error?: Error;
  onConfigChange: (config: WidgetConfig) => void;
}

export interface ConfigPanelProps {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}

export type WidgetConfig = Record<string, any>;
export type DataFetcher = (ctx: PluginContext) => Promise<any>;

export interface PluginContext {
  instanceId: string;
  config: WidgetConfig;
  api: HostAPI;
  events: EventEmitter;
}

export interface HostAPI {
  data: {
    getSessionStats: () => Promise<any>;
    getSessions: (filter?: any) => Promise<any[]>;
  };
  actions: {
    openSession: (path: string) => void;
    filterByProject: (project: string) => void;
  };
}

// src/dashboard/types/layout.ts
export interface LayoutMode {
  id: string;
  type: 'preset' | 'custom';
  name: string;
  description?: string;
  icon?: string;
  layout: LayoutConfig;
  filters?: FilterState;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LayoutConfig {
  items: LayoutItem[];
  cols?: number;
  rowHeight?: number;
  margin?: [number, number];
}

export interface LayoutItem {
  i: string;
  pluginId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  config?: WidgetConfig;
  static?: boolean;
}

export interface FilterState {
  project?: string;
  model?: string;
  dateRange?: { start: string; end: string };
}
```

**验证:** 运行 `npx tsc --noEmit` 确保类型无错误

---

### Task 2: 创建插件注册系统

**目标:** 建立插件注册表，支持内置和动态插件

**Files:**
- Create: `src/dashboard/core/PluginRegistry.ts`
- Create: `src/dashboard/core/HostAPI.ts`

**代码:**

```typescript
// src/dashboard/core/PluginRegistry.ts
import type { DashboardPlugin } from '../types';

class PluginRegistry {
  private plugins = new Map<string, DashboardPlugin>();
  private listeners = new Set<() => void>();

  register(plugin: DashboardPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin ${plugin.id} already registered`);
    }
    this.plugins.set(plugin.id, plugin);
    this.notify();
  }

  unregister(id: string): boolean {
    const result = this.plugins.delete(id);
    if (result) this.notify();
    return result;
  }

  get(id: string): DashboardPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): DashboardPlugin[] {
    return Array.from(this.plugins.values());
  }

  getByCategory(category: string): DashboardPlugin[] {
    return this.getAll().filter(p => p.category === category);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const pluginRegistry = new PluginRegistry();

// src/dashboard/core/HostAPI.ts
import { invoke } from '../../transport';
import type { HostAPI } from '../types';

export function createHostAPI(): HostAPI {
  return {
    data: {
      getSessionStats: () => invoke('get_session_stats_light', {}),
      getSessions: (filter) => invoke('get_sessions', { filter }),
    },
    actions: {
      openSession: (path) => {
        // 实现打开会话逻辑
      },
      filterByProject: (project) => {
        // 实现项目筛选逻辑
      },
    },
  };
}
```

**验证:** 创建一个测试文件 `src/dashboard/__tests__/PluginRegistry.test.ts` 测试注册/获取功能

---

### Task 3: 创建内置插件

**目标:** 将现有 Dashboard 组件转换为插件

**Files:**
- Create: `src/dashboard/plugins/builtin/StatCardPlugin.tsx`
- Create: `src/dashboard/plugins/builtin/ActivityHeatmapPlugin.tsx`
- Create: `src/dashboard/plugins/builtin/index.ts`

**代码:**

```typescript
// src/dashboard/plugins/builtin/StatCardPlugin.tsx
import { BarChart3, Activity, Clock, Zap, DollarSign } from 'lucide-react';
import type { DashboardPlugin, WidgetProps } from '../../types';
import StatCard from '../../../components/dashboard/StatCard';

const iconMap: Record<string, React.ComponentType> = {
  BarChart3, Activity, Clock, Zap, DollarSign,
};

const StatCardWidget: React.FC<WidgetProps> = ({ config, data }) => {
  const Icon = iconMap[config.icon] || BarChart3;

  return (
    <StatCard
      icon={Icon}
      label={config.label}
      value={data?.[config.metric] || 0}
      color={config.color}
    />
  );
};

export const StatCardPlugin: DashboardPlugin = {
  id: 'stat-card',
  name: '统计卡片',
  version: '1.0.0',
  category: 'stats',
  icon: 'BarChart3',
  defaultSize: { w: 2, h: 2, minW: 2, minH: 2 },

  component: StatCardWidget,

  dataFetcher: async (ctx) => {
    return ctx.api.data.getSessionStats();
  },
};

// src/dashboard/plugins/builtin/ActivityHeatmapPlugin.tsx
import type { DashboardPlugin } from '../../types';
import ActivityHeatmap from '../../../components/dashboard/ActivityHeatmap';

export const ActivityHeatmapPlugin: DashboardPlugin = {
  id: 'activity-heatmap',
  name: '活动热力图',
  version: '1.0.0',
  category: 'chart',
  icon: 'Calendar',
  defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },

  component: ActivityHeatmap,

  dataFetcher: async (ctx) => {
    const stats = await ctx.api.data.getSessionStats();
    return stats.heatmap_data;
  },
};

// src/dashboard/plugins/builtin/index.ts
import { StatCardPlugin } from './StatCardPlugin';
import { ActivityHeatmapPlugin } from './ActivityHeatmapPlugin';
// ... 其他插件

export const BUILTIN_PLUGINS = [
  StatCardPlugin,
  ActivityHeatmapPlugin,
  // ...
];

export function registerBuiltinPlugins(registry: typeof pluginRegistry) {
  BUILTIN_PLUGINS.forEach(plugin => registry.register(plugin));
}
```

**验证:** 确保所有现有组件都能正常转换为插件

---

### Task 4: 创建布局状态管理

**目标:** 使用 Zustand 管理布局模式状态

**Files:**
- Create: `src/dashboard/store/layoutStore.ts`

**代码:**

```typescript
// src/dashboard/store/layoutStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LayoutMode, LayoutConfig, FilterState } from '../types';

interface LayoutStore {
  // 当前状态
  modes: LayoutMode[];
  currentModeId: string | null;
  isEditing: boolean;

  // 操作
  setCurrentMode: (id: string) => void;
  addMode: (mode: Omit<LayoutMode, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateMode: (id: string, updates: Partial<LayoutMode>) => void;
  deleteMode: (id: string) => void;
  duplicateMode: (id: string, newName: string) => string;

  // 布局编辑
  updateLayout: (id: string, layout: LayoutConfig) => void;
  addWidget: (modeId: string, pluginId: string) => void;
  removeWidget: (modeId: string, widgetId: string) => void;
  updateWidget: (modeId: string, widgetId: string, config: any) => void;

  // 导入导出
  exportMode: (id: string) => string;
  importMode: (json: string) => string;

  // 初始化
  initializeModes: () => void;
}

const PRESET_MODES: LayoutMode[] = [
  {
    id: 'preset-overview',
    type: 'preset',
    name: '概览',
    description: '核心指标一览',
    icon: 'LayoutDashboard',
    layout: {
      items: [
        { i: 's1', pluginId: 'stat-card', x: 0, y: 0, w: 2, h: 2, config: { metric: 'total_sessions', label: '总会话', color: '#569cd6' } },
        { i: 's2', pluginId: 'stat-card', x: 2, y: 0, w: 2, h: 2, config: { metric: 'total_messages', label: '总消息', color: '#7ee787' } },
        { i: 's3', pluginId: 'stat-card', x: 4, y: 0, w: 2, h: 2, config: { metric: 'total_tokens', label: '总 Token', color: '#c792ea' } },
        { i: 's4', pluginId: 'stat-card', x: 6, y: 0, w: 2, h: 2, config: { metric: 'total_cost', label: '总成本', color: '#ff6b6b' } },
        { i: 'heatmap', pluginId: 'activity-heatmap', x: 0, y: 2, w: 8, h: 4 },
        { i: 'recent', pluginId: 'recent-sessions', x: 8, y: 0, w: 4, h: 6 },
      ],
      cols: 12,
      rowHeight: 60,
      margin: [16, 16],
    },
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'preset-analytics',
    type: 'preset',
    name: '分析',
    description: '详细数据分析',
    icon: 'BarChart3',
    layout: {
      items: [
        { i: 'trend', pluginId: 'token-trend', x: 0, y: 0, w: 8, h: 4 },
        { i: 'models', pluginId: 'top-models', x: 8, y: 0, w: 4, h: 4 },
        { i: 'dist', pluginId: 'message-distribution', x: 0, y: 4, w: 6, h: 4 },
        { i: 'projects', pluginId: 'projects-chart', x: 6, y: 4, w: 6, h: 4 },
      ],
      cols: 12,
      rowHeight: 60,
      margin: [16, 16],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      modes: [],
      currentModeId: null,
      isEditing: false,

      initializeModes: () => {
        const { modes } = get();
        if (modes.length === 0) {
          set({
            modes: PRESET_MODES,
            currentModeId: PRESET_MODES[0].id,
          });
        }
      },

      setCurrentMode: (id) => set({ currentModeId: id }),

      addMode: (mode) => {
        const id = `custom-${Date.now()}`;
        const newMode: LayoutMode = {
          ...mode,
          id,
          type: 'custom',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set(state => ({ modes: [...state.modes, newMode] }));
        return id;
      },

      updateMode: (id, updates) => {
        set(state => ({
          modes: state.modes.map(m =>
            m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
          ),
        }));
      },

      deleteMode: (id) => {
        set(state => ({
          modes: state.modes.filter(m => m.id !== id),
          currentModeId: state.currentModeId === id
            ? state.modes[0]?.id || null
            : state.currentModeId,
        }));
      },

      duplicateMode: (id, newName) => {
        const mode = get().modes.find(m => m.id === id);
        if (!mode) throw new Error('Mode not found');

        return get().addMode({
          ...mode,
          name: newName,
          layout: { ...mode.layout },
        });
      },

      updateLayout: (id, layout) => {
        get().updateMode(id, { layout });
      },

      addWidget: (modeId, pluginId) => {
        const mode = get().modes.find(m => m.id === modeId);
        if (!mode) return;

        const newItem = {
          i: `${pluginId}-${Date.now()}`,
          pluginId,
          x: 0,
          y: Infinity,
          w: 4,
          h: 4,
        };

        get().updateMode(modeId, {
          layout: {
            ...mode.layout,
            items: [...mode.layout.items, newItem],
          },
        });
      },

      removeWidget: (modeId, widgetId) => {
        const mode = get().modes.find(m => m.id === modeId);
        if (!mode) return;

        get().updateMode(modeId, {
          layout: {
            ...mode.layout,
            items: mode.layout.items.filter(i => i.i !== widgetId),
          },
        });
      },

      updateWidget: (modeId, widgetId, config) => {
        const mode = get().modes.find(m => m.id === modeId);
        if (!mode) return;

        get().updateMode(modeId, {
          layout: {
            ...mode.layout,
            items: mode.layout.items.map(i =>
              i.i === widgetId ? { ...i, config: { ...i.config, ...config } } : i
            ),
          },
        });
      },

      exportMode: (id) => {
        const mode = get().modes.find(m => m.id === id);
        if (!mode) throw new Error('Mode not found');
        return JSON.stringify(mode, null, 2);
      },

      importMode: (json) => {
        const mode = JSON.parse(json);
        mode.id = `custom-${Date.now()}`;
        mode.type = 'custom';
        mode.createdAt = Date.now();
        mode.updatedAt = Date.now();
        set(state => ({ modes: [...state.modes, mode] }));
        return mode.id;
      },
    }),
    {
      name: 'dashboard-layouts',
      version: 1,
    }
  )
);
```

**验证:** 测试 store 的所有方法

---

## 第二阶段：核心组件开发

### Task 5: 创建 WidgetShell 组件

**目标:** 统一的卡片外壳，支持拖拽手柄、配置按钮、删除

**Files:**
- Create: `src/dashboard/components/WidgetShell.tsx`

**代码:**

```typescript
// src/dashboard/components/WidgetShell.tsx
import { GripVertical, Settings, X } from 'lucide-react';

interface WidgetShellProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  editable?: boolean;
  onRemove?: () => void;
  onConfigClick?: () => void;
  dragHandleClass?: string;
}

export function WidgetShell({
  title,
  icon,
  children,
  editable = false,
  onRemove,
  onConfigClick,
  dragHandleClass = 'widget-drag-handle',
}: WidgetShellProps) {
  return (
    <div className="h-full flex flex-col glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/5">
        <div className={`flex items-center gap-2 ${editable ? dragHandleClass : ''} cursor-${editable ? 'move' : 'default'}`}>
          {editable && <GripVertical className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-medium truncate">{title}</span>
        </div>

        {editable && (
          <div className="flex items-center gap-1">
            {onConfigClick && (
              <button
                onClick={onConfigClick}
                className="p-1 rounded hover:bg-foreground/10 transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={onRemove}
                className="p-1 rounded hover:bg-red-500/20 transition-colors"
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}
```

---

### Task 6: 创建 DashboardEngine 核心组件

**目标:** 渲染网格布局，处理拖拽和调整大小

**Files:**
- Create: `src/dashboard/core/DashboardEngine.tsx`

**代码:**

```typescript
// src/dashboard/core/DashboardEngine.tsx
import { useEffect, useState, useCallback } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import { useLayoutStore } from '../store/layoutStore';
import { pluginRegistry } from './PluginRegistry';
import { WidgetShell } from '../components/WidgetShell';
import type { LayoutMode } from '../types';

const ResponsiveGridLayout = WidthProvider(Responsive);

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface DashboardEngineProps {
  mode: LayoutMode;
  editable?: boolean;
}

export function DashboardEngine({ mode, editable = false }: DashboardEngineProps) {
  const [mounted, setMounted] = useState(false);
  const updateLayout = useLayoutStore(s => s.updateLayout);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLayoutChange = useCallback((currentLayout: Layout[]) => {
    const newItems = mode.layout.items.map(item => {
      const layoutItem = currentLayout.find(l => l.i === item.i);
      return layoutItem ? { ...item, ...layoutItem } : item;
    });

    updateLayout(mode.id, {
      ...mode.layout,
      items: newItems,
    });
  }, [mode, updateLayout]);

  if (!mounted) {
    return <div className="h-full flex items-center justify-center">Loading...</div>;
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: mode.layout.items }}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={mode.layout.rowHeight || 60}
      margin={mode.layout.margin || [16, 16]}
      isDraggable={editable}
      isResizable={editable}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".widget-drag-handle"
    >
      {mode.layout.items.map(item => (
        <div key={item.i}>
          <WidgetRenderer item={item} editable={editable} modeId={mode.id} />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}

function WidgetRenderer({
  item,
  editable,
  modeId
}: {
  item: any;
  editable: boolean;
  modeId: string;
}) {
  const plugin = pluginRegistry.get(item.pluginId);
  const removeWidget = useLayoutStore(s => s.removeWidget);
  const updateWidget = useLayoutStore(s => s.updateWidget);
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!plugin?.dataFetcher) return;

    setLoading(true);
    plugin.dataFetcher({} as any)
      .then(setData)
      .finally(() => setLoading(false));
  }, [plugin]);

  if (!plugin) {
    return (
      <WidgetShell title="未知组件" editable={editable}>
        <div className="text-red-500">Plugin {item.pluginId} not found</div>
      </WidgetShell>
    );
  }

  const WidgetComponent = plugin.component;

  return (
    <WidgetShell
      title={item.config?.title || plugin.name}
      editable={editable}
      onRemove={() => removeWidget(modeId, item.i)}
      onConfigClick={() => {/* 打开配置面板 */}}
    >
      <WidgetComponent
        size={{ w: item.w, h: item.h }}
        config={item.config || {}}
        data={data}
        loading={loading}
        onConfigChange={(config) => updateWidget(modeId, item.i, config)}
      />
    </WidgetShell>
  );
}
```

---

### Task 7: 创建 ModeSwitcher 组件

**目标:** 模式切换器，支持预设和自定义模式

**Files:**
- Create: `src/dashboard/components/ModeSwitcher.tsx`

**代码:**

```typescript
// src/dashboard/components/ModeSwitcher.tsx
import { useState } from 'react';
import { ChevronDown, Plus, Download, Upload, Copy, Trash2 } from 'lucide-react';
import { useLayoutStore } from '../store/layoutStore';
import type { LayoutMode } from '../types';

export function ModeSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const modes = useLayoutStore(s => s.modes);
  const currentModeId = useLayoutStore(s => s.currentModeId);
  const setCurrentMode = useLayoutStore(s => s.setCurrentMode);
  const duplicateMode = useLayoutStore(s => s.duplicateMode);
  const deleteMode = useLayoutStore(s => s.deleteMode);
  const exportMode = useLayoutStore(s => s.exportMode);
  const importMode = useLayoutStore(s => s.importMode);

  const currentMode = modes.find(m => m.id === currentModeId);
  const presetModes = modes.filter(m => m.type === 'preset');
  const customModes = modes.filter(m => m.type === 'custom');

  const handleExport = (mode: LayoutMode) => {
    const json = exportMode(mode.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-mode-${mode.name}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      importMode(text);
    };
    input.click();
  };

  return (
    <div className="relative">
      {/* 当前模式显示 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 glass-card rounded-lg hover:bg-foreground/5 transition-colors"
      >
        <span className="font-medium">{currentMode?.name || '选择模式'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 glass-card rounded-xl shadow-xl z-50">
          {/* 预设模式 */}
          <div className="p-2">
            <div className="text-xs text-muted-foreground px-2 py-1">预设</div>
            {presetModes.map(mode => (
              <ModeItem
                key={mode.id}
                mode={mode}
                isActive={mode.id === currentModeId}
                onClick={() => {
                  setCurrentMode(mode.id);
                  setIsOpen(false);
                }}
              />
            ))}
          </div>

          {/* 分隔线 */}
          {customModes.length > 0 && (
            <div className="border-t border-foreground/10" />
          )}

          {/* 自定义模式 */}
          {customModes.length > 0 && (
            <div className="p-2">
              <div className="text-xs text-muted-foreground px-2 py-1">自定义</div>
              {customModes.map(mode => (
                <ModeItem
                  key={mode.id}
                  mode={mode}
                  isActive={mode.id === currentModeId}
                  onClick={() => {
                    setCurrentMode(mode.id);
                    setIsOpen(false);
                  }}
                  onDuplicate={() => duplicateMode(mode.id, `${mode.name} 副本`)}
                  onExport={() => handleExport(mode)}
                  onDelete={() => deleteMode(mode.id)}
                />
              ))}
            </div>
          )}

          {/* 底部操作 */}
          <div className="border-t border-foreground/10 p-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-foreground/5 text-sm"
            >
              <Plus className="w-4 h-4" />
              新建模式
            </button>
            <button
              onClick={handleImport}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-foreground/5 text-sm"
            >
              <Upload className="w-4 h-4" />
              导入模式
            </button>
          </div>
        </div>
      )}

      {/* 创建模式弹窗 */}
      {showCreateModal && (
        <CreateModeModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function ModeItem({
  mode,
  isActive,
  onClick,
  onDuplicate,
  onExport,
  onDelete,
}: {
  mode: LayoutMode;
  isActive: boolean;
  onClick: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm ${
          isActive ? 'bg-primary/20 text-primary' : 'hover:bg-foreground/5'
        }`}
      >
        <span>{mode.name}</span>
        {isActive && <span className="w-2 h-2 rounded-full bg-primary" />}
      </button>

      {/* 自定义模式的额外操作 */}
      {mode.type === 'custom' && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate?.();
            }}
            className="p-1 rounded hover:bg-foreground/10"
            title="复制"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExport?.();
            }}
            className="p-1 rounded hover:bg-foreground/10"
            title="导出"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="p-1 rounded hover:bg-red-500/20 text-red-500"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function CreateModeModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [baseMode, setBaseMode] = useState('empty');
  const addMode = useLayoutStore(s => s.addMode);
  const modes = useLayoutStore(s => s.modes);

  const handleCreate = () => {
    const base = baseMode === 'empty' ? null : modes.find(m => m.id === baseMode);

    addMode({
      name,
      description: '',
      layout: base ? { ...base.layout } : { items: [], cols: 12, rowHeight: 60, margin: [16, 16] },
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass-card rounded-xl p-6 w-96">
        <h3 className="text-lg font-bold mb-4">新建模式</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background/50 rounded-lg border border-foreground/10"
              placeholder="例如：我的概览"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">基于</label>
            <select
              value={baseMode}
              onChange={(e) => setBaseMode(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background/50 rounded-lg border border-foreground/10"
            >
              <option value="empty">空白模式</option>
              {modes.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg hover:bg-foreground/5"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!name}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 8: 创建编辑工具栏

**目标:** 添加组件、保存布局、切换编辑模式

**Files:**
- Create: `src/dashboard/components/EditToolbar.tsx`

**代码:**

```typescript
// src/dashboard/components/EditToolbar.tsx
import { useState } from 'react';
import { Plus, Save, Edit2, Check, Grid3X3 } from 'lucide-react';
import { useLayoutStore } from '../store/layoutStore';
import { pluginRegistry } from '../core/PluginRegistry';

interface EditToolbarProps {
  modeId: string;
}

export function EditToolbar({ modeId }: EditToolbarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const addWidget = useLayoutStore(s => s.addWidget);
  const plugins = pluginRegistry.getAll();

  return (
    <div className="flex items-center gap-2 mb-4">
      {/* 编辑开关 */}
      <button
        onClick={() => setIsEditing(!isEditing)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          isEditing ? 'bg-primary text-primary-foreground' : 'glass-card hover:bg-foreground/5'
        }`}
      >
        {isEditing ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
        {isEditing ? '完成' : '编辑'}
      </button>

      {isEditing && (
        <>
          {/* 添加组件 */}
          <div className="relative">
            <button
              onClick={() => setShowAddPanel(!showAddPanel)}
              className="flex items-center gap-2 px-3 py-2 glass-card rounded-lg hover:bg-foreground/5"
            >
              <Plus className="w-4 h-4" />
              添加组件
            </button>

            {showAddPanel && (
              <div className="absolute top-full left-0 mt-2 w-56 glass-card rounded-xl shadow-xl z-50 max-h-80 overflow-auto">
                <div className="p-2">
                  {plugins.map(plugin => (
                    <button
                      key={plugin.id}
                      onClick={() => {
                        addWidget(modeId, plugin.id);
                        setShowAddPanel(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-foreground/5 text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        {/* 图标 */}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{plugin.name}</div>
                        <div className="text-xs text-muted-foreground">{plugin.category}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 提示文字 */}
          <span className="text-xs text-muted-foreground">
            拖拽调整位置，拖动边缘调整大小
          </span>
        </>
      )}
    </div>
  );
}
```

---

## 第三阶段：整合与优化

### Task 9: 创建 Dashboard 主容器

**目标:** 整合所有组件，替换现有 Dashboard

**Files:**
- Create: `src/dashboard/DashboardContainer.tsx`

**代码:**

```typescript
// src/dashboard/DashboardContainer.tsx
import { useEffect } from 'react';
import { useLayoutStore } from './store/layoutStore';
import { DashboardEngine } from './core/DashboardEngine';
import { ModeSwitcher } from './components/ModeSwitcher';
import { EditToolbar } from './components/EditToolbar';
import { registerBuiltinPlugins } from './plugins/builtin';
import { pluginRegistry } from './core/PluginRegistry';

interface DashboardContainerProps {
  sessions: any[];
  onSessionSelect?: (session: any) => void;
  onProjectSelect?: (project: string) => void;
}

export function DashboardContainer({
  sessions,
  onSessionSelect,
  onProjectSelect,
}: DashboardContainerProps) {
  // 初始化
  useEffect(() => {
    registerBuiltinPlugins(pluginRegistry);
    useLayoutStore.getState().initializeModes();
  }, []);

  const modes = useLayoutStore(s => s.modes);
  const currentModeId = useLayoutStore(s => s.currentModeId);
  const isEditing = useLayoutStore(s => s.isEditing);

  const currentMode = modes.find(m => m.id === currentModeId);

  if (!currentMode) {
    return <div className="h-full flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
        <ModeSwitcher />
        <EditToolbar modeId={currentMode.id} />
      </div>

      {/* 网格区域 */}
      <div className="flex-1 overflow-auto p-4">
        <DashboardEngine
          mode={currentMode}
          editable={isEditing}
        />
      </div>
    </div>
  );
}
```

---

### Task 10: 修改 App.tsx 集成

**目标:** 替换现有 Dashboard 引用

**Files:**
- Modify: `src/App.tsx`

**修改内容:**

```typescript
// 找到 Dashboard 导入，改为：
import { DashboardContainer } from './dashboard/DashboardContainer';

// 找到 Dashboard 使用处，改为：
<DashboardContainer
  sessions={sessions}
  onSessionSelect={handleSessionSelect}
  onProjectSelect={handleProjectSelect}
/>
```

---

## 第四阶段：测试与完善

### Task 11: 编写单元测试

**Files:**
- Create: `src/dashboard/__tests__/layoutStore.test.ts`
- Create: `src/dashboard/__tests__/PluginRegistry.test.ts`

**测试内容:**
- store 的增删改查
- 导入导出功能
- 插件注册/获取

### Task 12: 端到端测试

**测试场景:**
1. 切换预设模式
2. 创建自定义模式
3. 添加/删除组件
4. 拖拽调整布局
5. 导入导出模式

### Task 13: 性能优化

**优化点:**
1. 组件懒加载
2. 数据缓存
3. 虚拟滚动（如果组件很多）

---

## 数据流图

```
┌─────────────────────────────────────────────────────────────┐
│                      DashboardContainer                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ ModeSwitcher │  │ EditToolbar  │  │ DashboardEngine  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    useLayoutStore (Zustand)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  modes   │  │currentId │  │isEditing │  │ actions  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└───────────────────────────┬─────────────────────────────────┘
                            │ persist (localStorage)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     PluginRegistry                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Map<pluginId, DashboardPlugin>                       │  │
│  │  ├─ stat-card                                         │  │
│  │  ├─ activity-heatmap                                  │  │
│  │  ├─ token-trend                                       │  │
│  │  └─ ...                                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 风险与应对

| 风险 | 影响 | 应对策略 |
|-----|------|---------|
| react-grid-layout 与现有样式冲突 | 中 | 使用 CSS Module 隔离样式 |
| 存储格式版本兼容性 | 中 | 使用 zustand persist 的 version 机制 |
| 大量组件渲染性能 | 高 | 实施虚拟滚动和懒加载 |
| 拖拽体验不流畅 | 中 | 使用 transform 代替 top/left |

---

## 里程碑

- **Week 1:** 完成 Task 1-4 (基础设施)
- **Week 2:** 完成 Task 5-8 (核心组件)
- **Week 3:** 完成 Task 9-11 (整合与测试)
- **Week 4:** 完成 Task 12-13 (优化)

---

**Plan saved to:** `docs/plans/2026-04-03-dashboard-plugin-architecture.md`

---

## 执行选项

主人~ 计划完成啦！(ฅ'ω'ฅ)✨ 有两个执行方式可以选择：

**1. Subagent-Driven（推荐）**
- 在当前会话中执行
- 我派遣子代理逐个完成任务
- 每完成一个 Task 我进行代码审查
- 适合需要频繁调整的场景

**2. Parallel Session（独立会话）**
- 新开一个会话专门执行
- 使用 `executing-plans` skill 批量执行
- 适合一次性完成大量任务

主人想用哪种方式呢？喵呜~ 🐾

另外，计划中有几个设计决策需要主人确认：

1. **预设模式数量** - 我规划了「概览」「分析」两个预设，需要增加吗？
2. **分享方式** - MVP 阶段先做本地 JSON 导出，后续再加在线分享？
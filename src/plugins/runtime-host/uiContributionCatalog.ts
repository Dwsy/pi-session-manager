import type {
  PsmAppSidebarViewRegistration,
  PsmAppViewRegistration,
  PsmProjectListActionRegistration,
  PsmSessionContextMenuActionRegistration,
  PsmSessionListActionRegistration,
  PsmSessionListColumnRegistration,
  PsmSessionMainViewRegistration,
  PsmSessionPanelRegistration,
  PsmSessionToolbarItemRegistration,
  PsmSessionTreeViewRegistration,
} from '@pi-session-manager/plugin-sdk'

import type {
  PsmAppSidebarViewRuntimeRegistration,
  PsmAppViewRuntimeRegistration,
  PsmPluginSessionUiSnapshot,
  PsmProjectListActionRuntimeRegistration,
  PsmSessionContextMenuActionRuntimeRegistration,
  PsmSessionListActionRuntimeRegistration,
  PsmSessionListColumnRuntimeRegistration,
  PsmSessionMainViewRuntimeRegistration,
  PsmSessionPanelRuntimeRegistration,
  PsmSessionToolbarItemRuntimeRegistration,
  PsmSessionTreeViewRuntimeRegistration,
} from './types'

const DEFAULT_COLUMN_ORDER = 100

export interface PsmUiContributionRegistrationResult {
  registered: boolean
  duplicateMessage?: string
}

export interface PsmPluginUiContributionIds {
  appViews: string[]
  appSidebarViews: string[]
}

function sortedValues<T extends { id: string }>(entries: Map<string, T>): T[] {
  return Array.from(entries.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function removeOwned<T extends { pluginId: string }>(entries: Map<string, T>, pluginId: string) {
  for (const [id, entry] of entries) {
    if (entry.pluginId === pluginId) entries.delete(id)
  }
}

function ownedIds<T extends { id: string; pluginId: string }>(entries: Map<string, T>, pluginId: string) {
  return sortedValues(entries)
    .filter((entry) => entry.pluginId === pluginId)
    .map((entry) => entry.id)
}

export class PsmPluginUiContributionCatalog {
  private readonly appViews = new Map<string, PsmAppViewRuntimeRegistration>()
  private readonly appSidebarViews = new Map<string, PsmAppSidebarViewRuntimeRegistration>()
  private readonly sessionListActions = new Map<string, PsmSessionListActionRuntimeRegistration>()
  private readonly sessionListColumns = new Map<string, PsmSessionListColumnRuntimeRegistration>()
  private readonly projectListActions = new Map<string, PsmProjectListActionRuntimeRegistration>()
  private readonly sessionContextMenuActions = new Map<string, PsmSessionContextMenuActionRuntimeRegistration>()
  private readonly sessionToolbarItems = new Map<string, PsmSessionToolbarItemRuntimeRegistration>()
  private readonly sessionPanels = new Map<string, PsmSessionPanelRuntimeRegistration>()
  private readonly sessionTreeViews = new Map<string, PsmSessionTreeViewRuntimeRegistration>()
  private readonly sessionMainViews = new Map<string, PsmSessionMainViewRuntimeRegistration>()

  registerAppView(pluginId: string, view: PsmAppViewRegistration): PsmUiContributionRegistrationResult {
    if (this.appViews.has(view.id)) {
      return { registered: false, duplicateMessage: `App view already registered: ${view.id}` }
    }
    this.appViews.set(view.id, { ...view, pluginId })
    return { registered: true }
  }

  registerAppSidebarView(
    pluginId: string,
    view: PsmAppSidebarViewRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.appSidebarViews.has(view.id)) {
      return { registered: false, duplicateMessage: `App sidebar view already registered: ${view.id}` }
    }
    this.appSidebarViews.set(view.id, { ...view, pluginId })
    return { registered: true }
  }

  registerSessionListAction(
    pluginId: string,
    action: PsmSessionListActionRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionListActions.has(action.id)) return { registered: false }
    this.sessionListActions.set(action.id, { ...action, pluginId })
    return { registered: true }
  }

  registerSessionListColumn(
    pluginId: string,
    column: PsmSessionListColumnRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionListColumns.has(column.id)) {
      return { registered: false, duplicateMessage: `Session list column already registered: ${column.id}` }
    }
    this.sessionListColumns.set(column.id, { ...column, pluginId, order: column.order ?? DEFAULT_COLUMN_ORDER })
    return { registered: true }
  }

  registerProjectListAction(
    pluginId: string,
    action: PsmProjectListActionRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.projectListActions.has(action.id)) return { registered: false }
    this.projectListActions.set(action.id, { ...action, pluginId })
    return { registered: true }
  }

  registerSessionContextMenuAction(
    pluginId: string,
    action: PsmSessionContextMenuActionRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionContextMenuActions.has(action.id)) return { registered: false }
    this.sessionContextMenuActions.set(action.id, { ...action, pluginId })
    return { registered: true }
  }

  registerSessionToolbarItem(
    pluginId: string,
    item: PsmSessionToolbarItemRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionToolbarItems.has(item.id)) {
      return { registered: false, duplicateMessage: `Session toolbar item already registered: ${item.id}` }
    }
    this.sessionToolbarItems.set(item.id, { ...item, pluginId })
    return { registered: true }
  }

  registerSessionPanel(
    pluginId: string,
    panel: PsmSessionPanelRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionPanels.has(panel.id)) {
      return { registered: false, duplicateMessage: `Session panel already registered: ${panel.id}` }
    }
    this.sessionPanels.set(panel.id, { ...panel, pluginId, side: panel.side ?? 'right' })
    return { registered: true }
  }

  registerSessionTreeView(
    pluginId: string,
    view: PsmSessionTreeViewRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionTreeViews.has(view.id)) {
      return { registered: false, duplicateMessage: `Session tree view already registered: ${view.id}` }
    }
    this.sessionTreeViews.set(view.id, { ...view, pluginId })
    return { registered: true }
  }

  registerSessionMainView(
    pluginId: string,
    view: PsmSessionMainViewRegistration,
  ): PsmUiContributionRegistrationResult {
    if (this.sessionMainViews.has(view.id)) {
      return { registered: false, duplicateMessage: `Session main view already registered: ${view.id}` }
    }
    this.sessionMainViews.set(view.id, { ...view, pluginId })
    return { registered: true }
  }

  listAppViews(): PsmAppViewRuntimeRegistration[] {
    return sortedValues(this.appViews)
  }

  listAppSidebarViews(): PsmAppSidebarViewRuntimeRegistration[] {
    return sortedValues(this.appSidebarViews)
  }

  listSessionListActions(): PsmSessionListActionRuntimeRegistration[] {
    return sortedValues(this.sessionListActions)
  }

  listSessionListColumns(): PsmSessionListColumnRuntimeRegistration[] {
    return sortedValues(this.sessionListColumns).sort(
      (a, b) => (a.order ?? DEFAULT_COLUMN_ORDER) - (b.order ?? DEFAULT_COLUMN_ORDER),
    )
  }

  listProjectListActions(): PsmProjectListActionRuntimeRegistration[] {
    return sortedValues(this.projectListActions)
  }

  listSessionContextMenuActions(): PsmSessionContextMenuActionRuntimeRegistration[] {
    return sortedValues(this.sessionContextMenuActions)
  }

  listSessionToolbarItems(): PsmSessionToolbarItemRuntimeRegistration[] {
    return sortedValues(this.sessionToolbarItems)
  }

  listSessionPanels(): PsmSessionPanelRuntimeRegistration[] {
    return sortedValues(this.sessionPanels)
  }

  listSessionTreeViews(): PsmSessionTreeViewRuntimeRegistration[] {
    return sortedValues(this.sessionTreeViews)
  }

  listSessionMainViews(): PsmSessionMainViewRuntimeRegistration[] {
    return sortedValues(this.sessionMainViews)
  }

  snapshot(ready = true): PsmPluginSessionUiSnapshot {
    return {
      ready,
      appViews: this.listAppViews(),
      appSidebarViews: this.listAppSidebarViews(),
      sessionListActions: this.listSessionListActions(),
      sessionListColumns: this.listSessionListColumns(),
      projectListActions: this.listProjectListActions(),
      sessionContextMenuActions: this.listSessionContextMenuActions(),
      toolbarItems: this.listSessionToolbarItems(),
      panels: this.listSessionPanels(),
      treeViews: this.listSessionTreeViews(),
      mainViews: this.listSessionMainViews(),
    }
  }

  idsForPlugin(pluginId: string): PsmPluginUiContributionIds {
    return {
      appViews: ownedIds(this.appViews, pluginId),
      appSidebarViews: ownedIds(this.appSidebarViews, pluginId),
    }
  }

  removePlugin(pluginId: string) {
    removeOwned(this.appViews, pluginId)
    removeOwned(this.appSidebarViews, pluginId)
    removeOwned(this.sessionListActions, pluginId)
    removeOwned(this.sessionListColumns, pluginId)
    removeOwned(this.projectListActions, pluginId)
    removeOwned(this.sessionContextMenuActions, pluginId)
    removeOwned(this.sessionToolbarItems, pluginId)
    removeOwned(this.sessionPanels, pluginId)
    removeOwned(this.sessionTreeViews, pluginId)
    removeOwned(this.sessionMainViews, pluginId)
  }

  clear() {
    this.appViews.clear()
    this.appSidebarViews.clear()
    this.sessionListActions.clear()
    this.sessionListColumns.clear()
    this.projectListActions.clear()
    this.sessionContextMenuActions.clear()
    this.sessionToolbarItems.clear()
    this.sessionPanels.clear()
    this.sessionTreeViews.clear()
    this.sessionMainViews.clear()
  }
}

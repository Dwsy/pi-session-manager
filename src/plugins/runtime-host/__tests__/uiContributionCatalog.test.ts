import { describe, expect, it } from 'vitest'

import { PsmPluginUiContributionCatalog } from '../uiContributionCatalog'

const render = () => null

describe('PsmPluginUiContributionCatalog', () => {
  it('publishes sorted snapshots and normalizes panel side metadata', () => {
    const catalog = new PsmPluginUiContributionCatalog()

    catalog.registerAppView('plugin.z', { id: 'view.z', title: 'Z', render })
    catalog.registerAppView('plugin.a', { id: 'view.a', title: 'A', render })
    catalog.registerSessionPanel('plugin.z', { id: 'panel.z', title: 'Z', render })
    catalog.registerSessionPanel('plugin.a', {
      id: 'panel.a',
      title: 'A',
      side: 'bottom',
      render,
    })

    expect(catalog.snapshot()).toMatchObject({
      ready: true,
      appViews: [
        { id: 'view.a', pluginId: 'plugin.a' },
        { id: 'view.z', pluginId: 'plugin.z' },
      ],
      panels: [
        { id: 'panel.a', pluginId: 'plugin.a', side: 'bottom' },
        { id: 'panel.z', pluginId: 'plugin.z', side: 'right' },
      ],
    })
  })

  it('orders session list columns by declared order and falls back to a default order', () => {
    const catalog = new PsmPluginUiContributionCatalog()

    catalog.registerSessionListColumn('plugin.a', { id: 'column.default', title: 'Default', render })
    catalog.registerSessionListColumn('plugin.b', { id: 'column.last', title: 'Last', order: 500, render })
    catalog.registerSessionListColumn('plugin.c', { id: 'column.first', title: 'First', order: 10, render })

    expect(catalog.listSessionListColumns()).toMatchObject([
      { id: 'column.first', order: 10 },
      { id: 'column.default', order: 100 },
      { id: 'column.last', order: 500 },
    ])
    expect(
      catalog.registerSessionListColumn('plugin.d', { id: 'column.first', title: 'Duplicate', render }),
    ).toEqual({
      registered: false,
      duplicateMessage: 'Session list column already registered: column.first',
    })
  })

  it('preserves warning and silent duplicate registration semantics', () => {
    const catalog = new PsmPluginUiContributionCatalog()

    expect(
      catalog.registerAppView('plugin.first', {
        id: 'view.shared',
        title: 'First',
        render,
      }),
    ).toEqual({ registered: true })
    expect(
      catalog.registerAppView('plugin.second', {
        id: 'view.shared',
        title: 'Second',
        render,
      }),
    ).toEqual({
      registered: false,
      duplicateMessage: 'App view already registered: view.shared',
    })

    expect(
      catalog.registerSessionListAction('plugin.first', {
        id: 'action.shared',
        title: 'First',
        run: () => undefined,
      }),
    ).toEqual({ registered: true })
    expect(
      catalog.registerSessionListAction('plugin.second', {
        id: 'action.shared',
        title: 'Second',
        run: () => undefined,
      }),
    ).toEqual({ registered: false })
  })

  it('removes every contribution owned by one plugin without touching another', () => {
    const catalog = new PsmPluginUiContributionCatalog()
    const failedPlugin = 'plugin.failed'

    catalog.registerAppView(failedPlugin, { id: 'failed.app', title: 'App', render })
    catalog.registerAppSidebarView(failedPlugin, {
      id: 'failed.sidebar',
      title: 'Sidebar',
      appViewId: 'failed.app',
      render,
    })
    catalog.registerSessionListAction(failedPlugin, {
      id: 'failed.session-list',
      title: 'Session List',
      run: () => undefined,
    })
    catalog.registerSessionListColumn(failedPlugin, {
      id: 'failed.session-column',
      title: 'Session Column',
      render,
    })
    catalog.registerProjectListAction(failedPlugin, {
      id: 'failed.project-list',
      title: 'Project List',
      run: () => undefined,
    })
    catalog.registerSessionContextMenuAction(failedPlugin, {
      id: 'failed.context-menu',
      title: 'Context Menu',
      run: () => undefined,
    })
    catalog.registerSessionToolbarItem(failedPlugin, {
      id: 'failed.toolbar',
      title: 'Toolbar',
      render,
    })
    catalog.registerSessionPanel(failedPlugin, {
      id: 'failed.panel',
      title: 'Panel',
      render,
    })
    catalog.registerSessionTreeView(failedPlugin, {
      id: 'failed.tree',
      title: 'Tree',
      render,
    })
    catalog.registerSessionMainView(failedPlugin, {
      id: 'failed.main',
      title: 'Main',
      render,
    })
    catalog.registerAppView('plugin.healthy', {
      id: 'healthy.app',
      title: 'Healthy',
      render,
    })

    expect(catalog.idsForPlugin(failedPlugin)).toEqual({
      appViews: ['failed.app'],
      appSidebarViews: ['failed.sidebar'],
    })

    catalog.removePlugin(failedPlugin)

    expect(catalog.snapshot()).toEqual({
      ready: true,
      appViews: [expect.objectContaining({ id: 'healthy.app', pluginId: 'plugin.healthy' })],
      appSidebarViews: [],
      sessionListActions: [],
      sessionListColumns: [],
      projectListActions: [],
      sessionContextMenuActions: [],
      toolbarItems: [],
      panels: [],
      treeViews: [],
      mainViews: [],
    })

    catalog.clear()
    expect(catalog.snapshot(false)).toEqual({
      ready: false,
      appViews: [],
      appSidebarViews: [],
      sessionListActions: [],
      sessionListColumns: [],
      projectListActions: [],
      sessionContextMenuActions: [],
      toolbarItems: [],
      panels: [],
      treeViews: [],
      mainViews: [],
    })
  })
})

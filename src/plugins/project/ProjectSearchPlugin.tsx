import { FolderOpen } from 'lucide-react'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '../types'

/**
 * Project search plugin
 * Searches project paths
 */
export class ProjectSearchPlugin extends BaseSearchPlugin {
  id = 'project-search'
  icon = FolderOpen
  keywords = ['project', 'folder', 'directory', '项目', '文件夹', '目录']
  priority = 70
  
  get name(): string {
    return this.context?.t('plugins.project.name', '项目搜索') || '项目搜索'
  }
  
  get description(): string {
    return this.context?.t('plugins.project.description', '搜索项目路径') || '搜索项目路径'
  }
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    // Save context for i18n access
    this.setContext(context)
    
    try {
      // Extract project list from sessions
      const projectMap = new Map<string, number>()
      
      context.sessions.forEach(session => {
        const project = session.cwd
        projectMap.set(project, (projectMap.get(project) || 0) + 1)
      })
      
      // Search matching projects
      const results: SearchPluginResult[] = []
      
      for (const [project, count] of projectMap.entries()) {
        const projectName = this.getProjectName(project)
        const score = Math.max(
          this.fuzzyMatch(query, projectName),
          this.fuzzyMatch(query, project) * 0.8
        )
        
        if (score > 0) {
          results.push({
            id: `project-${project}`,
            pluginId: this.id,
            title: projectName,
            subtitle: project,
            description: context.t('project.sessionCount', {
              count,
              defaultValue: `${count} 个会话`
            }),
            icon: <FolderOpen className="w-4 h-4 text-yellow-400" />,
            metadata: {
              project,
              sessionCount: count
            },
            score,
            highlights: [
              ...this.calculateHighlights(query, projectName, 'title'),
              ...this.calculateHighlights(query, project, 'subtitle')
            ]
          })
        }
      }
      
      const finalResults = results.sort((a, b) => b.score - a.score).slice(0, 10)
      return finalResults
    } catch (error) {
      console.error('[ProjectSearchPlugin] Search failed:', error)
      return []
    }
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    // Switch to project view
    const project = result.metadata?.project
    
    if (project) {
      context.setSelectedProject(project)
      context.closeCommandMenu()
    }
  }
  
  /**
   * Get project name (last part of path)
   */
  private getProjectName(path: string): string {
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }
}

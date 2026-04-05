import { FolderOpen } from 'lucide-react'
import { BaseSearchPlugin } from '@/plugins/base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import { getPathBasename } from '@/utils/path'
import { parseQuotedQuery } from '@/utils/search'

/**
 * Project search plugin
 * Searches project paths
 */
export class ProjectSearchPlugin extends BaseSearchPlugin {
  id = 'project-search'
  icon = FolderOpen
  keywords = ['project', 'folder', 'directory', 'project', 'folder', 'directory']
  priority = 70

  get name(): string {
    return this.context?.t('plugins.project.name', 'Project Search') || 'project搜索'
  }

  get description(): string {
    return this.context?.t('plugins.project.description', 'Search project paths') || '搜索project路径'
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
      const parsedQuery = parseQuotedQuery(query)
      const phraseTerms = parsedQuery.phrases.map(phrase => phrase.toLowerCase())
      const remainderTerms = parsedQuery.remainderTokens.map(term => term.toLowerCase())
      const hasPhraseMode = parsedQuery.hasPhrases

      for (const [project, count] of projectMap.entries()) {
        const projectName = this.getProjectName(project)
        const projectLower = project.toLowerCase()
        const projectNameLower = projectName.toLowerCase()

        if (hasPhraseMode) {
          const phrasesMatched = phraseTerms.every(
            phrase => projectNameLower.includes(phrase) || projectLower.includes(phrase)
          )

          if (!phrasesMatched) {
            continue
          }

          const remainderMatched = remainderTerms.every(
            term => this.fuzzyMatch(term, projectName) > 0 || this.fuzzyMatch(term, project) > 0
          )

          if (!remainderMatched) {
            continue
          }
        }

        const score = hasPhraseMode
          ? Math.max(
              ...[...phraseTerms, ...remainderTerms].map(term => Math.max(
                this.fuzzyMatch(term, projectName),
                this.fuzzyMatch(term, project) * 0.8,
              ))
            )
          : Math.max(
              this.fuzzyMatch(query, projectName),
              this.fuzzyMatch(query, project) * 0.8
            )

        if (score > 0) {
          const highlightTerms = hasPhraseMode ? [...phraseTerms, ...remainderTerms] : [query]

          results.push({
            id: `project-${project}`,
            pluginId: this.id,
            title: projectName,
            subtitle: project,
            description: context.t('project.sessionCount', {
              count,
              defaultValue: `${count} sessions`
            }),
            icon: <FolderOpen className="w-4 h-4 text-yellow-400" />,
            metadata: {
              project,
              sessionCount: count
            },
            score,
            highlights: highlightTerms.flatMap(term => [
              ...this.calculateHighlights(term, projectName, 'title'),
              ...this.calculateHighlights(term, project, 'subtitle')
            ])
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
    return getPathBasename(path)
  }
}

import { useState, useMemo } from 'react'
import type { Content } from '@/types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { renderCodeHtml } from '@/utils/markdown'
import { highlightSearchInHTML } from '@/utils/search'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from '@/plugins/tools-render/utils/status'

/** Maximum height for tool output in pixels */
const OUTPUT_MAX_HEIGHT = 450

/**
 * A shell tool and how it presents. Pi's `bash` and `powershell` tools are the same tool with a
 * different shell: both take `{ command }`, both report `exitCode`, and only the prompt and the
 * syntax highlight differ.
 */
interface ShellToolVariant {
  /** Tool name, used as the registry match and as the header title. */
  tool: 'bash' | 'powershell'
  /** Prompt shown in front of the inline command. */
  prompt: string
  /** Shiki language for the command. */
  language: string
  /** Shiki language for the command output. */
  outputLanguage: string
  /** Header class, so each shell can be styled separately. */
  headerClass: string
}

const BASH_VARIANT: ShellToolVariant = {
  tool: 'bash',
  prompt: '$ ',
  language: 'bash',
  outputLanguage: 'shell',
  headerClass: 'tool-header-bash',
}

const POWERSHELL_VARIANT: ShellToolVariant = {
  tool: 'powershell',
  prompt: 'PS> ',
  language: 'powershell',
  outputLanguage: 'powershell',
  headerClass: 'tool-header-powershell',
}

/**
 * Shell tool execution renderer
 * Displays command with exit code and expandable output
 */
function createShellExecution(variant: ShellToolVariant) {
  const { tool, prompt, language, outputLanguage, headerClass } = variant

  return function ShellExecution({ resolvedData, searchQuery, context }: ToolRenderProps) {
    const { args, output, result, entryId } = resolvedData
    const { isExpanded, toggleExpanded, copyToClipboard, disableSuccessStyle, t } = context
    const status = getToolRenderStatus(resolvedData)

    const [commandCopied, setCommandCopied] = useState(false)

    const command = args.command || ''
    const exitCode = result?.message?.exitCode
    const cancelled = result?.message?.cancelled

    const highlightedCommand = useMemo(() => {
      const highlighted = renderCodeHtml(command, language)
      return searchQuery
        ? highlightSearchInHTML(highlighted, searchQuery)
        : highlighted
    }, [command, searchQuery])

    const handleCopyCommand = async () => {
      try {
        await copyToClipboard(command)
        setCommandCopied(true)
        setTimeout(() => setCommandCopied(false), 2000)
      } catch (err) {
        console.error(`Failed to copy ${tool} command:`, err)
      }
    }

    return (
      <div className={`tool-execution ${getToolExecutionClass(resolvedData, disableSuccessStyle)}`} id={`entry-${entryId}`}>
        <ToolHeader
          className={headerClass}
          expandable={Boolean(command || output)}
          expanded={isExpanded}
          onToggle={toggleExpanded}
          ariaLabel={`${tool}: ${getToolStatusLabel(status, t)}`}
          actions={
            <button
              type="button"
              onClick={() => void handleCopyCommand()}
              className="tool-copy-button bash-inline-copy-button"
              aria-label={commandCopied ? 'Copied!' : 'Copy command'}
            >
              {commandCopied ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          }
        >
          <span className="tool-expand-indicator">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="bash-command-inline" title={command}>
            <span className="bash-command-prefix" aria-hidden="true">{prompt}</span>
            <code
              className={`shiki language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedCommand }}
            />
          </span>

          {exitCode !== undefined && exitCode !== null && (
            <span
              className="tool-detail"
              style={{ color: exitCode === 0 ? 'var(--success)' : 'var(--error)' }}
            >
              exit {exitCode}
            </span>
          )}

          {cancelled && (
            <span className="tool-detail" style={{ color: 'var(--warning)' }}>
              cancelled
            </span>
          )}

          <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
        </ToolHeader>

        {command && isExpanded && (
          <div className="tool-command-detail">
            <ToolSectionHeader
              label={t('components.toolCall.command', 'Command')}
              text={command}
              copyText={copyToClipboard}
            />
            <pre className="tool-command-expanded">
              <code
                className={`shiki language-${language}`}
                dangerouslySetInnerHTML={{ __html: highlightedCommand }}
              />
            </pre>
          </div>
        )}

        {output && (
          <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
            <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
              {isExpanded && (
                <>
                  <ToolSectionHeader
                    label={t('components.toolCall.output', 'Output')}
                    text={output}
                    copyText={copyToClipboard}
                  />
                  <CodeBlock
                    code={output}
                    language={outputLanguage}
                    showLineNumbers={true}
                    scrollable
                    maxHeight={OUTPUT_MAX_HEIGHT}
                    searchQuery={searchQuery}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
}

/**
 * Generate search segments for a shell tool
 * Includes highlighted command and output
 */
function createShellSearchSegments(variant: ShellToolVariant) {
  return function getShellSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
    const segments: string[] = []

    if (resolvedData.args.command) {
      segments.push(renderCodeHtml(String(resolvedData.args.command), variant.language))
    }

    if (resolvedData.output) {
      segments.push(renderCodeHtml(resolvedData.output, variant.outputLanguage))
    }

    return segments
  }
}

function createShellPreview(variant: ShellToolVariant) {
  return function getShellPreview(_toolCall: Content, data: ResolvedToolData): string {
    const cmd = data.args.command || ''
    const trimmed = cmd.length > 50 ? `${cmd.slice(0, 50)}...` : cmd
    return `${variant.prompt}${trimmed}`
  }
}

function createShellPlugin(variant: ShellToolVariant): ToolRenderPlugin {
  return {
    id: `builtin-${variant.tool}`,
    name: variant.tool === 'powershell' ? 'PowerShell' : 'Bash',
    match: variant.tool,
    priority: 100,
    component: createShellExecution(variant),
    resolveData: defaultResolveData,
    getSearchSegments: createShellSearchSegments(variant),
    getPreview: createShellPreview(variant),
  }
}

/** Bash tool render plugin definition */
export const bashToolPlugin = createShellPlugin(BASH_VARIANT)

/** PowerShell tool render plugin definition */
export const powershellToolPlugin = createShellPlugin(POWERSHELL_VARIANT)

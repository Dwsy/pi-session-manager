import { MultiFileDiff, type FileContents } from '@pierre/diffs/react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml } from '../utils/markdown'
import { shortenPath, formatDate } from '../utils/format'

interface EditExecutionProps {
  filePath: string
  diff?: string
  output?: string
  timestamp?: string
  expanded?: boolean
}

export default function EditExecution({
  filePath,
  diff,
  output,
  timestamp,
  expanded = false,
}: EditExecutionProps) {
  const { t } = useTranslation()
  const [localExpanded, setLocalExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const displayPath = shortenPath(filePath)

  useEffect(() => {
    setLocalExpanded(expanded)
  }, [expanded])

  // 复制 diff 内容到剪贴板
  const copyDiffToClipboard = async () => {
    if (!diff) return
    
    try {
      await navigator.clipboard.writeText(diff)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy diff to clipboard', err)
    }
  }

  // 解析 Pi 的 diff 格式并提取 oldText 和 newText
  const parsePiDiff = (diffText: string): { oldText: string; newText: string } | null => {
    if (!diffText) return null

    try {
      const lines = diffText.split('\n')
      const oldLines: string[] = []
      const newLines: string[] = []

      for (const line of lines) {
        // 跳过省略标记
        if (line.trim() === '...') {
          continue
        }
        
        if (line.trim() === '') {
          // 空行也要保留
          oldLines.push('')
          newLines.push('')
          continue
        }

        // 匹配行号格式：
        // "  39 content" - 上下文行（无标记）
        // "- 43 content" - 删除的行
        // "+ 43 content" - 添加的行
        // 注意：行号后面可能直接跟内容，也可能有空格
        const lineMatch = line.match(/^([+-]?)\s*\d+\s+(.*)$/)
        
        if (lineMatch) {
          const [, marker, content] = lineMatch
          
          if (marker === '-') {
            // 删除的行：只在 oldText 中
            oldLines.push(content)
          } else if (marker === '+') {
            // 添加的行：只在 newText 中
            newLines.push(content)
          } else {
            // 上下文行：在两边都有
            oldLines.push(content)
            newLines.push(content)
          }
        } else {
          // 如果不匹配行号格式，可能是纯内容行，作为上下文处理
          oldLines.push(line)
          newLines.push(line)
        }
      }

      return {
        oldText: oldLines.join('\n'),
        newText: newLines.join('\n')
      }
    } catch (error) {
      console.error('Error parsing Pi diff:', error)
      return null
    }
  }

  // 渲染 diff
  const renderDiff = () => {
    if (!diff) return null

    const parsed = parsePiDiff(diff)
    
    if (!parsed) {
      console.warn('Failed to parse diff, showing raw content')
      return (
        <div className="tool-output">
          <div style={{ 
            backgroundColor: 'var(--code-bg, #1e1e1e)',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto'
          }}>
            <pre style={{ 
              margin: 0,
              whiteSpace: 'pre-wrap', 
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              color: 'var(--code-fg, #d4d4d4)'
            }}>
              {diff}
            </pre>
          </div>
        </div>
      )
    }

    try {
      const fileName = filePath.split('/').pop() || 'file'
      
      const oldFile: FileContents = {
        name: fileName,
        contents: parsed.oldText,
      }

      const newFile: FileContents = {
        name: fileName,
        contents: parsed.newText,
      }
      
      return (
        <div className="tool-diff">
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: { dark: 'pierre-dark', light: 'pierre-light' },
              themeType: 'dark',
              diffStyle: 'split',
              overflow: 'wrap',
            }}
          />
        </div>
      )
    } catch (error) {
      console.error('Error rendering MultiFileDiff:', error)
      console.log('Parsed content:', parsed)
      
      // 降级显示：彩色文本
      return (
        <div className="tool-output">
          <div style={{ 
            backgroundColor: 'var(--code-bg, #1e1e1e)',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto'
          }}>
            <pre style={{ 
              margin: 0,
              whiteSpace: 'pre-wrap', 
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              color: 'var(--code-fg, #d4d4d4)'
            }}>
              {diff.split('\n').map((line, i) => {
                let color = 'inherit'
                let bgColor = 'transparent'
                
                if (line.match(/^\s*-\s*\d+/)) {
                  color = '#f85149'
                  bgColor = 'rgba(248, 81, 73, 0.1)'
                } else if (line.match(/^\s*\+\s*\d+/)) {
                  color = '#3fb950'
                  bgColor = 'rgba(63, 185, 80, 0.1)'
                }
                
                return (
                  <div 
                    key={i} 
                    style={{ 
                      color, 
                      backgroundColor: bgColor,
                      padding: '0 4px'
                    }}
                  >
                    {line || ' '}
                  </div>
                )
              })}
            </pre>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="tool-execution success">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="tool-header">
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit
        </span>
        <span className="tool-path">{escapeHtml(displayPath)}</span>
      </div>

      {diff && (
        <div className="tool-diff-wrapper">
          <div className="tool-diff-actions">
            <button
              onClick={() => setLocalExpanded(!localExpanded)}
              className="tool-action-button"
              title={localExpanded ? t('components.editExecution.collapse') : t('components.editExecution.expand')}
            >
              {localExpanded ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
            <button
              onClick={copyDiffToClipboard}
              className="tool-action-button"
              title={copied ? t('components.editExecution.copied') : t('components.editExecution.copyDiff')}
            >
              {copied ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          {localExpanded && renderDiff()}
        </div>
      )}

      {output && (
        <div className="tool-output">
          <div>{escapeHtml(output)}</div>
        </div>
      )}

      {!diff && !output && (
        <div className="tool-output" style={{ color: '#6a6f85', fontStyle: 'italic' }}>
          {t('components.editExecution.noChanges')}
        </div>
      )}
    </div>
  )
}
